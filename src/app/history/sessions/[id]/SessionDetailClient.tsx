'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  CornerDownRight,
  Download,
  Edit3,
  FileJson,
  FileText,
  Link2,
  Loader2,
  LockKeyhole,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import AiSummaryProgress from '@/components/AiSummaryProgress'
import { claimLegacyLocalData, db, LocalSession, LocalTranscriptEntry } from '@/lib/db'
import { generatePremiumHTMLReport } from '@/lib/html-generator'
import { authClient } from '@/lib/auth-client'
import { getPartnerLanguage } from '@/lib/languages'
import { syncPendingData } from '@/lib/sync-manager'
import {
  clearSummariesForTarget,
  getInFlightSummaryJob,
  getSavedSummary,
  hydrateSummariesFromCloud,
  runSummaryJob,
  type SummaryStyle,
} from '@/lib/summary-store'
import { formatTimeline, scrollIntoViewAsync } from '@/lib/utils'
import { useLanguage } from '@/hooks/useLanguage'

interface PageProps {
  params: Promise<{ id: string }>
}

function formatDuration(totalSeconds: number, t: { durationHoursMinutes: string; durationMinutes: string }) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  return hours > 0
    ? t.durationHoursMinutes.replace('{hours}', String(hours)).replace('{minutes}', String(minutes))
    : t.durationMinutes.replace('{minutes}', String(minutes))
}

