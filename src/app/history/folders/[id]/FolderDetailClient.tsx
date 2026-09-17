'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Edit3,
  Folder,
  FolderOpen,
  Link2,
  Loader2,
  LockKeyhole,
  Sparkles,
  Trash2,
  Unlink,
  X,
} from 'lucide-react'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import { useLanguage } from '@/hooks/useLanguage'
import { claimLegacyLocalData, db, LocalFolder, LocalSession } from '@/lib/db'
import { authClient } from '@/lib/auth-client'
import { getPartnerLanguage } from '@/lib/languages'
import { syncPendingData } from '@/lib/sync-manager'

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

export default function FolderDetailPage({ params }: PageProps) {
  const router = useRouter()
  const { language, t } = useLanguage()
  const rawParams = use(params)
  const id = (typeof rawParams.id === 'string' && rawParams.id !== 'fallback' && rawParams.id !== '')
    ? rawParams.id
    : (typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean).pop() || '' : '')
  const [folder, setFolder] = useState<LocalFolder | null>(null)
  const [sessions, setSessions] = useState<LocalSession[]>([])
  const [ownerId, setOwnerId] = useState('')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [sharePassword, setSharePassword] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<SummaryStyle>('default')

  const loadFolderData = useCallback(async () => {
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
      setOwnerId(user.id)
      await claimLegacyLocalData(user.id, legacyUsername)

      const localFolder = await db.folders.get(id)
      if (localFolder?.owner_id === user.id) {
        const localSessions = (await db.sessions.where('folder_id').equals(id).reverse().sortBy('started_at'))
          .filter((session) => session.owner_id === user.id)
        setFolder(localFolder)
        setNewName(localFolder.name)
        setSessions(localSessions)
        return
      }

      const cloudRes = await fetch(`/api/history?table=folders&id=${encodeURIComponent(id)}&single=1`)
        .then(async (r) => {
          if (!r.ok) return {}
          const ct = r.headers.get('content-type') || ''
          return ct.includes('application/json') ? r.json() : {}
        })
        .catch(() => ({}))
      const cloudFolder = cloudRes.item
      const cloudSessions = cloudRes.sessions || []

      if (!cloudFolder) {
        setPageError('Không tìm thấy thư mục hoặc bạn không có quyền truy cập.')
        return
      }

      const formattedFolder: LocalFolder = {
        id: cloudFolder.id,
        owner_id: cloudFolder.owner_id || user.id,
        username: cloudFolder.username,
        name: cloudFolder.name,
        created_at: cloudFolder.created_at,
        updated_at: cloudFolder.updated_at || new Date().toISOString(),
        sync_status: 'synced',
      }
      type CloudSessionItem = {
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
      const formattedSessions: LocalSession[] = (cloudSessions as CloudSessionItem[]).map((session) => ({
        id: session.id,
        owner_id: session.owner_id || user.id,
        username: session.username || username,
        folder_id: session.folder_id,
        name: session.name,
        partner_language: session.partner_language,
        started_at: session.started_at,
        ended_at: session.ended_at,
        duration_seconds: session.duration_seconds,
        sync_status: 'synced',
        updated_at: session.updated_at || new Date().toISOString(),
      }))

      const existingSessions = await db.sessions.where('folder_id').equals(id).toArray()
      const localPendingSessionIds = new Set(existingSessions.filter(s => s.sync_status === 'pending').map(s => s.id))
      const safeSessions = formattedSessions.filter(s => !localPendingSessionIds.has(s.id))

      await db.transaction('rw', db.folders, db.sessions, async () => {
        if (!localFolder || localFolder.sync_status !== 'pending') {
          await db.folders.put(formattedFolder)
        }
        if (safeSessions.length > 0) {
          await db.sessions.bulkPut(safeSessions)
        }
      })
      setFolder(formattedFolder)
      setNewName(formattedFolder.name)
      setSessions(formattedSessions)
    } catch (error) {
      console.error('Error loading folder:', error)
      setPageError('Không thể tải thư mục. Hãy kiểm tra kết nối và thử lại.')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadFolderData(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadFolderData])

  const handleRename = async () => {
    const cleanName = newName.trim().slice(0, 200)
    if (!folder || !cleanName) return
    const now = new Date().toISOString()
    await db.folders.update(folder.id, { name: cleanName, sync_status: 'pending', updated_at: now })
    setFolder((current) => current ? { ...current, name: cleanName, sync_status: 'pending', updated_at: now } : null)
    setRenaming(false)
    void syncPendingData()
  }

  const handleDeleteFolder = async () => {
    if (!folder || !confirm('Xóa thư mục? Các hội thoại bên trong sẽ được chuyển về danh sách chính.')) return
    setPageError('')
    try {
      const res = await fetch('/api/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'folders', field: 'id', value: folder.id }),
      })
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`)
      }

      const now = new Date().toISOString()
      await db.transaction('rw', db.folders, db.sessions, async () => {
        await db.sessions.where('folder_id').equals(folder.id).modify({
          folder_id: null,
          sync_status: 'pending',
          updated_at: now,
        })
        await db.folders.delete(folder.id)
      })
      router.replace('/history')
      void syncPendingData()
    } catch (error) {
      console.error('Failed to delete folder:', error)
      setPageError('Chưa thể xóa thư mục trên máy chủ. Không có dữ liệu cục bộ nào bị thay đổi.')
    }
  }

  const handleRemoveSession = async (sessionId: string) => {
    if (!confirm('Chuyển hội thoại này ra khỏi thư mục?')) return
    setPageError('')
    try {
      const res = await fetch('/api/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'sessions', field: 'id', value: sessionId, payload: { folder_id: null } }),
      })
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`)
      }
      const now = new Date().toISOString()
      await db.sessions.update(sessionId, { folder_id: null, sync_status: 'pending', updated_at: now })
      setSessions((current) => current.filter((session) => session.id !== sessionId))
      void syncPendingData()
    } catch (error) {
      console.error('Failed to remove session from folder:', error)
      setPageError('Không thể chuyển hội thoại ra khỏi thư mục. Vui lòng thử lại khi có mạng.')
    }
  }

  const handleAiSummarize = async (style: SummaryStyle = selectedStyle) => {
    if (!folder || sessions.length === 0 || !ownerId) return
    setAiLoading(true)
    setShowSummaryModal(true)
    setSelectedStyle(style)
    setSummaryError('')
    setShareLink('')
    try {
      const localSessions = (await db.sessions.where('folder_id').equals(folder.id).toArray())
        .filter((session) => session.owner_id === ownerId)
      const entriesBySession = await Promise.all(localSessions.map(async (session) => {
        const sessionEntries = await db.transcriptEntries.where('session_id').equals(session.id).sortBy('start_ms')
        return sessionEntries.map((entry) => ({ ...entry, sessionName: session.name }))
      }))

      const response = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folder.id, sessions: localSessions, entries: entriesBySession.flat(), style }),
      })
      let data: { summary?: string; error?: string } = {}
      try {
        data = await response.json()
      } catch {
        throw new Error(response.status === 413 ? 'Dữ liệu quá lớn để tóm tắt' : 'Không thể kết nối dịch vụ tóm tắt.')
      }
      if (!response.ok || !data.summary) throw new Error(data.error || 'Không thể tạo bản tóm tắt.')
      setAiSummary(data.summary)
    } catch (error) {
      console.error('Error during folder summary:', error)
      setSummaryError(error instanceof Error ? error.message : 'Không thể kết nối dịch vụ tóm tắt.')
    } finally {
      setAiLoading(false)
    }
  }

  const handleCreateShareLink = async () => {
    if (!folder || !aiSummary) return
    setAiLoading(true)
    setSummaryError('')
    try {
      const response = await fetch('/api/shared/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: folder.id,
          title: `Tóm tắt thư mục: ${folder.name}`,
          summaryContent: aiSummary,
          password: sharePassword,
        }),
      })
      let data: { id?: string; error?: string } = {}
      try {
        data = await response.json()
      } catch {
        throw new Error('Không thể tạo liên kết.')
      }
      if (!response.ok || !data.id) throw new Error(data.error || 'Không thể tạo liên kết.')
      setShareLink(`${window.location.origin}/shared/summary/${data.id}`)
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : 'Không thể tạo liên kết chia sẻ.')
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
    return <div className="app-loading" role="status"><Loader2 className="animate-spin" aria-hidden="true" /><span>{t.historyLoading}</span></div>
  }

  if (!folder) {
    return (
      <div className="detail-not-found">
        <FolderOpen aria-hidden="true" />
        <h1>{t.folderDetailNotFoundTitle}</h1>
        <p>{pageError || t.folderDetailNotFoundDesc}</p>
        <button type="button" onClick={() => router.replace('/history')}><ArrowLeft aria-hidden="true" /> {t.folderDetailBackBtn}</button>
      </div>
    )
  }

  const totalDuration = sessions.reduce((total, session) => total + session.duration_seconds, 0)
  const summaryStyles: Array<{ value: SummaryStyle; label: string; description: string }> = [
    { value: 'default', label: t.summaryStyleDefault, description: t.summaryStyleDefaultDesc },
    { value: 'formal', label: t.summaryStyleFormal, description: t.summaryStyleFormalDesc },
    { value: 'casual', label: t.summaryStyleCasual, description: t.summaryStyleCasualDesc },
    { value: 'very_casual', label: t.summaryStyleVeryCasual, description: t.summaryStyleVeryCasualDesc },
  ]

  return (
    <div className="workspace-shell">
      <WorkspaceHeader title={t.folderDetailHeaderTitle} subtitle={folder.name} />
      <main className="detail-main">
        <button type="button" className="back-link" onClick={() => router.push('/history')}><ArrowLeft aria-hidden="true" /> {t.folderDetailBackLink}</button>

        <section className="detail-titlebar">
          <div className="detail-title">
            {renaming ? (
              <div className="rename-control">
                <label htmlFor="folder-title" className="sr-only">{t.folderNameLabel}</label>
                <input id="folder-title" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={100} autoFocus />
                <button type="button" onClick={handleRename} aria-label={t.folderDetailSaveNameAria}><Check aria-hidden="true" /></button>
                <button type="button" onClick={() => setRenaming(false)} aria-label={t.folderDetailCancelNameAria}><X aria-hidden="true" /></button>
              </div>
            ) : (
              <div className="title-with-action"><span className="folder-title-icon"><Folder aria-hidden="true" /></span><h1>{folder.name}</h1><button type="button" onClick={() => setRenaming(true)} aria-label={t.folderDetailRenameAria}><Edit3 aria-hidden="true" /></button></div>
            )}
            <div className="detail-metadata">
              <span><CalendarDays aria-hidden="true" />{t.folderDetailCreatedDate.replace('{date}', new Date(folder.created_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : language === 'en' ? 'en-US' : 'vi-VN'))}</span>
              <span><Clock3 aria-hidden="true" />{formatDuration(totalDuration, t)}</span>
              <span>{t.folderDetailConversationsCount.replace('{count}', String(sessions.length))}</span>
            </div>
          </div>
          <div className="detail-actions">
            <button type="button" className="ai-command" onClick={() => void handleAiSummarize()} disabled={sessions.length === 0}><Sparkles aria-hidden="true" /> {t.folderDetailSummarizeBtn}</button>
            <button type="button" className="delete-command" onClick={handleDeleteFolder} aria-label={t.folderDetailDeleteBtn} title={t.folderDetailDeleteBtn}><Trash2 aria-hidden="true" /></button>
          </div>
        </section>

        {pageError && <div className="session-alert session-alert--danger" role="alert"><p>{pageError}</p></div>}

        <section className="folder-session-section">
          <header><div><h2>{t.folderDetailSessionsSectionTitle}</h2><p>{t.folderDetailSessionsSectionDesc}</p></div><span>{t.itemsCount.replace('{count}', String(sessions.length))}</span></header>
          {sessions.length === 0 ? (
            <div className="history-empty"><FolderOpen aria-hidden="true" /><strong>{t.folderDetailEmptyFolderTitle}</strong><p>{t.folderDetailEmptyFolderDesc}</p></div>
          ) : (
            <div className="history-list">
              {sessions.map((session) => {
                const partnerLang = getPartnerLanguage(session.partner_language)
                return (
                  <div className="folder-session-row" key={session.id}>
                    <button type="button" onClick={() => router.push(`/history/sessions/${session.id}`)}>
                      <span className="history-row__date"><strong>{new Date(session.started_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : language === 'en' ? 'en-US' : 'vi-VN', { day: '2-digit' })}</strong><small>{new Date(session.started_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : language === 'en' ? 'en-US' : 'vi-VN', { month: 'short' })}</small></span>
                      <span className="history-row__main"><strong>{session.name}</strong><small><span className="language-inline"><b>{partnerLang?.shortName ?? session.partner_language.toUpperCase()}</b>{partnerLang?.name ?? session.partner_language}</span><span><Clock3 aria-hidden="true" />{formatDuration(session.duration_seconds, t)}</span></small></span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                    <button type="button" className="unlink-command" onClick={() => void handleRemoveSession(session.id)} aria-label={t.folderDetailRemoveSessionAria} title={t.folderDetailRemoveSessionAria}><Unlink aria-hidden="true" /></button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {showSummaryModal && (
        <div className="dialog-backdrop" role="presentation">
          <section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-summary-title">
            <header>
              <div><span className="dialog-icon dialog-icon--ai"><Sparkles aria-hidden="true" /></span><div><h2 id="folder-summary-title">{t.summaryModalHeaderTitle}</h2><p>{folder.name}</p></div></div>
              <button type="button" onClick={() => setShowSummaryModal(false)} aria-label={t.closeAria}><X aria-hidden="true" /></button>
            </header>
            {aiLoading && !aiSummary ? (
              <div className="report-loading" role="status"><Loader2 className="animate-spin" aria-hidden="true" /><strong>{t.summaryModalAnalyzingTitle}</strong><p>{t.summaryModalAnalyzingDesc}</p></div>
            ) : (
              <div className="report-layout">
                <aside className="report-settings">
                  <fieldset>
                    <legend>{t.summaryModalStyleHeading}</legend>
                    {summaryStyles.map((style) => (
                      <button type="button" key={style.value} className={selectedStyle === style.value ? 'is-active' : ''} onClick={() => void handleAiSummarize(style.value)} disabled={aiLoading}>
                        <span><strong>{style.label}</strong><small>{style.description}</small></span>{selectedStyle === style.value && <Check aria-hidden="true" />}
                      </button>
                    ))}
                  </fieldset>
                  <section className="share-settings">
                    <h3><LockKeyhole aria-hidden="true" /> {t.summaryModalShareHeading}</h3><p>{t.summaryModalShareDesc}</p>
                    <label htmlFor="folder-share-password">{t.summaryModalPasswordLabel}</label>
                    <input id="folder-share-password" type="password" value={sharePassword} onChange={(event) => setSharePassword(event.target.value)} placeholder={t.summaryModalPasswordPlaceholder} maxLength={128} />
                    <button type="button" onClick={handleCreateShareLink} disabled={!aiSummary || aiLoading}><Link2 aria-hidden="true" /> {t.summaryModalCreateLinkBtn}</button>
                    {shareLink && <div className="share-result"><input value={shareLink} readOnly aria-label={t.summaryModalCopyLinkAria} /><button type="button" onClick={handleCopyLink} aria-label={t.summaryModalCopyLinkAria}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button></div>}
                  </section>
                </aside>
                <section className="report-preview report-preview--text">
                  <header><div><h3>{t.summaryModalHeaderTitle}</h3><p>{t.itemsCount.replace('{count}', String(sessions.length))}</p></div><button type="button" onClick={async () => { const { downloadSummaryHTML } = await import('@/lib/html-generator'); downloadSummaryHTML(folder.name, aiSummary, folder.created_at, 'Nhiều ngôn ngữ') }} disabled={!aiSummary}><Download aria-hidden="true" /> {t.summaryModalDownloadHtmlBtn}</button></header>
                  {summaryError ? <div className="report-error" role="alert"><p>{summaryError}</p><button type="button" onClick={() => void handleAiSummarize()}>{t.summaryModalRetryBtn}</button></div> : <article>{aiSummary}</article>}
                </section>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
