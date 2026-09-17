'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  CloudLightning,
  Copy,
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
import { claimLegacyLocalData, db, LocalSession, LocalTranscriptEntry } from '@/lib/db'
import { generatePremiumHTMLReport } from '@/lib/html-generator'
import { authClient } from '@/lib/auth-client'
import { getPartnerLanguage } from '@/lib/languages'
import { syncPendingData } from '@/lib/sync-manager'
import { formatTimeline } from '@/lib/utils'
import { useLanguage } from '@/hooks/useLanguage'

type SummaryStyle = 'default' | 'formal' | 'casual' | 'very_casual'

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
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [sharePassword, setSharePassword] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<SummaryStyle>('default')

  const loadSessionData = useCallback(async () => {
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

      if (localSession?.owner_id === user.id) {
        const localEntries = await db.transcriptEntries
          .where('session_id')
          .equals(id)
          .sortBy('start_ms')
        if (localEntries.length > 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          setSession(localSession)
          setNewName(localSession.name)
          setEntries(localEntries)
          return
        }
      }

      const cloudRes = await fetch(`/api/history?table=sessions&id=${encodeURIComponent(id)}&single=1`).then(r => r.json()).catch(() => ({}))
      const cloudSession = cloudRes.item
      const cloudEntries = cloudRes.entries || []

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
        existingEntries.filter((entry) => entry.sync_status === 'pending').map((entry) => entry.id)
      )
      const safeEntries = formattedEntries.filter((entry) => !localPendingEntryIds.has(entry.id))

      await db.transaction('rw', db.sessions, db.transcriptEntries, async () => {
        if (!localSession || localSession.sync_status !== 'pending') {
          await db.sessions.put(formattedSession)
        }
        if (safeEntries.length > 0) {
          await db.transcriptEntries.bulkPut(safeEntries)
        }
      })

      setSession(formattedSession)
      setNewName(formattedSession.name)
      setEntries(formattedEntries)
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
    const cleanName = newName.trim()
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
    await db.transcriptEntries.update(entryId, {
      original_text: editOrigText,
      translated_text: editTransText,
      sync_status: 'pending',
      updated_at: now,
    })
    setEntries((current) => current.map((entry) => entry.id === entryId
      ? { ...entry, original_text: editOrigText, translated_text: editTransText, sync_status: 'pending', updated_at: now }
      : entry
    ))
    setEditingEntryId(null)
    void syncPendingData()
  }

  const handleExport = async (format: 'pdf' | 'txt' | 'json') => {
    if (!session) return
    setShowExportMenu(false)
    setPageError('')
    try {
      const languageName = getPartnerLanguage(session.partner_language)?.name || session.partner_language
      const { downloadSessionPDF, downloadSessionTXT, downloadSessionJSON } = await import('@/lib/pdf-generator')
      if (format === 'pdf') {
        await downloadSessionPDF(session.name, session.partner_language, languageName, session.started_at, entries)
      } else if (format === 'txt') {
        await downloadSessionTXT(session.name, languageName, session.started_at, entries)
      } else {
        await downloadSessionJSON(session.name, session.partner_language, languageName, session.started_at, entries)
      }
    } catch (error) {
      console.error('Failed to export session:', error)
      setPageError(t.sessionDetailExportError)
    }
  }

  const handleAiSummarize = async (style: SummaryStyle = selectedStyle) => {
    if (!session || entries.length === 0) return
    setAiLoading(true)
    setShowSummaryModal(true)
    setSelectedStyle(style)
    setSummaryError('')
    setShareLink('')

    try {
      const response = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, sessions: [session], entries, style }),
      })
      const data: { summary?: string; error?: string } = await response.json()
      if (!response.ok || !data.summary) throw new Error(data.error || t.summaryModalGenerateError)
      setAiSummary(data.summary)
    } catch (error) {
      console.error('Error during AI summarize:', error)
      setSummaryError(error instanceof Error ? error.message : t.summaryModalServiceError)
    } finally {
      setAiLoading(false)
    }
  }

  const handleCreateShareLink = async () => {
    if (!session || !aiSummary) return
    setAiLoading(true)
    setSummaryError('')
    try {
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
      const data: { id?: string; error?: string } = await response.json()
      if (!response.ok || !data.id) throw new Error(data.error || t.summaryModalCreateLinkError)
      setShareLink(`${window.location.origin}/shared/summary/${data.id}`)
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : t.summaryModalCreateLinkError)
    } finally {
      setAiLoading(false)
    }
  }

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(shareLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
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

  const partnerLanguage = getPartnerLanguage(session.partner_language)
  const firstEntryStart = entries[0]?.start_ms ?? 0
  const duration = formatDuration(session.duration_seconds, t)

  const summaryStyles: Array<{ value: SummaryStyle; label: string; description: string }> = [
    { value: 'default', label: t.summaryStyleDefault, description: t.summaryStyleDefaultDesc },
    { value: 'formal', label: t.summaryStyleFormal, description: t.summaryStyleFormalDesc },
    { value: 'casual', label: t.summaryStyleCasual, description: t.summaryStyleCasualDesc },
    { value: 'very_casual', label: t.summaryStyleVeryCasual, description: t.summaryStyleVeryCasualDesc },
  ]

  return (
    <div className="workspace-shell">
      <WorkspaceHeader title={t.sessionDetailHeaderTitle} subtitle={session.name} />

      <main className="detail-main">
        <button type="button" className="back-link" onClick={() => router.push('/history')}>
          <ArrowLeft aria-hidden="true" /> {t.sessionDetailBackLink}
        </button>

        <section className="detail-titlebar">
          <div className="detail-title">
            {renaming ? (
              <div className="rename-control">
                <label htmlFor="session-name" className="sr-only">{t.sessionDetailNameLabel}</label>
                <input
                  id="session-name"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  maxLength={180}
                  autoFocus
                />
                <button type="button" onClick={handleRename} aria-label={t.sessionDetailSaveNameAria}><Check aria-hidden="true" /></button>
                <button type="button" onClick={() => setRenaming(false)} aria-label={t.sessionDetailCancelNameAria}><X aria-hidden="true" /></button>
              </div>
            ) : (
              <div className="title-with-action">
                <h1>{session.name}</h1>
                <button type="button" onClick={() => setRenaming(true)} aria-label={t.sessionDetailRenameAria} title={t.sessionDetailRenameAria}>
                  <Edit3 aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="detail-metadata">
              <span><CalendarDays aria-hidden="true" />{new Date(session.started_at).toLocaleString(language === 'zh' ? 'zh-CN' : language === 'en' ? 'en-US' : 'vi-VN')}</span>
              <span><Clock3 aria-hidden="true" />{duration}</span>
              <span className="language-inline"><b>{partnerLanguage?.shortName ?? session.partner_language.toUpperCase()}</b>{partnerLanguage?.name ?? session.partner_language}</span>
            </div>
          </div>

          <div className="detail-actions">
            <button type="button" className="ai-command" onClick={() => void handleAiSummarize()} disabled={entries.length === 0}>
              <Sparkles aria-hidden="true" /> {t.sessionDetailSummarizeBtn}
            </button>
            <div className="export-control">
              <button type="button" onClick={() => setShowExportMenu((current) => !current)} aria-expanded={showExportMenu}>
                <Download aria-hidden="true" /> {t.sessionDetailExportBtn} <ChevronDown aria-hidden="true" />
              </button>
              {showExportMenu && (
                <div className="export-menu">
                  <button type="button" onClick={() => void handleExport('pdf')}><FileText aria-hidden="true" /> {t.sessionDetailExportPdf}</button>
                  <button type="button" onClick={() => void handleExport('txt')}><FileText aria-hidden="true" /> {t.sessionDetailExportTxt}</button>
                  <button type="button" onClick={() => void handleExport('json')}><FileJson aria-hidden="true" /> {t.sessionDetailExportJson}</button>
                </div>
              )}
            </div>
            <button type="button" className="delete-command" onClick={handleDelete} aria-label={t.sessionDetailDeleteBtn} title={t.sessionDetailDeleteBtn}>
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        </section>

        {pageError && (
          <div className="session-alert session-alert--danger" role="alert"><p>{pageError}</p></div>
        )}

        <section className="transcript-archive" aria-labelledby="transcript-heading">
          <header>
            <div>
              <h2 id="transcript-heading">{t.sessionDetailTranscriptHeading}</h2>
              <p>{t.sessionDetailEntriesCount.replace('{count}', String(entries.length))}</p>
            </div>
            <span className={`sync-label sync-label--${session.sync_status}`}>
              {session.sync_status === 'synced' ? <CircleCheck aria-hidden="true" /> : <CloudLightning aria-hidden="true" />}
              {session.sync_status === 'synced' ? t.syncStatusSynced : session.sync_status === 'failed' ? t.syncStatusFailed : t.syncStatusPending}
            </span>
          </header>

          {entries.length === 0 ? (
            <div className="transcript-archive__empty">
              <Volume2 aria-hidden="true" />
              <strong>{t.sessionDetailEmptyTranscriptTitle}</strong>
              <p>{t.sessionDetailEmptyTranscriptDesc}</p>
            </div>
          ) : (
            <ol className="archive-entry-list">
              {entries.map((entry) => {
                const hostText = entry.speaker === 'host' ? entry.original_text : entry.translated_text
                const partnerText = entry.speaker === 'partner' ? entry.original_text : entry.translated_text
                const isEditing = editingEntryId === entry.id
                return (
                  <li key={entry.id} className={`archive-entry archive-entry--${entry.speaker}`}>
                    <div className="archive-entry__meta">
                      <span>{entry.speaker === 'host' ? t.sessionDetailSpeakerYou : t.sessionDetailSpeakerPartner.replace('{name}', partnerLanguage?.name ?? t.partnerLangLabel)}</span>
                      <time>{formatTimeline(entry.start_ms - firstEntryStart)}</time>
                      {!isEditing && (
                        <button type="button" onClick={() => startEditing(entry)} aria-label={t.sessionDetailEditEntryAria} title={t.sessionDetailEditEntryAria}>
                          <Edit3 aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="entry-editor">
                        <label>
                          <span>{t.vietnameseLabel}</span>
                          <textarea
                            rows={3}
                            value={entry.speaker === 'host' ? editOrigText : editTransText}
                            onChange={(event) => entry.speaker === 'host' ? setEditOrigText(event.target.value) : setEditTransText(event.target.value)}
                          />
                        </label>
                        <label>
                          <span>{partnerLanguage?.name ?? t.partnerLangLabel}</span>
                          <textarea
                            rows={3}
                            value={entry.speaker === 'partner' ? editOrigText : editTransText}
                            onChange={(event) => entry.speaker === 'partner' ? setEditOrigText(event.target.value) : setEditTransText(event.target.value)}
                          />
                        </label>
                        <footer>
                          <button type="button" className="secondary-command" onClick={() => setEditingEntryId(null)}>{t.sessionDetailCancelEditBtn}</button>
                          <button type="button" className="primary-command" onClick={() => void handleSaveEntryEdit(entry.id)}><Check aria-hidden="true" /> {t.sessionDetailSaveEditBtn}</button>
                        </footer>
                      </div>
                    ) : (
                      <div className="archive-entry__content">
                        {hostText.trim() && <div><b>VI</b><p>{hostText}</p></div>}
                        {partnerText.trim() && <div><b>{partnerLanguage?.shortName ?? 'INTL'}</b><p>{partnerText}</p></div>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </section>
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
              <div className="report-loading" role="status">
                <Loader2 className="animate-spin" aria-hidden="true" />
                <strong>{t.summaryModalAnalyzingTitle}</strong>
                <p>{t.summaryModalAnalyzingDesc}</p>
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
