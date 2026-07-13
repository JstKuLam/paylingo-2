'use client'

import { useState, useEffect, useRef } from 'react'
import { db, LocalSession, LocalTranscriptEntry } from '@/lib/db'
import { syncPendingData } from '@/lib/sync-manager'
import { TranscriptMessage, stringToUUID } from '@/lib/soniox-parser'
import { createClient } from '@/lib/supabase/client'

interface UseSessionLifecycleProps {
  partnerLang: string
  isActive: boolean
  messages: TranscriptMessage[]
  stopRecording: () => Promise<void>
}

export function useSessionLifecycle({
  partnerLang,
  isActive,
  messages,
  stopRecording
}: UseSessionLifecycleProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [silenceWarning, setSilenceWarning] = useState(false)
  const [isMinutesExhausted, setIsMinutesExhausted] = useState(false)
  const [wakeLockError, setWakeLockError] = useState(false)
  const [offlineIndicator, setOfflineIndicator] = useState(false)

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null)
  const wakeLockRef = useRef<any | null>(null)
  const activeSessionRef = useRef<string | null>(null)

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
    setOfflineIndicator(!navigator.onLine)

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  // Auto-close any abandoned sessions belonging to this user on mount (handling browser hard close)
  useEffect(() => {
    const autoCloseAbandonedSessions = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const username = session?.user?.user_metadata?.username

      if (username) {
        const abandonedSessions = await db.sessions
          .where('username')
          .equals(username)
          .toArray()
          
        const now = new Date().toISOString()
        for (const sess of abandonedSessions) {
          if (sess.ended_at === null) {
            await db.sessions.update(sess.id, {
              ended_at: now,
              sync_status: 'pending',
              updated_at: now
            })
          }
        }
        syncPendingData()
      }
    }
    autoCloseAbandonedSessions()
  }, [])

  // 1. Wake Lock API Integration
  const requestWakeLock = async () => {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) {
      setWakeLockError(true)
      return
    }

    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
      setWakeLockError(false)
    } catch (err) {
      console.warn('Failed to acquire Wake Lock:', err)
      setWakeLockError(true)
    }
  }

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release()
        wakeLockRef.current = null
      } catch (err) {
        console.error('Failed to release Wake Lock:', err)
      }
    }
  }

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
  }, [isActive])

  // 2. Start Session Lifecycle
  const startSession = async (langName: string) => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const username = session?.user?.user_metadata?.username
    
    if (!session || !username) {
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
    setIsMinutesExhausted(false)

    // Request Wake Lock
    await requestWakeLock()

    // Start timer incrementing duration
    if (durationTimerRef.current) clearInterval(durationTimerRef.current)
    durationTimerRef.current = setInterval(async () => {
      if (activeSessionRef.current) {
        const localS = await db.sessions.get(activeSessionRef.current)
        if (localS) {
          const duration = localS.duration_seconds + 1
          await db.sessions.update(activeSessionRef.current, {
            duration_seconds: duration,
            sync_status: 'pending',
            updated_at: new Date().toISOString()
          })
          
          // Verify minute limits
          // Note: In a production app, we would query actual user usage or check with the database.
          // For MVP, we can simulate checking limits here if needed.
        }
      }
    }, 1000)

    // Sync in background immediately
    syncPendingData()

    return newSessionId
  }

  // 3. Stop Session Lifecycle
  const stopSession = async () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    if (activeSessionRef.current) {
      const now = new Date().toISOString()
      await db.sessions.update(activeSessionRef.current, {
        ended_at: now,
        sync_status: 'pending',
        updated_at: now
      })
    }

    // Release Wake Lock
    await releaseWakeLock()

    setSessionId(null)
    activeSessionRef.current = null
    setSilenceWarning(false)

    // Sync everything
    syncPendingData()
  }

  // 4. Autosave active messages to local IndexedDB (Dexie)
  useEffect(() => {
    if (!sessionId || messages.length === 0) return

    const saveMessages = async () => {
      const localEntries: LocalTranscriptEntry[] = messages.map(msg => ({
        id: stringToUUID(msg.id), // make a valid entry uuid/string
        session_id: sessionId,
        speaker: msg.speaker,
        original_text: msg.original_text,
        translated_text: msg.translated_text,
        start_ms: msg.start_ms,
        end_ms: msg.end_ms,
        created_at: new Date(msg.start_ms).toISOString(),
        sync_status: 'pending',
        updated_at: new Date().toISOString()
      }))

      // Write in bulk to Dexie
      await db.transcriptEntries.bulkPut(localEntries)
      
      // Auto-trigger sync periodically
      syncPendingData()
    }

    saveMessages()
  }, [messages, sessionId])

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
          await stopRecording()
          await stopSession()
          alert('Hội thoại đã tự động kết thúc do 5 phút không hoạt động để tránh hao tổn phí API.')
        }, 60000)

      }, 240000)
    }

    // Reset timer on token stream updates (whenever messages length or content changes)
    resetSilenceTimers()

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }
  }, [isActive, sessionId, messages])

  return {
    sessionId,
    silenceWarning,
    isMinutesExhausted,
    wakeLockError,
    offlineIndicator,
    startSession,
    stopSession
  }
}
