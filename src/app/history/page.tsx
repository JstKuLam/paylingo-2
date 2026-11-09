'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  CloudLightning,
  CornerDownRight,
  Download,
  Edit3,
  FileText,
  FolderOpen,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import AiSummaryProgress from '@/components/AiSummaryProgress'
import { claimLegacyLocalData, db, LocalFolder, LocalSession, LocalTranscriptEntry } from '@/lib/db'
import { authClient } from '@/lib/auth-client'
import { getPartnerLanguage } from '@/lib/languages'
import { syncPendingData } from '@/lib/sync-manager'
import {
  clearSummariesForTarget,
  getInFlightSummaryJob,
  getSavedSummary,
  getSavedSummaryBundle,
  hydrateSummariesFromCloud,
  runSummaryJob,
  subscribeSummaryStore,
  type SummaryStyle,
} from '@/lib/summary-store'
import { formatTimeline, scrollIntoViewAsync } from '@/lib/utils'
import { useLanguage } from '@/hooks/useLanguage'
import type { I18nTranslations } from '@/lib/i18n'

function formatDuration(totalSeconds: number, t: I18nTranslations) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  if (hours > 0) {
    return t.durationHoursMinutes.replace('{hours}', String(hours)).replace('{minutes}', String(minutes))
  }
  return t.durationMinutes.replace('{minutes}', String(minutes))
}

function formatDurationClock(totalSeconds: number) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const m = Math.floor(safeSeconds / 60)
  const s = safeSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getDateGroupLabel(isoDate: string, language: 'vi' | 'en' | 'zh' = 'vi'): string {
  const labels =
    language === 'en'
      ? { today: 'Today', yesterday: 'Yesterday', week: 'This week', earlier: 'Earlier' }
      : language === 'zh'
        ? { today: '今天', yesterday: '昨天', week: '本周', earlier: '更早' }
        : { today: 'Hôm nay', yesterday: 'Hôm qua', week: 'Tuần này', earlier: 'Trước đó' }
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return labels.earlier
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86_400_000
  const startOfWeek = startOfToday - 6 * 86_400_000
  const ts = date.getTime()
  if (ts >= startOfToday) return labels.today
  if (ts >= startOfYesterday) return labels.yesterday
  if (ts >= startOfWeek) return labels.week
  return labels.earlier
}