export default function SessionDetailPage({ params }: PageProps) {
  const router = useRouter()
  const { language, t } = useLanguage()
  const rawParams = use(params)
  const id = (typeof rawParams.id === 'string' && rawParams.id !== 'fallback' && rawParams.id !== '')
    ? rawParams.id
    : (typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean).pop() || '' : '')
  const [session, setSession] = useState<LocalSession | null>(null)
  const [entries, setEntries] = useState<LocalTranscriptEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editOrigText, setEditOrigText] = useState('')
  const [editTransText, setEditTransText] = useState('')
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiStartTimeMs, setAiStartTimeMs] = useState<number | undefined>(undefined)
  const [aiSummary, setAiSummary] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [sharePassword, setSharePassword] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<SummaryStyle>('standard')
  const scrollOpIdRef = useRef(0)
  const highlightTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  const loadSessionData = useCallback(async () => {
    if (!id || id === 'fallback') return

    try {
      const { data: { user } } = await authClient.getUser()
      const username = user?.user_metadata?.username ||
                       user?.user_metadata?.full_name ||
                       user?.user_metadata?.name ||
                       user?.email?.split('@')[0]
      const legacyUsername = user?.email?.split('@')[0]
      if (!user || !username || !legacyUsername) {
        router.replace('/')
        return
      }

      await claimLegacyLocalData(user.id, legacyUsername)
      void syncPendingData()

      let localSession = await db.sessions.get(id)
      if (localSession && !localSession.owner_id && localSession.username.trim().toLowerCase() === legacyUsername.toLowerCase()) {
        if (!localSession.owner_id) {
          await db.sessions.update(id, { owner_id: user.id, username, sync_status: 'pending' })
          localSession = await db.sessions.get(id)
        }
      }

      const saved = getSavedSummary({ sessionId: id })
      if (saved?.summary) {
        setSelectedStyle(saved.style)
        setAiSummary(saved.summary)
      }

      if (localSession?.owner_id === user.id) {
        const localEntries = await db.transcriptEntries
          .where('session_id')
          .equals(id)
          .sortBy('start_ms')
        if (localEntries.length > 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          setSession(localSession)
          setNewName(localSession.name)
          setEntries(localEntries)
          if (!saved?.summary) {
            void fetch(`/api/history?table=session_summaries&sessionId=${encodeURIComponent(id)}`)
              .then(async (r) => (r.ok ? r.json() : { items: [] }))
              .then((res) => {
                if (!Array.isArray(res.items) || res.items.length === 0) return
                hydrateSummariesFromCloud({ sessionId: id }, res.items)
                const hydrated = getSavedSummary({ sessionId: id })
                if (hydrated?.summary) {
                  setSelectedStyle(hydrated.style)
                  setAiSummary(hydrated.summary)
                }
              })
              .catch(() => {})
          }
          return
        }
      }

      const cloudRes = await fetch(`/api/history?table=sessions&id=${encodeURIComponent(id)}&single=1`)
        .then(async (r) => {
          if (!r.ok) return {}
          const ct = r.headers.get('content-type') || ''
          return ct.includes('application/json') ? r.json() : {}
        })
        .catch(() => ({}))
      const cloudSession = cloudRes.item
      const cloudEntries = cloudRes.entries || []
      if (Array.isArray(cloudRes.summaries) && cloudRes.summaries.length > 0) {
        hydrateSummariesFromCloud({ sessionId: id }, cloudRes.summaries)
        const hydrated = getSavedSummary({ sessionId: id })
        if (hydrated?.summary) {
          setSelectedStyle(hydrated.style)
          setAiSummary(hydrated.summary)
        }
      }

      if (!cloudSession) {
        setPageError(t.sessionDetailNotFoundDesc)
        return
      }

      const formattedSession: LocalSession = {
        id: cloudSession.id,
        owner_id: cloudSession.owner_id || user.id,
        username: cloudSession.username || username,
        folder_id: cloudSession.folder_id,
        name: cloudSession.name,
        partner_language: cloudSession.partner_language,
        started_at: cloudSession.started_at,
        ended_at: cloudSession.ended_at,
        duration_seconds: cloudSession.duration_seconds,
        sync_status: 'synced',
        updated_at: cloudSession.updated_at || new Date().toISOString(),
      }
      interface CloudTranscriptEntry {
        id: string
        session_id: string
        speaker: 'host' | 'partner'
        speaker_label?: string | null
        original_text: string
        translated_text: string
        start_ms: number
        end_ms: number
        created_at: string
        updated_at?: string
      }
      const formattedEntries: LocalTranscriptEntry[] = (cloudEntries as CloudTranscriptEntry[]).map((entry) => ({
        id: entry.id,
        session_id: entry.session_id,
        speaker: entry.speaker,
        speaker_label: entry.speaker_label ?? undefined,
        original_text: entry.original_text,
        translated_text: entry.translated_text,
        start_ms: entry.start_ms,
        end_ms: entry.end_ms,
        created_at: entry.created_at,
        sync_status: 'synced',
        updated_at: entry.updated_at || new Date().toISOString(),
      }))

      const existingEntries = await db.transcriptEntries.where('session_id').equals(id).toArray()
      const localPendingEntryIds = new Set(
        existingEntries.filter((entry) => entry.sync_status !== 'synced').map((entry) => entry.id)
      )
      const safeEntries = formattedEntries.filter((entry) => !localPendingEntryIds.has(entry.id))

      await db.transaction('rw', db.sessions, db.transcriptEntries, async () => {
        if (!localSession || localSession.sync_status === 'synced') {
          await db.sessions.put(formattedSession)
        }
        if (safeEntries.length > 0) {
          await db.transcriptEntries.bulkPut(safeEntries)
        }
      })

      const resolvedSession = localSession && localSession.sync_status !== 'synced' ? localSession : formattedSession
      const mergedEntries = await db.transcriptEntries.where('session_id').equals(id).sortBy('start_ms')
      setSession(resolvedSession)
      setNewName(resolvedSession.name)
      setEntries(mergedEntries.length > 0 ? mergedEntries : formattedEntries)
    } catch (error) {
      console.error('Error loading session:', error)
      setPageError(t.sessionDetailLoadError)
    } finally {
      setLoading(false)
    }
  }, [id, router, t])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadSessionData(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadSessionData])

  const handleRename = async () => {
    const cleanName = newName.trim().slice(0, 200)
    if (!session || !cleanName) return
    const now = new Date().toISOString()
    await db.sessions.update(session.id, { name: cleanName, sync_status: 'pending', updated_at: now })
    setSession((current) => current ? { ...current, name: cleanName, sync_status: 'pending', updated_at: now } : null)
    setRenaming(false)
    void syncPendingData()
  }

  const handleDelete = async () => {
    if (!session || !confirm(t.sessionDetailDeleteConfirm)) return
    setPageError('')
    try {
      const res = await fetch('/api/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'sessions', field: 'id', value: session.id }),
      })
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`)
      }

      await db.transaction('rw', db.sessions, db.transcriptEntries, async () => {
        await db.transcriptEntries.where('session_id').equals(session.id).delete()
        await db.sessions.delete(session.id)
      })
      clearSummariesForTarget({ sessionId: session.id })
      router.replace('/history')
    } catch (error) {
      console.error('Failed to delete session:', error)
      setPageError(t.sessionDetailDeleteServerError)
    }
  }

  const startEditing = (entry: LocalTranscriptEntry) => {
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
    setEntries((current) => current.map((entry) => entry.id === entryId
      ? { ...entry, original_text: safeOrig, translated_text: safeTrans, sync_status: 'pending', updated_at: now }
      : entry
    ))
    setEditingEntryId(null)
    void syncPendingData()
  }

  const handleExport = async (format: 'txt' | 'json' | 'md') => {
    if (!session) return
    setShowExportMenu(false)
    setPageError('')
    try {
      const languageName = getPartnerLanguage(session.partner_language, language)?.name || session.partner_language
      const { downloadSessionTXT, downloadSessionJSON, downloadSessionMarkdown } = await import('@/lib/pdf-generator')
      if (format === 'txt') {
        await downloadSessionTXT(session.name, languageName, session.started_at, entries)
      } else if (format === 'md') {
        await downloadSessionMarkdown(session.name, languageName, session.started_at, entries)
      } else {
        await downloadSessionJSON(session.name, session.partner_language, languageName, session.started_at, entries)
      }
    } catch (error) {
      console.error('Failed to export session:', error)
      setPageError(t.sessionDetailExportError)
    }
  }

  const handleAiSummarize = async (style: SummaryStyle = selectedStyle, force = false) => {
    if (!session || entries.length === 0) return
    setShowSummaryModal(true)
    setSelectedStyle(style)
    setSummaryError('')
    setShareLink('')

    if (!force) {
      const cached = getSavedSummary({ sessionId: session.id }, style)
      if (cached?.summary) {
        setAiSummary(cached.summary)
        setAiLoading(false)
        setAiStartTimeMs(undefined)
        return
      }
    }

    const existingInFlight = getInFlightSummaryJob({ sessionId: session.id })
    setAiLoading(true)
    setAiStartTimeMs(existingInFlight?.style === style ? existingInFlight.startedAtMs : Date.now())

    try {
      const summaryText = await runSummaryJob({ sessionId: session.id }, style, async () => {
        await syncPendingData().catch(() => {})
        const response = await fetch('/api/ai/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, style, force }),
        })
        let data: { summary?: string; error?: string } = {}
        try {
          data = await response.json()
        } catch {
          throw new Error(response.status === 413 ? 'Dữ liệu quá lớn để tóm tắt' : t.summaryModalServiceError)
        }
        if (!response.ok || !data.summary) throw new Error(data.error || t.summaryModalGenerateError)
        return data.summary
      })
      setAiSummary(summaryText)
    } catch (error) {
      console.error('Error during AI summarize:', error)
      setSummaryError(error instanceof Error ? error.message : t.summaryModalServiceError)
    } finally {
      setAiLoading(false)
      setAiStartTimeMs(undefined)
    }
  }

  const handleCreateShareLink = async () => {
    if (!session || !aiSummary) return
    setAiLoading(true)
    setSummaryError('')
    try {
      await syncPendingData().catch(() => {})
      const response = await fetch('/api/shared/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          title: `${t.summaryModalHeaderTitle}: ${session.name}`,
          summaryContent: aiSummary,
          password: sharePassword,
        }),
      })
      let data: { id?: string; error?: string } = {}
      try {
        data = await response.json()
      } catch {
        throw new Error(t.summaryModalCreateLinkError)
      }
      if (!response.ok || !data.id) throw new Error(data.error || t.summaryModalCreateLinkError)
      setShareLink(`${window.location.origin}/shared/summary/${data.id}`)
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : t.summaryModalCreateLinkError)
    } finally {
      setAiLoading(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      // Ignore clipboard permission restrictions
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

  if (!session) {
    return (
      <div className="detail-not-found">
        <FileText aria-hidden="true" />
        <h1>{t.sessionDetailNotFoundTitle}</h1>
        <p>{pageError || t.sessionDetailNotFoundDesc}</p>
        <button type="button" onClick={() => router.replace('/history')}>
          <ArrowLeft aria-hidden="true" /> {t.sessionDetailBackBtn}
        </button>
      </div>
    )
  }

  const partnerLanguage = getPartnerLanguage(session.partner_language, language)
  const manualNoteEntries = entries.filter((e) => e.speaker_label === 'NOTE')
  const speechEntries = entries.filter((e) => e.speaker_label !== 'NOTE')
  const firstEntryStart = speechEntries[0]?.start_ms ?? entries[0]?.start_ms ?? 0
  const duration = formatDuration(session.duration_seconds, t)
  const partnerBadge = partnerLanguage?.shortName ?? session.partner_language.toUpperCase()

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
    await scrollIntoViewAsync(el, { behavior: 'smooth', block: 'center' })
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
    { value: 'very_casual', label: t.summaryStyleVeryCasual, description: t.summaryStyleVeryCasualDesc },
  ]

  return (
    <div className="scr-view">
      <WorkspaceHeader
        title={t.sessionDetailHeaderTitle}
        subtitle={session.name}
        routeBadge="/history/sessions/[id]"
      />

      <main className="scr-body">
        <div className="scr-wrap">
          <div className="h-feed__search-row">
            <button type="button" className="btn btn--sm btn--outline" onClick={() => router.push('/history')}>
              <ArrowLeft className="i" aria-hidden="true" />
              <span>{t.sessionDetailBackLink}</span>
            </button>
          </div>

          <section className="g-card">
            <div className="g-head">
              <div>
                {renaming ? (
                  <div className="inline-edit-title">
                    <label htmlFor="session-name" className="sr-only">{t.sessionDetailNameLabel}</label>
                    <input
                      id="session-name"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          if (event.nativeEvent.isComposing || event.keyCode === 229) return
                          void handleRename()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          setRenaming(false)
                        }
                      }}
                      maxLength={180}
                      autoFocus
                    />
                    <button type="button" className="btn btn--sm btn--primary" onClick={handleRename} aria-label={t.sessionDetailSaveNameAria}>
                      <Check className="i" aria-hidden="true" />
                      <span>Lưu</span>
                    </button>
                    <button type="button" className="btn btn--sm btn--outline" onClick={() => setRenaming(false)} aria-label={t.sessionDetailCancelNameAria}>
                      <X className="i" aria-hidden="true" />
                      <span>Hủy</span>
                    </button>
                  </div>
                ) : (
                  <h1 className="g-title">
                    <span>{session.name}</span>
                    <button type="button" className="btn btn--sm btn--outline" onClick={() => setRenaming(true)} aria-label={t.sessionDetailRenameAria} title={t.sessionDetailRenameAria}>
                      <Edit3 className="i" aria-hidden="true" />
                      <span>Đổi tên</span>
                    </button>
                  </h1>
                )}
                <p className="h-detail__meta-line">
                  <span>
                    {new Date(session.started_at).toLocaleString(language === 'zh' ? 'zh-CN' : language === 'en' ? 'en-US' : 'vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span>·</span>
                  <span>{duration}</span>
                </p>
              </div>

              <div className="h-feed__search-row">
                <button type="button" className="btn btn--primary" onClick={() => void handleAiSummarize()} disabled={entries.length === 0}>
                  <Sparkles className="i" aria-hidden="true" />
                  <span>{t.sessionDetailSummarizeBtn}</span>
                </button>
                <div className="export-control">
                  <button type="button" className="btn btn--outline" onClick={() => setShowExportMenu((current) => !current)} aria-expanded={showExportMenu}>
                    <Download className="i" aria-hidden="true" />
                    <span>{t.sessionDetailExportBtn}</span>
                    <ChevronDown className="i" aria-hidden="true" />
                  </button>
                  {showExportMenu && (
                    <div className="export-menu">
                      <button type="button" onClick={() => void handleExport('txt')}><FileText aria-hidden="true" /> {t.sessionDetailExportTxt}</button>
                      <button type="button" onClick={() => void handleExport('json')}><FileJson aria-hidden="true" /> {t.sessionDetailExportJson}</button>
                      <button type="button" onClick={() => void handleExport('md')}><FileText aria-hidden="true" /> {t.sessionDetailExportMd}</button>
                    </div>
                  )}
                </div>
                <button type="button" className="btn btn--danger" onClick={handleDelete} aria-label={t.sessionDetailDeleteBtn} title={t.sessionDetailDeleteBtn}>
                  <Trash2 className="i" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>

          {pageError && (
            <div className="session-alert session-alert--danger" role="alert"><p>{pageError}</p></div>
          )}

          <section aria-labelledby="transcript-heading">
            <h2 id="transcript-heading" className="sr-only">{t.sessionDetailTranscriptHeading}</h2>

            {entries.length === 0 ? (
              <div className="g-card list-empty">
                <Volume2 className="i" aria-hidden="true" />
                <p><strong>{t.sessionDetailEmptyTranscriptTitle}</strong></p>
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
                    const secondaryText = transText && transText !== origText ? transText : ''
                    const isEditing = editingEntryId === entry.id
                    const isHighlighted = highlightedEntryId === entry.id
                    const partnerLabel = partnerLanguage?.name ?? partnerBadge
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
                          <time className="tx-item__time">{formatTimeline(Math.max(0, entry.start_ms - firstEntryStart))}</time>
                        </div>

                        {isEditing ? (
                          <div className="tx-item__body tx-inline-edit">
                            <textarea
                              className="tx-inline-input tx-inline-input--orig"
                              aria-label={language === 'en' ? 'Original' : language === 'zh' ? '原文' : 'Câu gốc'}
                              rows={Math.max(1, Math.ceil((editOrigText.length || 1) / 68))}
                              value={editOrigText}
                              autoFocus
                              onChange={(event) => setEditOrigText(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                  event.preventDefault()
                                  if (event.nativeEvent.isComposing || event.keyCode === 229) return
                                  void handleSaveEntryEdit(entry.id)
                                } else if (event.key === 'Escape') {
                                  event.preventDefault()
                                  setEditingEntryId(null)
                                }
                              }}
                            />
                            {(secondaryText || editTransText) && (
                              <textarea
                                className="tx-inline-input tx-inline-input--trans"
                                aria-label={language === 'en' ? 'Translation' : language === 'zh' ? '译文' : 'Bản dịch'}
                                rows={Math.max(1, Math.ceil((editTransText.length || 1) / 68))}
                                value={editTransText}
                                onChange={(event) => setEditTransText(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault()
                                    if (event.nativeEvent.isComposing || event.keyCode === 229) return
                                    void handleSaveEntryEdit(entry.id)
                                  } else if (event.key === 'Escape') {
                                    event.preventDefault()
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
                              <button type="button" className="btn btn--sm btn--outline" onClick={() => setEditingEntryId(null)}>{t.sessionDetailCancelEditBtn}</button>
                              <button type="button" className="btn btn--sm btn--primary" onClick={() => void handleSaveEntryEdit(entry.id)}><Check className="i" aria-hidden="true" /> <span>{t.sessionDetailSaveEditBtn}</span></button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="tx-item__body tx-item__body--editable"
                            role="button"
                            tabIndex={0}
                            title={t.sessionDetailEditEntryAria}
                            onClick={() => startEditing(entry)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                startEditing(entry)
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
            )}
          </section>
        </div>
      </main>

      {showSummaryModal && (
        <div className="dialog-backdrop" role="presentation">
          <section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="summary-title">
            <header>
              <div>
                <span className="dialog-icon dialog-icon--ai"><Sparkles aria-hidden="true" /></span>
                <div><h2 id="summary-title">{t.summaryModalHeaderTitle}</h2><p>{session.name}</p></div>
              </div>
              <button type="button" onClick={() => setShowSummaryModal(false)} aria-label={t.closeAria}><X aria-hidden="true" /></button>
            </header>

            {aiLoading && !aiSummary ? (
              <div className="scr-wrap">
                <AiSummaryProgress
                  language={language}
                  entryCount={entries.length}
                  styleLabel={summaryStyles.find((s) => s.value === selectedStyle)?.label}
                  startedAtMs={aiStartTimeMs}
                />
              </div>
            ) : (
              <div className="report-layout">
                <aside className="report-settings">
                  <fieldset>
                    <legend>{t.summaryModalStyleHeading}</legend>
                    {summaryStyles.map((style) => (
                      <button
                        type="button"
                        key={style.value}
                        className={selectedStyle === style.value ? 'is-active' : ''}
                        onClick={() => void handleAiSummarize(style.value)}
                        disabled={aiLoading}
                      >
                        <span><strong>{style.label}</strong><small>{style.description}</small></span>
                        {selectedStyle === style.value && <Check aria-hidden="true" />}
                      </button>
                    ))}
                  </fieldset>

                  <section className="share-settings">
                    <h3><LockKeyhole aria-hidden="true" /> {t.summaryModalShareHeading}</h3>
                    <p>{t.summaryModalShareDesc}</p>
                    <label htmlFor="share-password">{t.summaryModalPasswordLabel}</label>
                    <input
                      id="share-password"
                      type="password"
                      value={sharePassword}
                      onChange={(event) => setSharePassword(event.target.value)}
                      placeholder={t.summaryModalPasswordPlaceholder}
                      maxLength={128}
                    />
                    <button type="button" onClick={handleCreateShareLink} disabled={!aiSummary || aiLoading}>
                      <Link2 aria-hidden="true" /> {t.summaryModalCreateLinkBtn}
                    </button>
                    {shareLink && (
                      <div className="share-result">
                        <input value={shareLink} readOnly aria-label={t.summaryModalCopyLinkAria} />
                        <button type="button" onClick={handleCopyLink} aria-label={t.summaryModalCopyLinkAria}>
                          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                        </button>
                      </div>
                    )}
                  </section>
                </aside>

                <section className="report-preview">
                  <header>
                    <div><h3>{t.sessionDetailPreviewHeading}</h3><p>{t.sessionDetailPreviewDesc}</p></div>
                    <button
                      type="button"
                      onClick={async () => {
                        const { downloadSummaryHTML } = await import('@/lib/html-generator')
                        downloadSummaryHTML(session.name, aiSummary, session.started_at, partnerLanguage?.name || session.partner_language)
                      }}
                      disabled={!aiSummary}
                    >
                      <Download aria-hidden="true" /> {t.summaryModalDownloadHtmlBtn}
                    </button>
                  </header>
                  {summaryError ? (
                    <div className="report-error" role="alert"><p>{summaryError}</p><button type="button" onClick={() => void handleAiSummarize()}>{t.summaryModalRetryBtn}</button></div>
                  ) : aiSummary ? (
                    <iframe
                      title={t.sessionDetailPreviewFrameTitle}
                      sandbox=""
                      srcDoc={generatePremiumHTMLReport({
                        sessionName: session.name,
                        markdown: aiSummary,
                        startedAt: session.started_at,
                        partnerLang: partnerLanguage?.name || session.partner_language,
                      })}
                    />
                  ) : null}
                </section>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
