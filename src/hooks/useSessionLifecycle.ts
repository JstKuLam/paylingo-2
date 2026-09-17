'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { claimLegacyLocalData, db, LocalSession, LocalTranscriptEntry } from '@/lib/db'
import { syncPendingData } from '@/lib/sync-manager'
import { authClient } from '@/lib/auth-client'
import { stringToUUID, type TranscriptMessage } from '@/lib/soniox-parser'

interface UseSessionLifecycleProps {
  partnerLang: string
  isActive: boolean
  messages: TranscriptMessage[]
  stopRecording: () => Promise<void>
  silenceAlertMessage?: string
}

export function useSessionLifecycle({
  partnerLang,
  isActive,
  messages,
  stopRecording,
  silenceAlertMessage,
}: UseSessionLifecycleProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [silenceWarning, setSilenceWarning] = useState(false)
  const [wakeLockError, setWakeLockError] = useState(false)
  const [offlineIndicator, setOfflineIndicator] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine
  )

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const activeSessionRef = useRef<string | null>(null)
  const stopRecordingRef = useRef(stopRecording)
  const silenceAlertMessageRef = useRef(silenceAlertMessage)

  useEffect(() => {
    stopRecordingRef.current = stopRecording
  }, [stopRecording])

  useEffect(() => {
    silenceAlertMessageRef.current = silenceAlertMessage
  }, [silenceAlertMessage])

  // Track network online status
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const updateOnlineStatus = () => {
      setOfflineIndicator(!navigator.onLine)
      if (navigator.onLine) {
        syncPendingData()
      }
    }

    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  // Auto-close any abandoned sessions belonging to this user on mount (handling browser hard close)
  useEffect(() => {
    const autoCloseAbandonedSessions = async () => {
      try {
        const { data: { session } } = await authClient.getSession()
        const username = session?.user?.user_metadata?.username ||
                         session?.user?.user_metadata?.full_name ||
                         session?.user?.user_metadata?.name ||
                         session?.user?.email?.split('@')[0]
        const ownerId = session?.user?.id
        const legacyUsername = session?.user?.email?.split('@')[0]

        if (username && legacyUsername && ownerId) {
          await claimLegacyLocalData(ownerId, legacyUsername)
          const abandonedSessions = await db.sessions
            .where('owner_id')
            .equals(ownerId)
            .toArray()
            
          const now = new Date().toISOString()
          for (const sess of abandonedSessions) {
            if (sess.ended_at === null) {
              if (activeSessionRef.current && sess.id === activeSessionRef.current) continue
              const startTime = new Date(sess.started_at).getTime()
              const validStart = Number.isFinite(startTime) ? startTime : Date.now()
              const durationSeconds = Math.max(
                sess.duration_seconds || 0,
                Math.max(0, Math.floor((Date.now() - validStart) / 1000))
              )
              await db.sessions.update(sess.id, {
                ended_at: now,
                duration_seconds: durationSeconds,
                sync_status: 'pending',
                updated_at: now
              })
            }
          }
          syncPendingData()
        }
      } catch (err) {
        console.warn('Failed to auto-close abandoned sessions:', err)
      }
    }
    autoCloseAbandonedSessions()
  }, [])

  // Clean up wakeLock and close session on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {})
        wakeLockRef.current = null
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      const sid = activeSessionRef.current
      if (sid) {
        activeSessionRef.current = null
        const now = new Date().toISOString()
        void db.sessions.get(sid).then((session) => {
          if (session && session.ended_at === null) {
            const startTime = new Date(session.started_at).getTime()
            const validStart = Number.isFinite(startTime) ? startTime : Date.now()
            const duration = Math.max(0, Math.floor((Date.now() - validStart) / 1000))
            return db.sessions.update(sid, {
              ended_at: now,
              duration_seconds: duration,
              sync_status: 'pending',
              updated_at: now,
            })
          }
        }).catch((err) => {
          console.error('Failed to close session on unmount:', err)
        })
      }
    }
  }, [])

  // 1. Wake Lock API Integration
  const requestWakeLock = useCallback(async () => {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) {
      setWakeLockError(true)
      return
    }

    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
      setWakeLockError(false)
    } catch (err) {
      console.warn('Failed to acquire Wake Lock:', err)
      setWakeLockError(true)
    }
  }, [])

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release()
        wakeLockRef.current = null
      } catch (err) {
        console.error('Failed to release Wake Lock:', err)
      }
    }
  }, [])

  // Handle automatic re-acquisition on tab visibility changes
  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibilityChange = async () => {
      if (isActive && document.visibilityState === 'visible') {
        await requestWakeLock()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isActive, requestWakeLock])

  // 2. Start Session Lifecycle
  const startSession = useCallback(async (langName: string) => {
    const { data: { session } } = await authClient.getSession()
    const username = session?.user?.user_metadata?.username ||
                     session?.user?.user_metadata?.full_name ||
                     session?.user?.user_metadata?.name ||
                     session?.user?.email?.split('@')[0]
    const ownerId = session?.user?.id
    
    if (!session || !username || !ownerId) {
      throw new Error('Unauthenticated')
    }

    const newSessionId = crypto.randomUUID()
    
    // Auto-name: Hội thoại [Lang] - YYYY-MM-DD HH:mm
    const dateStr = new Date().toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(',', '')
    
    const sessionName = `Hội thoại - ${langName} - ${dateStr}`

    const newLocalSession: LocalSession = {
      id: newSessionId,
      owner_id: ownerId,
      username: username,
      name: sessionName,
      partner_language: partnerLang,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_seconds: 0,
      sync_status: 'pending',
      updated_at: new Date().toISOString()
    }

    // Save to local DB
    await db.sessions.put(newLocalSession)
    
    setSessionId(newSessionId)
    activeSessionRef.current = newSessionId
    setSilenceWarning(false)

    // Request Wake Lock
    await requestWakeLock()

    // Sync in background immediately
    void syncPendingData()

    return newSessionId
  }, [partnerLang, requestWakeLock])

  // 3. Stop Session Lifecycle
  const stopSession = useCallback(async () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    const currentSessionId = activeSessionRef.current
    activeSessionRef.current = null
    setSessionId(null)
    setSilenceWarning(false)

    if (currentSessionId) {
      try {
        const now = new Date().toISOString()
        const activeSession = await db.sessions.get(currentSessionId)
        const durationSeconds = activeSession
          ? Math.max(
              activeSession.duration_seconds,
              Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000)
            )
          : 0
        await db.sessions.update(currentSessionId, {
          ended_at: now,
          duration_seconds: durationSeconds,
          sync_status: 'pending',
          updated_at: now
        })
      } catch (err) {
        console.warn('Failed to update session upon stop:', err)
      }
    }

    // Release Wake Lock
    await releaseWakeLock()

    // Sync everything
    void syncPendingData()
  }, [releaseWakeLock])

  // 4. Autosave active messages to local IndexedDB (Dexie)
  useEffect(() => {
    if (!sessionId || messages.length === 0) return

    const saveMessages = async () => {
      try {
        const activeSession = await db.sessions.get(sessionId)
        if (!activeSession) return
        const rawStartTime = new Date(activeSession.started_at).getTime()
        const sessionStartedAt = Number.isFinite(rawStartTime) ? rawStartTime : Date.now()

        const localEntries: LocalTranscriptEntry[] = messages.filter((message) => message.is_final).map(msg => {
          const startMs = Number.isFinite(msg.start_ms) ? Math.max(0, msg.start_ms) : 0
          const endMs = Number.isFinite(msg.end_ms) ? Math.max(startMs, msg.end_ms) : startMs
          const createdAtTime = sessionStartedAt + startMs
          const validCreatedAt = Number.isFinite(createdAtTime) ? new Date(createdAtTime).toISOString() : new Date().toISOString()
          return {
            id: stringToUUID(`${sessionId}:${msg.id}`),
            session_id: sessionId,
            speaker: msg.speaker,
            original_text: msg.original_text,
            translated_text: msg.translated_text,
            start_ms: startMs,
            end_ms: endMs,
            created_at: validCreatedAt,
            sync_status: 'pending',
            updated_at: new Date().toISOString()
          }
        })

        if (localEntries.length === 0) return

        const existingEntries = await db.transcriptEntries.bulkGet(localEntries.map((entry) => entry.id))
        const changedEntries = localEntries.flatMap((entry, index) => {
          const existing = existingEntries[index]
          const hasChanged = !existing
            || existing.original_text !== entry.original_text
            || existing.translated_text !== entry.translated_text
            || existing.end_ms !== entry.end_ms
          return hasChanged ? [{ ...entry, created_at: existing?.created_at || entry.created_at }] : []
        })

        if (changedEntries.length > 0) {
          await db.transcriptEntries.bulkPut(changedEntries)
        }
      } catch (err) {
        console.warn('Failed to autosave transcript entries:', err)
      }
      
      // Note: We do not trigger syncPendingData() here because this useEffect runs 
      // on every intermediate transcription token (multiple times per second).
      // Background sync is handled by the 15-second timer in initAutoSync(),
      // and explicit sync runs on start/stop/visibility changes to conserve network egress.
    }

    saveMessages()
  }, [messages, sessionId])

  const latestMessageMarker = useMemo(() => {
    const latestMessage = messages.at(-1)
    return latestMessage ? `${latestMessage.id}:${latestMessage.end_ms}:${latestMessage.is_final}` : ''
  }, [messages])

  // 5. Silence & inactivity monitoring (5-minute cap)
  useEffect(() => {
    if (!isActive || !sessionId) return

    const resetSilenceTimers = () => {
      setSilenceWarning(false)

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)

      // Warning at 4 minutes of silence (240 seconds)
      silenceTimerRef.current = setTimeout(() => {
        setSilenceWarning(true)

        // Force stop at 5 minutes of silence (300 seconds)
        silenceTimerRef.current = setTimeout(async () => {
          await stopRecordingRef.current()
          await stopSession()
          alert(silenceAlertMessageRef.current || 'Hội thoại đã tự động kết thúc do 5 phút không hoạt động để tránh hao tổn phí API.')
        }, 60000)

      }, 240000)
    }

    // Reset timer on token stream updates (whenever messages length or content changes)
    resetSilenceTimers()

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }
  }, [isActive, sessionId, latestMessageMarker, stopSession])

  return {
    sessionId,
    silenceWarning,
    wakeLockError,
    offlineIndicator,
    startSession,
    stopSession
  }
}
