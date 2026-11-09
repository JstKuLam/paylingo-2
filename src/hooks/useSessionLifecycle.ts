'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { claimLegacyLocalData, db, LocalSession, LocalTranscriptEntry } from '@/lib/db'
import { syncPendingData } from '@/lib/sync-manager'
import { authClient } from '@/lib/auth-client'
import { stringToUUID, type TranscriptMessage } from '@/lib/soniox-parser'

interface UseSessionLifecycleProps {
  partnerLang: string
  isActive: boolean
  isPaused?: boolean
  elapsedSeconds?: number
  messages: TranscriptMessage[]
  stopRecording: () => Promise<void>
  silenceAlertMessage?: string
}

export function useSessionLifecycle({
  partnerLang,
  isActive,
  isPaused = false,
  elapsedSeconds = 0,
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
  const forceStopTimerRef = useRef<NodeJS.Timeout | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const activeSessionRef = useRef<string | null>(null)
  const stopRecordingRef = useRef(stopRecording)
  const silenceAlertMessageRef = useRef(silenceAlertMessage)
  const messagesRef = useRef(messages)
  const elapsedSecondsRef = useRef(elapsedSeconds)
  const savedFinalSignatureRef = useRef<Map<string, string>>(new Map())

  const flushFinalEntries = useCallback(async (targetSessionId: string, msgs: TranscriptMessage[]) => {
    if (!targetSessionId || msgs.length === 0) return
    try {
      const activeSession = await db.sessions.get(targetSessionId)
      if (!activeSession) return
      const rawStartTime = new Date(activeSession.started_at).getTime()
      const sessionStartedAt = Number.isFinite(rawStartTime) ? rawStartTime : Date.now()

      const finalEntries: LocalTranscriptEntry[] = msgs
        .filter((message) => message.is_final || Boolean(message.original_text.trim() || message.translated_text.trim()))
        .map((msg) => {
          const startMs = Number.isFinite(msg.start_ms) ? Math.max(0, msg.start_ms) : 0
          const endMs = Number.isFinite(msg.end_ms) ? Math.max(startMs, msg.end_ms) : startMs
          const createdAtTime = sessionStartedAt + startMs
          const validCreatedAt = Number.isFinite(createdAtTime)
            ? new Date(createdAtTime).toISOString()
            : new Date().toISOString()
          return {
            id: stringToUUID(`${targetSessionId}:${msg.id}`),
            session_id: targetSessionId,
            speaker: msg.speaker,
            speaker_label: msg.speaker_label,
            original_text: msg.original_text,
            translated_text: msg.translated_text,
            start_ms: startMs,
            end_ms: endMs,
            created_at: validCreatedAt,
            sync_status: 'pending',
            updated_at: new Date().toISOString(),
          }
        })

      if (finalEntries.length === 0) return
      const existingEntries = await db.transcriptEntries.bulkGet(finalEntries.map((entry) => entry.id))
      const changedEntries = finalEntries.flatMap((entry, index) => {
        const existing = existingEntries[index]
        const hasChanged =
          !existing ||
          existing.original_text !== entry.original_text ||
          existing.translated_text !== entry.translated_text ||
          existing.end_ms !== entry.end_ms ||
          existing.speaker_label !== entry.speaker_label
        return hasChanged ? [{ ...entry, created_at: existing?.created_at || entry.created_at }] : []
      })
      if (changedEntries.length > 0) {
        await db.transcriptEntries.bulkPut(changedEntries)
      }
    } catch (err) {
      console.warn('Failed to flush final transcript entries:', err)
    }
  }, [])

  const clearSilenceTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (forceStopTimerRef.current) {
      clearTimeout(forceStopTimerRef.current)
      forceStopTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    stopRecordingRef.current = stopRecording
  }, [stopRecording])

  useEffect(() => {
    silenceAlertMessageRef.current = silenceAlertMessage
  }, [silenceAlertMessage])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds
  }, [elapsedSeconds])

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
              const entries = await db.transcriptEntries.where('session_id').equals(sess.id).toArray()
              if (entries.length === 0 && (sess.duration_seconds || 0) === 0) {
                await db.sessions.delete(sess.id)
                if (typeof navigator !== 'undefined' && navigator.onLine) {
                  fetch('/api/history', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ table: 'sessions', field: 'id', value: sess.id }),
                  }).catch(() => {})
                }
                continue
              }
              const startTime = new Date(sess.started_at).getTime()
              const validStart = Number.isFinite(startTime) ? startTime : Date.now()
              const maxEntryEndMs = entries.reduce((max, e) => Math.max(max, e.end_ms || 0), 0)
              const updatedAtTime = sess.updated_at ? new Date(sess.updated_at).getTime() : NaN
              const wallClockFromUpdated =
                Number.isFinite(updatedAtTime) && updatedAtTime > validStart
                  ? Math.min(7200, Math.floor((updatedAtTime - validStart) / 1000))
                  : 0
              const durationSeconds = Math.max(
                sess.duration_seconds || 0,
                Math.ceil(maxEntryEndMs / 1000),
                wallClockFromUpdated
              )
              const endedAtIso =
                maxEntryEndMs > 0
                  ? new Date(validStart + maxEntryEndMs).toISOString()
                  : Number.isFinite(updatedAtTime)
                    ? new Date(updatedAtTime).toISOString()
                    : now
              await db.sessions.update(sess.id, {
                ended_at: endedAtIso,
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
      clearSilenceTimers()
      const sid = activeSessionRef.current
      if (sid) {
        activeSessionRef.current = null
        const now = new Date().toISOString()
        const snapshotMessages = messagesRef.current
        const snapshotElapsed = elapsedSecondsRef.current
        void (async () => {
          const savedCount = await db.transcriptEntries.where('session_id').equals(sid).count()
          if (snapshotMessages.length === 0 && savedCount === 0) {
            await db.sessions.delete(sid)
            return
          }
          await flushFinalEntries(sid, snapshotMessages)
          const session = await db.sessions.get(sid)
          if (session && session.ended_at === null) {
            const startTime = new Date(session.started_at).getTime()
            const validStart = Number.isFinite(startTime) ? startTime : Date.now()
            const wallClock = Math.max(0, Math.floor((Date.now() - validStart) / 1000))
            const effectiveElapsed = snapshotElapsed > 0 ? Math.min(wallClock, snapshotElapsed) : wallClock
            const latestEntryMs = messagesRef.current.reduce((max, msg) => Math.max(max, msg.end_ms || 0), 0)
            const durationFromEntries = Math.ceil(latestEntryMs / 1000)
            const duration = Math.max(
              Number.isFinite(session.duration_seconds) ? session.duration_seconds : 0,
              effectiveElapsed,
              durationFromEntries
            )
            await db.sessions.update(sid, {
              ended_at: now,
              duration_seconds: duration,
              sync_status: 'pending',
              updated_at: now,
            })
          }
          await syncPendingData()
        })().catch((err) => {
          console.error('Failed to close session on unmount:', err)
        })
      }
    }
  }, [clearSilenceTimers, flushFinalEntries])

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
      } catch (err) {
        console.error('Failed to release Wake Lock:', err)
      } finally {
        wakeLockRef.current = null
      }
    }
  }, [])

  // Automatically finalize session if recording becomes inactive unexpectedly
  const wasActiveRef = useRef(false)
  useEffect(() => {
    if (wasActiveRef.current && !isActive && activeSessionRef.current) {
      clearSilenceTimers()
      const sid = activeSessionRef.current
      const snapshotMessages = messagesRef.current
      const snapshotElapsed = elapsedSecondsRef.current
      activeSessionRef.current = null
      setSessionId(null)
      const now = new Date().toISOString()
      void flushFinalEntries(sid, snapshotMessages).then(async () => {
        const savedCount = await db.transcriptEntries.where('session_id').equals(sid).count()
        if (snapshotMessages.length === 0 && savedCount === 0) {
          await db.sessions.delete(sid)
          return null
        }
        return db.sessions.get(sid)
      }).then((session) => {
        if (session && session.ended_at === null) {
          const startTime = new Date(session.started_at).getTime()
          const validStart = Number.isFinite(startTime) ? startTime : Date.now()
          const wallClock = Math.max(0, Math.floor((Date.now() - validStart) / 1000))
          const effectiveElapsed = snapshotElapsed > 0 ? Math.min(wallClock, snapshotElapsed) : wallClock
          const latestEntryMs = messagesRef.current.reduce((max, msg) => Math.max(max, msg.end_ms || 0), 0)
          const durationFromEntries = Math.ceil(latestEntryMs / 1000)
          const duration = Math.max(
            Number.isFinite(session.duration_seconds) ? session.duration_seconds : 0,
            effectiveElapsed,
            durationFromEntries
          )
          return db.sessions.update(sid, {
            ended_at: now,
            duration_seconds: duration,
            sync_status: 'pending',
            updated_at: now,
          })
        }
      }).then(() => {
        syncPendingData()
      }).catch((err) => {
        console.warn('Failed to finalize session after unexpected stop:', err)
      })
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {})
        wakeLockRef.current = null
      }
    }
    wasActiveRef.current = isActive
  }, [isActive, clearSilenceTimers, flushFinalEntries])

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
  const startSession = useCallback(async (langName: string, sessionPrefix = 'Hội thoại') => {
    const { data: { session } } = await authClient.getSession()
    const username = session?.user?.user_metadata?.username ||
                     session?.user?.user_metadata?.full_name ||
                     session?.user?.user_metadata?.name ||
                     session?.user?.email?.split('@')[0]
    const ownerId = session?.user?.id
    
    if (!session || !username || !ownerId) {
      throw new Error('Unauthenticated')
    }

    // If an earlier session was left unclosed, finalize it first
    if (activeSessionRef.current) {
      const prevSid = activeSessionRef.current
      const now = new Date().toISOString()
      try {
        const prevSession = await db.sessions.get(prevSid)
        if (prevSession && prevSession.ended_at === null) {
          const startTime = new Date(prevSession.started_at).getTime()
          const validStart = Number.isFinite(startTime) ? startTime : Date.now()
          const duration = Math.max(
            Number.isFinite(prevSession.duration_seconds) ? prevSession.duration_seconds : 0,
            Math.max(0, Math.floor((Date.now() - validStart) / 1000))
          )
          await db.sessions.update(prevSid, {
            ended_at: now,
            duration_seconds: duration,
            sync_status: 'pending',
            updated_at: now,
          })
        }
      } catch (err) {
        console.warn('Failed to close previous dangling session:', err)
      }
    }

    const newSessionId = crypto.randomUUID()
    savedFinalSignatureRef.current.clear()
    
    // Auto-name: Hội thoại [Lang] - YYYY-MM-DD HH:mm
    const dateStr = new Date().toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(',', '')
    
    const sessionName = `${sessionPrefix} - ${langName} - ${dateStr}`

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

    return newSessionId
  }, [partnerLang, requestWakeLock])

  // 3. Stop Session Lifecycle
  const stopSession = useCallback(async (explicitElapsedSeconds?: number) => {
    clearSilenceTimers()

    const currentSessionId = activeSessionRef.current
    const snapshotMessages = messagesRef.current
    const effectiveElapsed =
      typeof explicitElapsedSeconds === 'number' && explicitElapsedSeconds > 0
        ? explicitElapsedSeconds
        : elapsedSecondsRef.current
    activeSessionRef.current = null
    setSessionId(null)
    setSilenceWarning(false)

    if (currentSessionId) {
      try {
        await flushFinalEntries(currentSessionId, snapshotMessages)
        const savedCount = await db.transcriptEntries.where('session_id').equals(currentSessionId).count()
        if (snapshotMessages.length === 0 && savedCount === 0) {
          await db.sessions.delete(currentSessionId)
        } else {
          const now = new Date().toISOString()
          const activeSession = await db.sessions.get(currentSessionId)
          const rawStartTime = activeSession ? new Date(activeSession.started_at).getTime() : NaN
          const validStart = Number.isFinite(rawStartTime) ? rawStartTime : Date.now()
          const wallClockDuration = Math.max(0, Math.floor((Date.now() - validStart) / 1000))
          const computedDuration =
            effectiveElapsed > 0
              ? Math.min(wallClockDuration, effectiveElapsed)
              : wallClockDuration
          const latestEntryMs = snapshotMessages.reduce((max, m) => Math.max(max, m.end_ms || 0), 0)
          const durationFromEntries = Math.ceil(latestEntryMs / 1000)
          const durationSeconds = activeSession
            ? Math.max(
                Number.isFinite(activeSession.duration_seconds) ? activeSession.duration_seconds : 0,
                computedDuration,
                durationFromEntries
              )
            : Math.max(computedDuration, durationFromEntries)
          await db.sessions.update(currentSessionId, {
            ended_at: now,
            duration_seconds: durationSeconds,
            sync_status: 'pending',
            updated_at: now
          })
        }
      } catch (err) {
        console.warn('Failed to update session upon stop:', err)
      }
    }

    // Release Wake Lock
    await releaseWakeLock()

    // Sync everything
    void syncPendingData()
  }, [releaseWakeLock, clearSilenceTimers, flushFinalEntries])

  // Abort an unstarted or failed session to prevent ghost records
  const abortSession = useCallback(async () => {
    clearSilenceTimers()

    const currentSessionId = activeSessionRef.current
    activeSessionRef.current = null
    setSessionId(null)
    setSilenceWarning(false)

    if (currentSessionId) {
      try {
        await db.sessions.delete(currentSessionId)
        await db.transcriptEntries.where('session_id').equals(currentSessionId).delete()
      } catch (err) {
        console.warn('Failed to clean up aborted session:', err)
      }
    }

    await releaseWakeLock()
  }, [releaseWakeLock, clearSilenceTimers])

  // 4. Autosave active messages to local IndexedDB (Dexie)
  useEffect(() => {
    if (!sessionId || messages.length === 0) return

    const saveMessages = async () => {
      try {
        const candidateMessages = messages.filter((message) => {
          if (!message.is_final) return false
          const sig = `${message.original_text}|${message.translated_text}|${message.end_ms}|${message.speaker_label || ''}`
          return savedFinalSignatureRef.current.get(message.id) !== sig
        })
        if (candidateMessages.length === 0) return

        const activeSession = await db.sessions.get(sessionId)
        if (!activeSession) return
        const rawStartTime = new Date(activeSession.started_at).getTime()
        const sessionStartedAt = Number.isFinite(rawStartTime) ? rawStartTime : Date.now()

        const localEntries: LocalTranscriptEntry[] = candidateMessages.map(msg => {
          const startMs = Number.isFinite(msg.start_ms) ? Math.max(0, msg.start_ms) : 0
          const endMs = Number.isFinite(msg.end_ms) ? Math.max(startMs, msg.end_ms) : startMs
          const createdAtTime = sessionStartedAt + startMs
          const validCreatedAt = Number.isFinite(createdAtTime) ? new Date(createdAtTime).toISOString() : new Date().toISOString()
          return {
            id: stringToUUID(`${sessionId}:${msg.id}`),
            session_id: sessionId,
            speaker: msg.speaker,
            speaker_label: msg.speaker_label,
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
            || existing.speaker_label !== entry.speaker_label
          return hasChanged ? [{ ...entry, created_at: existing?.created_at || entry.created_at }] : []
        })

        if (activeSessionRef.current !== sessionId) return

        if (changedEntries.length > 0) {
          await db.transcriptEntries.bulkPut(changedEntries)
        }
        for (const msg of candidateMessages) {
          const sig = `${msg.original_text}|${msg.translated_text}|${msg.end_ms}|${msg.speaker_label || ''}`
          savedFinalSignatureRef.current.set(msg.id, sig)
        }
      } catch (err) {
        console.warn('Failed to autosave transcript entries:', err)
      }
    }

    saveMessages()
  }, [messages, sessionId])

  const latestMessageMarker = useMemo(() => {
    const latestMessage = messages.at(-1)
    return latestMessage
      ? `${messages.length}:${latestMessage.id}:${latestMessage.end_ms}:${latestMessage.is_final}:${latestMessage.original_text.length}:${latestMessage.translated_text.length}`
      : ''
  }, [messages])

  // Reset silence warning on token stream updates using React's recommended state adjustment pattern
  const [prevMarker, setPrevMarker] = useState(latestMessageMarker)
  if (latestMessageMarker !== prevMarker) {
    setPrevMarker(latestMessageMarker)
    if (silenceWarning) {
      setSilenceWarning(false)
    }
  }

  // 5. Silence & inactivity monitoring (5-minute cap)
  useEffect(() => {
    if (!isActive || isPaused || !sessionId) {
      clearSilenceTimers()
      return
    }

    clearSilenceTimers()

    // Warning at 4 minutes of silence (240 seconds)
    silenceTimerRef.current = setTimeout(() => {
      setSilenceWarning(true)

      // Force stop at 5 minutes of silence (300 seconds)
      forceStopTimerRef.current = setTimeout(async () => {
        try {
          await stopRecordingRef.current()
        } catch (err) {
          console.warn('Error during silence timeout stopRecording:', err)
        }
        try {
          await stopSession()
        } catch (err) {
          console.warn('Error during silence timeout stopSession:', err)
        }
        if (typeof window !== 'undefined' && typeof window.alert === 'function' && document.visibilityState === 'visible') {
          try {
            window.alert(silenceAlertMessageRef.current || 'Hội thoại đã tự động kết thúc do 5 phút không hoạt động để tránh hao tổn phí API.')
          } catch {}
        }
      }, 60000)

    }, 240000)

    return () => {
      clearSilenceTimers()
    }
  }, [isActive, isPaused, sessionId, latestMessageMarker, stopSession, clearSilenceTimers])

  return {
    sessionId,
    silenceWarning: isActive && !isPaused && Boolean(sessionId) && silenceWarning,
    wakeLockError,
    offlineIndicator,
    startSession,
    stopSession,
    abortSession,
  }
}