export default function HistoryPage() {
  const router = useRouter()
  const { language, t } = useLanguage()

  const [sessions, setSessions] = useState<LocalSession[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSessionId, setActiveSessionId] = useState<string>('')
  const [entries, setEntries] = useState<LocalTranscriptEntry[]>([])
  const [histStep, setHistStep] = useState<'list' | 'detail'>('list')
  const [detailTab, setDetailTab] = useState<'transcript' | 'ai'>('transcript')

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Session detail inline states
  const [renamingSession, setRenamingSession] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editOrigText, setEditOrigText] = useState('')
  const [editTransText, setEditTransText] = useState('')
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null)
  const detailScrollRef = useRef<HTMLDivElement>(null)
  const scrollOpIdRef = useRef(0)
  const highlightTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  // AI Summary states
  const [selectedStyle, setSelectedStyle] = useState<SummaryStyle>('standard')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiStartTimeMs, setAiStartTimeMs] = useState<number | undefined>(undefined)
  const [aiSummary, setAiSummary] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [, setSummaryStoreTick] = useState(0)

  useEffect(() => {
    return subscribeSummaryStore(() => {
      setSummaryStoreTick((n) => n + 1)
    })
  }, [])

  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await authClient.getUser()
      const currentOwnerId = user?.id
      const legacyUsername = user?.email?.split('@')[0]
      const name =
        user?.user_metadata?.username ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email?.split('@')[0]

      if (userError || !user || !name || !legacyUsername || !currentOwnerId) {
        router.replace('/')
        return
      }

      await claimLegacyLocalData(currentOwnerId, legacyUsername)

      const [localFolders, localSessions] = await Promise.all([
        db.folders.where('owner_id').equals(currentOwnerId).reverse().sortBy('created_at'),
        db.sessions.where('owner_id').equals(currentOwnerId).reverse().sortBy('started_at'),
      ])

      setSessions(localSessions)
      if (localSessions.length > 0) {
        setActiveSessionId((prev) => prev || localSessions[0].id)
      }
      setLoadError('')

      // Sync cloud sessions, folders, and saved AI summaries from Cloudflare D1
      const [foldersRes, sessionsRes, summariesRes] = await Promise.all([
        fetch('/api/history?table=folders')
          .then(async (r) => {
            if (!r.ok) return { items: [] }
            const ct = r.headers.get('content-type') || ''
            return ct.includes('application/json') ? r.json() : { items: [] }
          })
          .catch(() => ({ items: [] })),
        fetch('/api/history?table=sessions')
          .then(async (r) => {
            if (!r.ok) return { items: [] }
            const ct = r.headers.get('content-type') || ''
            return ct.includes('application/json') ? r.json() : { items: [] }
          })
          .catch(() => ({ items: [] })),
        fetch('/api/history?table=session_summaries')
          .then(async (r) => {
            if (!r.ok) return { items: [] }
            const ct = r.headers.get('content-type') || ''
            return ct.includes('application/json') ? r.json() : { items: [] }
          })
          .catch(() => ({ items: [] })),
      ])

      if (Array.isArray(summariesRes.items) && summariesRes.items.length > 0) {
        const groupedBySession = new Map<
          string,
          Array<{ style?: string; summary_text?: string; created_at?: string }>
        >()
        for (const row of summariesRes.items as Array<{
          session_id?: string | null
          style?: string
          summary_text?: string
          created_at?: string
        }>) {
          if (!row?.session_id) continue
          const list = groupedBySession.get(row.session_id) ?? []
          list.push(row)
          groupedBySession.set(row.session_id, list)
        }
        for (const [sessId, rows] of groupedBySession.entries()) {
          hydrateSummariesFromCloud({ sessionId: sessId }, rows)
        }
      }

      type CloudFolderRecord = {
        id: string
        owner_id?: string
        username?: string
        name: string
        created_at: string
        updated_at?: string
      }
      type CloudSessionRecord = {
        id: string
        owner_id?: string
        username?: string
        folder_id?: string | null
        name: string
        partner_language: string
        started_at: string
        ended_at: string
        duration_seconds: number
        updated_at?: string
      }

      const cloudFolders: LocalFolder[] = ((foldersRes.items as CloudFolderRecord[]) || [])
        .filter((f) => !f.owner_id || f.owner_id === currentOwnerId)
        .map((f) => ({
          id: f.id,
          owner_id: currentOwnerId,
          username: f.username || name,
          name: f.name,
          created_at: f.created_at,
          updated_at: f.updated_at || new Date().toISOString(),
          sync_status: 'synced',
        }))

      const cloudSessions: LocalSession[] = ((sessionsRes.items as CloudSessionRecord[]) || [])
        .filter((s) => !s.owner_id || s.owner_id === currentOwnerId)
        .map((s) => ({
          id: s.id,
          owner_id: currentOwnerId,
          username: s.username || name,
          folder_id: s.folder_id,
          name: s.name,
          partner_language: s.partner_language,
          started_at: s.started_at,
          ended_at: s.ended_at,
          duration_seconds: s.duration_seconds,
          sync_status: 'synced',
          updated_at: s.updated_at || new Date().toISOString(),
        }))

      const localPendingSessionIds = new Set(
        localSessions.filter((s) => s.sync_status !== 'synced').map((s) => s.id)
      )
      const localPendingFolderIds = new Set(
        localFolders.filter((f) => f.sync_status !== 'synced').map((f) => f.id)
      )

      const safeCloudFolders = cloudFolders.filter((f) => !localPendingFolderIds.has(f.id))
      const safeCloudSessions = cloudSessions.filter((s) => !localPendingSessionIds.has(s.id))

      if (safeCloudFolders.length > 0 || safeCloudSessions.length > 0) {
        await db.transaction('rw', db.folders, db.sessions, async () => {
          if (safeCloudFolders.length > 0) {
            await db.folders.bulkPut(safeCloudFolders)
          }
          if (safeCloudSessions.length > 0) {
            await db.sessions.bulkPut(safeCloudSessions)
          }
        })

        const updatedSessions = await db.sessions
          .where('owner_id')
          .equals(currentOwnerId)
          .reverse()
          .sortBy('started_at')
        setSessions(updatedSessions)
        if (updatedSessions.length > 0) {
          setActiveSessionId((prev) => prev || updatedSessions[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to load history:', error)
      setLoadError(error instanceof Error ? error.message : 'Error loading history.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadData])

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? null,
    [activeSessionId, sessions]
  )

  // Load transcript entries and restore saved/in-flight AI summary for the active session
  useEffect(() => {
    let cancelled = false

    const fetchEntries = async () => {
      await Promise.resolve()
      if (cancelled) return
      if (!activeSession?.id) {
        setEntries([])
        setAiSummary('')
        setAiLoading(false)
        setAiStartTimeMs(undefined)
        return
      }
      const currentId = activeSession.id
      setDetailTab('transcript')
      setRenamingSession(false)
      setEditingEntryId(null)
      setSummaryError('')

      // 1. Restore in-flight job or saved summary immediately from store (0ms)
      const inFlight = getInFlightSummaryJob({ sessionId: currentId })
      const savedEntry = getSavedSummary({ sessionId: currentId })
      if (inFlight) {
        setSelectedStyle(inFlight.style)
        setAiLoading(true)
        setAiStartTimeMs(inFlight.startedAtMs)
        const existingForStyle = getSavedSummary({ sessionId: currentId }, inFlight.style)
        setAiSummary(existingForStyle?.summary ?? '')
        void inFlight.promise
          .then((summaryText) => {
            if (!cancelled) {
              setAiSummary(summaryText)
              setAiLoading(false)
              setAiStartTimeMs(undefined)
            }
          })
          .catch((err) => {
            if (!cancelled) {
              setSummaryError(err instanceof Error ? err.message : t.summaryModalServiceError)
              setAiLoading(false)
              setAiStartTimeMs(undefined)
            }
          })
      } else if (savedEntry) {
        setSelectedStyle(savedEntry.style)
        setAiSummary(savedEntry.summary)
        setAiLoading(false)
        setAiStartTimeMs(undefined)
      } else {
        setAiSummary('')
        setAiLoading(false)
        setAiStartTimeMs(undefined)
      }

      try {
        const localEntries = await db.transcriptEntries
          .where('session_id')
          .equals(currentId)
          .sortBy('start_ms')
        if (!cancelled && localEntries.length > 0) {
          setEntries(localEntries)
          // If no local summary yet, check cloud summaries in background
          if (!savedEntry && !inFlight) {
            void fetch(
              `/api/history?table=session_summaries&sessionId=${encodeURIComponent(currentId)}`
            )
              .then(async (r) => (r.ok ? r.json() : { items: [] }))
              .then((res) => {
                if (cancelled || !Array.isArray(res.items) || res.items.length === 0) return
                hydrateSummariesFromCloud({ sessionId: currentId }, res.items)
                const hydrated = getSavedSummary({ sessionId: currentId })
                if (hydrated && !cancelled) {
                  setSelectedStyle(hydrated.style)
                  setAiSummary(hydrated.summary)
                }
              })
              .catch(() => {})
          }
          return
        }
        const cloudRes = await fetch(
          `/api/history?table=sessions&id=${encodeURIComponent(currentId)}&single=1`
        )
          .then(async (r) => {
            if (!r.ok) return {}
            const ct = r.headers.get('content-type') || ''
            return ct.includes('application/json') ? r.json() : {}
          })
          .catch(() => ({}))

        if (!cancelled && Array.isArray(cloudRes.summaries) && cloudRes.summaries.length > 0) {
          hydrateSummariesFromCloud({ sessionId: currentId }, cloudRes.summaries)
          const hydrated = getSavedSummary({ sessionId: currentId })
          if (hydrated && !getInFlightSummaryJob({ sessionId: currentId })) {
            setSelectedStyle(hydrated.style)
            setAiSummary(hydrated.summary)
          }
        }

        if (!cancelled && Array.isArray(cloudRes.entries)) {
          const formatted: LocalTranscriptEntry[] = cloudRes.entries.map(
            (entry: LocalTranscriptEntry) => ({
              ...entry,
              sync_status: 'synced' as const,
              updated_at: entry.updated_at || new Date().toISOString(),
            })
          )
          setEntries(formatted)
          if (formatted.length > 0) {
            await db.transcriptEntries.bulkPut(formatted)
          }
        }
      } catch (err) {
        console.warn('Failed to load entries for session:', err)
      }
    }
    void fetchEntries()
    return () => {
      cancelled = true
    }
  }, [activeSession?.id, t.summaryModalServiceError])

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()

  const visibleSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (!normalizedSearch) return true
      return session.name.toLocaleLowerCase().includes(normalizedSearch)
    })
  }, [normalizedSearch, sessions])

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, LocalSession[]>()
    for (const session of visibleSessions) {
      const lbl = getDateGroupLabel(session.started_at, language)
      const list = groups.get(lbl) ?? []
      list.push(session)
      groups.set(lbl, list)
    }
    return Array.from(groups.entries())
  }, [language, visibleSessions])

  const totalDuration = sessions.reduce((total, session) => {
    const dur = Number.isFinite(session.duration_seconds) ? session.duration_seconds : 0
    return total + Math.max(0, dur)
  }, 0)

  const handleSessionClick = (session: LocalSession) => {
    if (session.id !== activeSession?.id) {
      setDetailTab('transcript')
    }
    setActiveSessionId(session.id)
    setHistStep('detail')
  }

  const handleRenameSession = async () => {
    const cleanName = newSessionName.trim().slice(0, 200)
    if (!activeSession || !cleanName) return
    const now = new Date().toISOString()
    await db.sessions.update(activeSession.id, {
      name: cleanName,
      sync_status: 'pending',
      updated_at: now,
    })
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id ? { ...s, name: cleanName, sync_status: 'pending', updated_at: now } : s
      )
    )
    setRenamingSession(false)
    void syncPendingData()
  }

  const handleDeleteSession = async () => {
    if (!activeSession || !confirm(t.sessionDetailDeleteConfirm)) return
    try {
      const isOnline = typeof navigator === 'undefined' || navigator.onLine
      if (!isOnline) {
        throw new Error('Vui lòng kết nối mạng để xóa hội thoại.')
      }
      const res = await fetch('/api/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'sessions', field: 'id', value: activeSession.id }),
      })
      if (!res.ok) {
        throw new Error(t.sessionDetailDeleteServerError)
      }

      await db.transaction('rw', db.sessions, db.transcriptEntries, async () => {
        await db.transcriptEntries.where('session_id').equals(activeSession.id).delete()
        await db.sessions.delete(activeSession.id)
      })
      clearSummariesForTarget({ sessionId: activeSession.id })

      const remaining = sessions.filter((s) => s.id !== activeSession.id)
      setSessions(remaining)
      setActiveSessionId(remaining[0]?.id ?? '')
      setHistStep('list')
    } catch (error) {
      console.error('Failed to delete session:', error)
      setLoadError(error instanceof Error ? error.message : t.sessionDetailDeleteServerError)
    }
  }

  const startEditingEntry = (entry: LocalTranscriptEntry) => {
    setEditingEntryId(entry.id)
    setEditOrigText(entry.original_text)
    setEditTransText(entry.translated_text)
  }

  const handleSaveEntryEdit = async (entryId: string) => {
    if (!editOrigText.trim() && !editTransText.trim()) return
    const now = new Date().toISOString()
    const safeOrig = editOrigText.slice(0, 10_000)
    const safeTrans = editTransText.slice(0, 10_000)
    await db.transcriptEntries.update(entryId, {
      original_text: safeOrig,
      translated_text: safeTrans,
      sync_status: 'pending',
      updated_at: now,
    })
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              original_text: safeOrig,
              translated_text: safeTrans,
              sync_status: 'pending',
              updated_at: now,
            }
          : entry
      )
    )
    setEditingEntryId(null)
    void syncPendingData()
  }

  const handleExportSession = async (format: 'txt' | 'json' | 'md') => {
    if (!activeSession) return
    try {
      const languageName =
        getPartnerLanguage(activeSession.partner_language)?.name || activeSession.partner_language
      const { downloadSessionTXT, downloadSessionJSON, downloadSessionMarkdown } = await import(
        '@/lib/pdf-generator'
      )
      if (format === 'txt') {
        await downloadSessionTXT(activeSession.name, languageName, activeSession.started_at, entries)
      } else if (format === 'md') {
        await downloadSessionMarkdown(
          activeSession.name,
          languageName,
          activeSession.started_at,
          entries
        )
      } else {
        await downloadSessionJSON(
          activeSession.name,
          activeSession.partner_language,
          languageName,
          activeSession.started_at,
          entries
        )
      }
    } catch (error) {
      console.error('Failed to export session:', error)
    }
  }

  const handleAiSummarize = async (style: SummaryStyle = selectedStyle, force = false) => {
    if (!activeSession) return

    const targetSessionId = activeSession.id
    setSelectedStyle(style)
    setDetailTab('ai')
    setHistStep('detail')
    setSummaryError('')

    if (!force) {
      const cached = getSavedSummary({ sessionId: targetSessionId }, style)
      if (cached?.summary) {
        setAiSummary(cached.summary)
        setAiLoading(false)
        setAiStartTimeMs(undefined)
        return
      }
    }

    const existingInFlight = getInFlightSummaryJob({ sessionId: targetSessionId })
    const startMs = existingInFlight?.style === style ? existingInFlight.startedAtMs : Date.now()
    setAiLoading(true)
    setAiStartTimeMs(startMs)

    try {
      const summaryText = await runSummaryJob({ sessionId: targetSessionId }, style, async () => {
        await syncPendingData().catch(() => {})

        const response = await fetch('/api/ai/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: targetSessionId,
            style,
            force,
          }),
        })
        let data: { summary?: string; error?: string } = {}
        try {
          data = await response.json()
        } catch {
          throw new Error(
            response.status === 413 ? 'Dữ liệu quá lớn để tóm tắt' : t.summaryModalServiceError
          )
        }
        if (!response.ok || !data.summary) throw new Error(data.error || t.summaryModalGenerateError)
        return data.summary
      })
      setAiSummary(summaryText)
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : t.summaryModalServiceError)
    } finally {
      setAiLoading(false)
      setAiStartTimeMs(undefined)
    }
  }

  if (loading) {
    return (
      <div className="app-loading" role="status">
        <Loader2 className="animate-spin" aria-hidden="true" />
        <span>{t.historyLoading}</span>
      </div>
    )
  }

  const dateLocale = language === 'zh' ? 'zh-CN' : language === 'en' ? 'en-US' : 'vi-VN'
  const activePartner = activeSession
    ? getPartnerLanguage(activeSession.partner_language, language)
    : undefined
  const manualNoteEntries = entries.filter((e) => e.speaker_label === 'NOTE')
  const speechEntries = entries.filter((e) => e.speaker_label !== 'NOTE')
  const firstEntryStart = speechEntries[0]?.start_ms ?? entries[0]?.start_ms ?? 0

  const handleJumpToNote = async (note: LocalTranscriptEntry) => {
    if (speechEntries.length === 0) return
    let targetEntry = speechEntries[0]
    let bestDiff = Number.POSITIVE_INFINITY
    for (const entry of speechEntries) {
      const diff = Math.abs(entry.start_ms - note.start_ms)
      if (diff < bestDiff) {
        bestDiff = diff
        targetEntry = entry
      }
    }
    if (!targetEntry) return
    const el = document.getElementById(`tx-entry-${targetEntry.id}`)
    if (!el) return

    const opId = ++scrollOpIdRef.current
    await scrollIntoViewAsync(
      el,
      { behavior: 'smooth', block: 'center' },
      detailScrollRef.current
    )
    if (opId !== scrollOpIdRef.current) return

    setHighlightedEntryId(targetEntry.id)
    el.focus({ preventScroll: true })
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current)
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedEntryId((curr) => (curr === targetEntry.id ? null : curr))
    }, 2600)
  }

  const summaryStyles: Array<{ value: SummaryStyle; label: string; description: string }> = [
    { value: 'standard', label: t.summaryStyleDefault, description: t.summaryStyleDefaultDesc },
    { value: 'formal', label: t.summaryStyleFormal, description: t.summaryStyleFormalDesc },
    { value: 'casual', label: t.summaryStyleCasual, description: t.summaryStyleCasualDesc },
    {
      value: 'very_casual',
      label: t.summaryStyleVeryCasual,
      description: t.summaryStyleVeryCasualDesc,
    },
  ]

  return (
    <div className="scr-view">
      <WorkspaceHeader
        title={`${t.historyTitle} (${sessions.length})`}
        subtitle={formatDuration(totalDuration, t)}
      />

      {loadError && (
        <div className="session-alert session-alert--danger" role="alert">
          <CloudLightning aria-hidden="true" />
          <p>{loadError}</p>
        </div>
      )}

      <div className="h-ws" data-hist-step={histStep}>
        {/* COLUMN 1: SESSION FEED & SEARCH */}
        <section className="h-col h-feed" aria-label="Danh sách phiên hội thoại">
          <div className="h-feed__top">
            <div className="search">
              <Search className="i" aria-hidden="true" />
              <label htmlFor="history-search" className="sr-only">
                {t.historySearchPlaceholder}
              </label>
              <input
                id="history-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t.historySearchPlaceholder}
              />
            </div>
          </div>

          <div className="h-feed__list">
            {visibleSessions.length === 0 ? (
              <div className="list-empty">
                <FolderOpen className="i" aria-hidden="true" />
                <p>
                  <strong>
                    {normalizedSearch ? t.searchNoResults : t.independentConversationsEmpty}
                  </strong>
                </p>
                {!normalizedSearch && sessions.length === 0 && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => router.push('/session')}
                  >
                    {t.startBtn}
                  </button>
                )}
              </div>
            ) : (
              groupedSessions.map(([groupLabel, groupItems]) => (
                <div key={groupLabel}>
                  <div className="h-group-lbl">{groupLabel}</div>
                  {groupItems.map((session) => {
                    const isSelectedCard = activeSession?.id === session.id
                    const date = new Date(session.started_at)

                    return (
                      <div
                        key={session.id}
                        className={`h-card ${isSelectedCard ? 'is-selected' : ''}`}
                      >
                        <button
                          type="button"
                          className="h-card__main"
                          onClick={() => handleSessionClick(session)}
                        >
                          <span className="h-card__body">
                            <span className="h-card__title">{session.name}</span>
                            <span className="h-card__sub">
                              <span>{formatDurationClock(session.duration_seconds)}</span>
                              <span>·</span>
                              <span>
                                {date.toLocaleDateString(dateLocale, {
                                  day: '2-digit',
                                  month: '2-digit',
                                })}
                              </span>
                            </span>
                          </span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </section>

        {/* COLUMN 2: CLEAN SESSION DETAIL */}
        <section className="h-col h-detail" aria-label="Chi tiết phiên hội thoại">
          {!activeSession ? (
            <div className="list-empty">
              <FileText className="i" aria-hidden="true" />
              <p>
                {language === 'en'
                  ? 'Select a conversation on the left to view its transcript.'
                  : language === 'zh'
                    ? '在左侧选择一段会话以查看详细记录。'
                    : 'Chọn một cuộc hội thoại ở bên trái để xem chi tiết.'}
              </p>
            </div>
          ) : (
            <>
              <header className="h-detail__head">
                <div className="h-detail__mob-bar">
                  <button
                    type="button"
                    className="btn btn--sm btn--outline"
                    onClick={() => setHistStep('list')}
                  >
                    <ArrowLeft className="i" aria-hidden="true" />
                    <span>
                      {language === 'en' ? 'Back' : language === 'zh' ? '返回' : 'Quay lại'}
                    </span>
                  </button>
                  <div className="h-feed__search-row">
                    <button
                      type="button"
                      className="btn btn--sm btn--outline"
                      onClick={() => void handleExportSession('txt')}
                      title={t.sessionDetailExportTxt}
                    >
                      <FileText className="i" aria-hidden="true" />
                      <span>TXT</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--outline"
                      onClick={() => void handleExportSession('json')}
                      title={t.sessionDetailExportJson}
                    >
                      <Download className="i" aria-hidden="true" />
                      <span>JSON</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--outline"
                      onClick={() => void handleExportSession('md')}
                      title={t.sessionDetailExportMd}
                    >
                      <FileText className="i" aria-hidden="true" />
                      <span>MD</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      onClick={() => void handleDeleteSession()}
                      aria-label={t.sessionDetailDeleteBtn}
                    >
                      <Trash2 className="i" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="h-detail__top-row">
                  <div className="h-detail__title-wrap">
                    {renamingSession ? (
                      <div className="inline-edit-title">
                        <label htmlFor="session-rename-input" className="sr-only">
                          {t.sessionDetailNameLabel}
                        </label>
                        <input
                          id="session-rename-input"
                          value={newSessionName}
                          onChange={(e) => setNewSessionName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              if (e.nativeEvent.isComposing || e.keyCode === 229) return
                              void handleRenameSession()
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              setRenamingSession(false)
                            }
                          }}
                          maxLength={180}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          onClick={() => void handleRenameSession()}
                        >
                          <Check className="i" aria-hidden="true" />
                          <span>{language === 'en' ? 'Save' : language === 'zh' ? '保存' : 'Lưu'}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--outline"
                          onClick={() => setRenamingSession(false)}
                        >
                          <span>{language === 'en' ? 'Cancel' : language === 'zh' ? '取消' : 'Hủy'}</span>
                        </button>
                      </div>
                    ) : (
                      <h2 className="g-title">
                        <span>{activeSession.name}</span>
                        <button
                          type="button"
                          className="btn btn--icon btn--sm btn--outline"
                          onClick={() => {
                            setNewSessionName(activeSession.name)
                            setRenamingSession(true)
                          }}
                          aria-label={t.sessionDetailRenameAria}
                          title={t.sessionDetailRenameAria}
                        >
                          <Edit3 className="i" aria-hidden="true" />
                        </button>
                      </h2>
                    )}

                    <p className="h-detail__meta-line">
                      <span>
                        {new Date(activeSession.started_at).toLocaleString(dateLocale, {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span>·</span>
                      <span>{formatDuration(activeSession.duration_seconds, t)}</span>
                    </p>
                  </div>

                  <div className="h-feed__search-row h-detail__desk-actions">
                    <button
                      type="button"
                      className="btn btn--sm btn--outline"
                      onClick={() => void handleExportSession('txt')}
                      title={t.sessionDetailExportTxt}
                    >
                      <FileText className="i" aria-hidden="true" />
                      <span>TXT</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--outline"
                      onClick={() => void handleExportSession('json')}
                      title={t.sessionDetailExportJson}
                    >
                      <Download className="i" aria-hidden="true" />
                      <span>JSON</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--outline"
                      onClick={() => void handleExportSession('md')}
                      title={t.sessionDetailExportMd}
                    >
                      <FileText className="i" aria-hidden="true" />
                      <span>Markdown</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--icon btn--sm btn--danger"
                      onClick={() => void handleDeleteSession()}
                      aria-label={t.sessionDetailDeleteBtn}
                      title={t.sessionDetailDeleteBtn}
                    >
                      <Trash2 className="i" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="h-detail__tabs-bar">
                  <div className="seg" role="tablist" aria-label="Chế độ xem chi tiết phiên">
                    <button
                      type="button"
                      role="tab"
                      className="seg__btn"
                      aria-selected={detailTab === 'transcript'}
                      onClick={() => setDetailTab('transcript')}
                    >
                      <FileText className="i" aria-hidden="true" />
                      <span>
                        {language === 'en'
                          ? `Transcript (${speechEntries.length})`
                          : language === 'zh'
                            ? `对话内容 (${speechEntries.length})`
                            : `Nội dung (${speechEntries.length})`}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className="seg__btn"
                      aria-selected={detailTab === 'ai'}
                      onClick={() => {
                        setDetailTab('ai')
                        if (!activeSession) return
                        const saved =
                          getSavedSummary({ sessionId: activeSession.id }, selectedStyle) ??
                          getSavedSummary({ sessionId: activeSession.id })
                        if (saved?.summary) {
                          setSelectedStyle(saved.style)
                          setAiSummary(saved.summary)
                          return
                        }
                        if (!aiSummary && !aiLoading && entries.length > 0) {
                          void handleAiSummarize(selectedStyle)
                        }
                      }}
                    >
                      <Sparkles className="i" aria-hidden="true" />
                      <span>
                        {language === 'en'
                          ? 'AI Summary'
                          : language === 'zh'
                            ? 'AI 总结'
                            : 'Tóm tắt AI'}
                      </span>
                    </button>
                  </div>
                </div>
              </header>

              <div ref={detailScrollRef} className="h-detail__scroll">
                {detailTab === 'transcript' ? (
                  entries.length === 0 ? (
                    <div className="list-empty">
                      <FileText className="i" aria-hidden="true" />
                      <p>
                        <strong>{t.sessionDetailEmptyTranscriptTitle}</strong>
                      </p>
                      <p>{t.sessionDetailEmptyTranscriptDesc}</p>
                    </div>
                  ) : (
                    <>
                      {manualNoteEntries.length > 0 && (
                        <div className="tx-notes-panel">
                          <div className="tx-notes-panel__head">
                            <strong>
                              {language === 'en'
                                ? `Timeline Notes (${manualNoteEntries.length})`
                                : language === 'zh'
                                  ? `时间轴笔记 (${manualNoteEntries.length})`
                                  : `Ghi chú theo mốc thời gian (${manualNoteEntries.length})`}
                            </strong>
                            <span>
                              {language === 'en'
                                ? 'Click any note to scroll to that moment'
                                : language === 'zh'
                                  ? '点击任意笔记可滚动至对应段落'
                                  : 'Nhấp vào ghi chú để tự cuộn tới đoạn đã ghi'}
                            </span>
                          </div>
                          <div className="note-list">
                            {manualNoteEntries.map((note) => (
                              <article
                                key={note.id}
                                className="note note--clickable"
                                role="button"
                                tabIndex={0}
                                onClick={() => void handleJumpToNote(note)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    void handleJumpToNote(note)
                                  }
                                }}
                              >
                                <div className="note__head">
                                  <span className="cite" aria-label="Timestamp">
                                    <span>
                                      {formatTimeline(Math.max(0, note.start_ms - firstEntryStart))}
                                    </span>
                                    <CornerDownRight className="i" aria-hidden="true" />
                                  </span>
                                  <span className="note__jump">
                                    {language === 'en'
                                      ? 'Jump to segment'
                                      : language === 'zh'
                                        ? '定位至该段'
                                        : 'Cuộn tới đoạn này'}
                                  </span>
                                </div>
                                <div className="note__body">{note.original_text}</div>
                                {note.translated_text && (
                                  <div className="note__sub">
                                    <em>“{note.translated_text}”</em>
                                  </div>
                                )}
                              </article>
                            ))}
                          </div>
                        </div>
                      )}
                      <ol className="tx-list">
                        {speechEntries.map((entry) => {
                          const isHost = entry.speaker === 'host'
                          const origText = (entry.original_text || '').trim()
                          const transText = (entry.translated_text || '').trim()
                          const primaryText = origText || transText
                          const secondaryText =
                            transText && transText !== origText ? transText : ''
                          const isEditing = editingEntryId === entry.id
                          const isHighlighted = highlightedEntryId === entry.id
                          const partnerLabel =
                            activePartner?.name ?? activeSession.partner_language.toUpperCase()

                          return (
                            <li
                              key={entry.id}
                              id={`tx-entry-${entry.id}`}
                              tabIndex={-1}
                              className={`tx-item ${isHost ? 'tx-item--m' : ''} ${isHighlighted ? 'is-highlighted' : ''}`.trim()}
                            >
                              <div className="tx-item__head">
                                <span className="tx-item__role">
                                  {isHost ? t.sessionDetailSpeakerYou : partnerLabel}
                                  {entry.speaker_label ? ` · #${entry.speaker_label}` : ''}
                                </span>
                                <time className="tx-item__time">
                                  {formatTimeline(Math.max(0, entry.start_ms - firstEntryStart))}
                                </time>
                              </div>

                              {isEditing ? (
                                <div className="tx-item__body tx-inline-edit">
                                  <textarea
                                    className="tx-inline-input tx-inline-input--orig"
                                    aria-label={
                                      language === 'en'
                                        ? 'Original'
                                        : language === 'zh'
                                          ? '原文'
                                          : 'Câu gốc'
                                    }
                                    rows={Math.max(1, Math.ceil((editOrigText.length || 1) / 68))}
                                    value={editOrigText}
                                    autoFocus
                                    onChange={(e) => setEditOrigText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        if (e.nativeEvent.isComposing || e.keyCode === 229) return
                                        void handleSaveEntryEdit(entry.id)
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault()
                                        setEditingEntryId(null)
                                      }
                                    }}
                                  />
                                  {(secondaryText || editTransText) && (
                                    <textarea
                                      className="tx-inline-input tx-inline-input--trans"
                                      aria-label={
                                        language === 'en'
                                          ? 'Translation'
                                          : language === 'zh'
                                            ? '译文'
                                            : 'Bản dịch'
                                      }
                                      rows={Math.max(1, Math.ceil((editTransText.length || 1) / 68))}
                                      value={editTransText}
                                      onChange={(e) => setEditTransText(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault()
                                          if (e.nativeEvent.isComposing || e.keyCode === 229) return
                                          void handleSaveEntryEdit(entry.id)
                                        } else if (e.key === 'Escape') {
                                          e.preventDefault()
                                          setEditingEntryId(null)
                                        }
                                      }}
                                    />
                                  )}
                                  <div className="tx-inline-actions">
                                    <span className="tx-inline-hint">
                                      {language === 'en'
                                        ? 'Enter to save · Esc to cancel'
                                        : language === 'zh'
                                          ? 'Enter 保存 · Esc 取消'
                                          : 'Enter để lưu · Esc để hủy'}
                                    </span>
                                    <button
                                      type="button"
                                      className="btn btn--sm btn--outline"
                                      onClick={() => setEditingEntryId(null)}
                                    >
                                      {t.sessionDetailCancelEditBtn}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn--sm btn--primary"
                                      onClick={() => void handleSaveEntryEdit(entry.id)}
                                    >
                                      <Check className="i" aria-hidden="true" />
                                      <span>{t.sessionDetailSaveEditBtn}</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="tx-item__body tx-item__body--editable"
                                  role="button"
                                  tabIndex={0}
                                  title={t.sessionDetailEditEntryAria}
                                  onClick={() => startEditingEntry(entry)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      startEditingEntry(entry)
                                    }
                                  }}
                                >
                                  <p className="tx-item__orig">{primaryText || '—'}</p>
                                  {secondaryText && (
                                    <p className="tx-item__trans">{secondaryText}</p>
                                  )}
                                </div>
                              )}
                            </li>
                        )
                      })}
                    </ol>
                    </>
                  )
                ) : (
                  <div className="scr-wrap">
                    <div className="g-card">
                      <div className="g-head">
                        <div className="g-meta">
                          {summaryStyles.map((st) => {
                            const bundle = getSavedSummaryBundle({ sessionId: activeSession.id })
                            const hasSavedForStyle = Boolean(bundle.byStyle[st.value]?.summary)
                            return (
                              <button
                                key={st.value}
                                type="button"
                                className={`btn btn--sm ${selectedStyle === st.value ? 'btn--primary' : 'btn--outline'}`}
                                disabled={aiLoading}
                                onClick={() => void handleAiSummarize(st.value)}
                              >
                                <Sparkles className="i" aria-hidden="true" />
                                <span>{st.label}</span>
                                {hasSavedForStyle && (
                                  <span
                                    className="btn__saved-dot"
                                    title={
                                      language === 'en'
                                        ? 'Saved'
                                        : language === 'zh'
                                          ? '已保存'
                                          : 'Đã lưu'
                                    }
                                    aria-hidden="true"
                                  />
                                )}
                              </button>
                            )
                          })}
                        </div>
                        {aiSummary && !aiLoading && (
                          <div className="ai-toolbar-actions">
                            <button
                              type="button"
                              className="btn btn--sm btn--outline"
                              onClick={() => void handleAiSummarize(selectedStyle, true)}
                              title={
                                language === 'en'
                                  ? 'Regenerate AI summary'
                                  : language === 'zh'
                                    ? '重新生成 AI 总结'
                                    : 'Tạo lại bản tóm tắt AI mới'
                              }
                            >
                              <RotateCcw className="i" aria-hidden="true" />
                              <span>
                                {language === 'en'
                                  ? 'Regenerate'
                                  : language === 'zh'
                                    ? '重新生成'
                                    : 'Tạo lại'}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="btn btn--sm btn--outline"
                              onClick={async () => {
                                const { downloadSummaryHTML } = await import('@/lib/html-generator')
                                downloadSummaryHTML(
                                  activeSession.name,
                                  aiSummary,
                                  activeSession.started_at,
                                  activePartner?.name || activeSession.partner_language
                                )
                              }}
                            >
                              <Download className="i" aria-hidden="true" />
                              <span>{t.summaryModalDownloadHtmlBtn}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {aiLoading ? (
                      <AiSummaryProgress
                        language={language}
                        entryCount={entries.length}
                        styleLabel={
                          summaryStyles.find((s) => s.value === selectedStyle)?.label
                        }
                        startedAtMs={aiStartTimeMs}
                      />
                    ) : summaryError ? (
                      <div className="g-card report-error" role="alert">
                        <p>{summaryError}</p>
                        <button
                          type="button"
                          className="btn btn--sm btn--outline"
                          onClick={() => void handleAiSummarize(selectedStyle, true)}
                        >
                          {t.summaryModalRetryBtn}
                        </button>
                      </div>
                    ) : aiSummary ? (
                      <article className="doc-paper">
                        <h2>{activeSession.name}</h2>
                        <pre className="doc-tree">{aiSummary}</pre>
                      </article>
                    ) : (
                      <div className="g-card list-empty">
                        <Sparkles className="i" aria-hidden="true" />
                        <p>
                          {language === 'en'
                            ? 'Select a style above to generate an AI summary.'
                            : language === 'zh'
                              ? '选择上方风格以生成 AI 总结。'
                              : 'Chọn một phong cách ở trên để tạo tóm tắt AI.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
