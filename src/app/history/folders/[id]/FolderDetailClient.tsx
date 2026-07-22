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
import { claimLegacyLocalData, db, LocalFolder, LocalSession } from '@/lib/db'
import { downloadSummaryHTML } from '@/lib/html-generator'
import { getPartnerLanguage } from '@/lib/languages'
import { createClient } from '@/lib/supabase/client'
import { syncPendingData } from '@/lib/sync-manager'

type SummaryStyle = 'default' | 'formal' | 'casual' | 'very_casual'

const SUMMARY_STYLES: Array<{ value: SummaryStyle; label: string; description: string }> = [
  { value: 'default', label: 'Mặc định', description: 'Tự nhiên và rõ ràng' },
  { value: 'formal', label: 'Trang trọng', description: 'Chuẩn văn bản doanh nghiệp' },
  { value: 'casual', label: 'Thân mật', description: 'Gần gũi, dễ đọc' },
  { value: 'very_casual', label: 'Ghi chú nhanh', description: 'Ngắn gọn, trực tiếp' },
]

interface PageProps {
  params: Promise<{ id: string }>
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return hours > 0 ? `${hours} giờ ${minutes} phút` : `${minutes} phút`
}

export default function FolderDetailPage({ params }: PageProps) {
  const router = useRouter()
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
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const username = user?.user_metadata?.username ||
                       user?.user_metadata?.full_name ||
                       user?.user_metadata?.name ||
                       user?.email?.split('@')[0]
      if (!user || !username) {
        router.replace('/')
        return
      }
      setOwnerId(user.id)
      await claimLegacyLocalData(user.id, username)

      const localFolder = await db.folders.get(id)
      if (localFolder?.owner_id === user.id) {
        const localSessions = (await db.sessions.where('folder_id').equals(id).reverse().sortBy('started_at'))
          .filter((session) => session.owner_id === user.id)
        setFolder(localFolder)
        setNewName(localFolder.name)
        setSessions(localSessions)
        return
      }

      const { data: cloudFolder, error: folderError } = await supabase
        .from('folders')
        .select('id, owner_id, username, name, created_at, updated_at')
        .eq('id', id)
        .single()
      if (folderError || !cloudFolder) {
        setPageError('Không tìm thấy thư mục hoặc bạn không có quyền truy cập.')
        return
      }

      const { data: cloudSessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, owner_id, username, folder_id, name, partner_language, started_at, ended_at, duration_seconds, updated_at')
        .eq('folder_id', id)
        .order('started_at', { ascending: false })
      if (sessionsError) throw sessionsError

      const formattedFolder: LocalFolder = {
        id: cloudFolder.id,
        owner_id: cloudFolder.owner_id || user.id,
        username: cloudFolder.username,
        name: cloudFolder.name,
        created_at: cloudFolder.created_at,
        updated_at: cloudFolder.updated_at || new Date().toISOString(),
        sync_status: 'synced',
      }
      const formattedSessions: LocalSession[] = (cloudSessions || []).map((session) => ({
        id: session.id,
        owner_id: session.owner_id || user.id,
        username: session.username,
        folder_id: session.folder_id,
        name: session.name,
        partner_language: session.partner_language,
        started_at: session.started_at,
        ended_at: session.ended_at,
        duration_seconds: session.duration_seconds,
        sync_status: 'synced',
        updated_at: session.updated_at || new Date().toISOString(),
      }))

      await db.transaction('rw', db.folders, db.sessions, async () => {
        await db.folders.put(formattedFolder)
        await db.sessions.bulkPut(formattedSessions)
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
    const cleanName = newName.trim()
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
      const supabase = createClient()
      const { error: updateError } = await supabase.from('sessions').update({ folder_id: null }).eq('folder_id', folder.id)
      if (updateError) throw updateError
      const { error: deleteError } = await supabase.from('folders').delete().eq('id', folder.id)
      if (deleteError) throw deleteError

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
      const supabase = createClient()
      const { error } = await supabase.from('sessions').update({ folder_id: null }).eq('id', sessionId)
      if (error) throw error
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
      const data: { summary?: string; error?: string } = await response.json()
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
      const data: { id?: string; error?: string } = await response.json()
      if (!response.ok || !data.id) throw new Error(data.error || 'Không thể tạo liên kết.')
      setShareLink(`${window.location.origin}/shared/summary/${data.id}`)
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : 'Không thể tạo liên kết chia sẻ.')
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
    return <div className="app-loading" role="status"><Loader2 className="animate-spin" aria-hidden="true" /><span>Đang tải thư mục</span></div>
  }

  if (!folder) {
    return (
      <div className="detail-not-found">
        <FolderOpen aria-hidden="true" />
        <h1>Không mở được thư mục</h1>
        <p>{pageError || 'Dữ liệu không tồn tại trên thiết bị này.'}</p>
        <button type="button" onClick={() => router.replace('/history')}><ArrowLeft aria-hidden="true" /> Trở về lịch sử</button>
      </div>
    )
  }

  const totalDuration = sessions.reduce((total, session) => total + session.duration_seconds, 0)

  return (
    <div className="workspace-shell">
      <WorkspaceHeader title="Thư mục hội thoại" subtitle={folder.name} />
      <main className="detail-main">
        <button type="button" className="back-link" onClick={() => router.push('/history')}><ArrowLeft aria-hidden="true" /> Lịch sử hội thoại</button>

        <section className="detail-titlebar folder-titlebar">
          <div className="detail-title">
            {renaming ? (
              <div className="rename-control">
                <label htmlFor="folder-title" className="sr-only">Tên thư mục</label>
                <input id="folder-title" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={100} autoFocus />
                <button type="button" onClick={handleRename} aria-label="Lưu tên"><Check aria-hidden="true" /></button>
                <button type="button" onClick={() => setRenaming(false)} aria-label="Hủy đổi tên"><X aria-hidden="true" /></button>
              </div>
            ) : (
              <div className="title-with-action"><span className="folder-title-icon"><Folder aria-hidden="true" /></span><h1>{folder.name}</h1><button type="button" onClick={() => setRenaming(true)} aria-label="Đổi tên thư mục"><Edit3 aria-hidden="true" /></button></div>
            )}
            <div className="detail-metadata">
              <span><CalendarDays aria-hidden="true" />Tạo {new Date(folder.created_at).toLocaleDateString('vi-VN')}</span>
              <span><Clock3 aria-hidden="true" />{formatDuration(totalDuration)}</span>
              <span>{sessions.length} hội thoại</span>
            </div>
          </div>
          <div className="detail-actions">
            <button type="button" className="ai-command" onClick={() => void handleAiSummarize()} disabled={sessions.length === 0}><Sparkles aria-hidden="true" /> Tóm tắt thư mục</button>
            <button type="button" className="delete-command" onClick={handleDeleteFolder} aria-label="Xóa thư mục" title="Xóa thư mục"><Trash2 aria-hidden="true" /></button>
          </div>
        </section>

        {pageError && <div className="session-alert session-alert--danger" role="alert"><p>{pageError}</p></div>}

        <section className="folder-session-section">
          <header><div><h2>Hội thoại trong thư mục</h2><p>Mở từng phiên để xem transcript và xuất tài liệu.</p></div><span>{sessions.length} mục</span></header>
          {sessions.length === 0 ? (
            <div className="history-empty"><FolderOpen aria-hidden="true" /><strong>Thư mục đang trống</strong><p>Chọn nhiều hội thoại từ trang lịch sử để thêm vào thư mục.</p></div>
          ) : (
            <div className="history-list">
              {sessions.map((session) => {
                const language = getPartnerLanguage(session.partner_language)
                return (
                  <div className="folder-session-row" key={session.id}>
                    <button type="button" onClick={() => router.push(`/history/sessions/${session.id}`)}>
                      <span className="history-row__date"><strong>{new Date(session.started_at).toLocaleDateString('vi-VN', { day: '2-digit' })}</strong><small>{new Date(session.started_at).toLocaleDateString('vi-VN', { month: 'short' })}</small></span>
                      <span className="history-row__main"><strong>{session.name}</strong><small><span className="language-inline"><b>{language?.shortName ?? session.partner_language.toUpperCase()}</b>{language?.name ?? session.partner_language}</span><span><Clock3 aria-hidden="true" />{formatDuration(session.duration_seconds)}</span></small></span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                    <button type="button" className="unlink-command" onClick={() => void handleRemoveSession(session.id)} aria-label="Chuyển khỏi thư mục" title="Chuyển khỏi thư mục"><Unlink aria-hidden="true" /></button>
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
              <div><span className="dialog-icon dialog-icon--ai"><Sparkles aria-hidden="true" /></span><div><h2 id="folder-summary-title">Tóm tắt thư mục</h2><p>{folder.name}</p></div></div>
              <button type="button" onClick={() => setShowSummaryModal(false)} aria-label="Đóng"><X aria-hidden="true" /></button>
            </header>
            {aiLoading && !aiSummary ? (
              <div className="report-loading" role="status"><Loader2 className="animate-spin" aria-hidden="true" /><strong>Đang phân tích các hội thoại</strong><p>Thời gian xử lý phụ thuộc tổng độ dài transcript.</p></div>
            ) : (
              <div className="report-layout">
                <aside className="report-settings">
                  <fieldset>
                    <legend>Phong cách trình bày</legend>
                    {SUMMARY_STYLES.map((style) => (
                      <button type="button" key={style.value} className={selectedStyle === style.value ? 'is-active' : ''} onClick={() => void handleAiSummarize(style.value)} disabled={aiLoading}>
                        <span><strong>{style.label}</strong><small>{style.description}</small></span>{selectedStyle === style.value && <Check aria-hidden="true" />}
                      </button>
                    ))}
                  </fieldset>
                  <section className="share-settings">
                    <h3><LockKeyhole aria-hidden="true" /> Chia sẻ bảo mật</h3><p>Mật khẩu là tùy chọn và được lưu dưới dạng dẫn xuất một chiều.</p>
                    <label htmlFor="folder-share-password">Mật khẩu truy cập</label>
                    <input id="folder-share-password" type="password" value={sharePassword} onChange={(event) => setSharePassword(event.target.value)} placeholder="Để trống nếu không cần" maxLength={128} />
                    <button type="button" onClick={handleCreateShareLink} disabled={!aiSummary || aiLoading}><Link2 aria-hidden="true" /> Tạo liên kết</button>
                    {shareLink && <div className="share-result"><input value={shareLink} readOnly aria-label="Liên kết chia sẻ" /><button type="button" onClick={handleCopyLink} aria-label="Sao chép liên kết">{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button></div>}
                  </section>
                </aside>
                <section className="report-preview report-preview--text">
                  <header><div><h3>Bản tóm tắt</h3><p>Tổng hợp từ {sessions.length} hội thoại</p></div><button type="button" onClick={async () => { const { downloadSummaryHTML } = await import('@/lib/html-generator'); downloadSummaryHTML(folder.name, aiSummary, folder.created_at, 'Nhiều ngôn ngữ') }} disabled={!aiSummary}><Download aria-hidden="true" /> Tải HTML</button></header>
                  {summaryError ? <div className="report-error" role="alert"><p>{summaryError}</p><button type="button" onClick={() => void handleAiSummarize()}>Thử lại</button></div> : <article>{aiSummary}</article>}
                </section>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
