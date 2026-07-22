'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
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
import { generatePremiumHTMLReport, downloadSummaryHTML } from '@/lib/html-generator'
import { getPartnerLanguage } from '@/lib/languages'
import { createClient } from '@/lib/supabase/client'
import { syncPendingData } from '@/lib/sync-manager'
import { formatTimeline } from '@/lib/utils'

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

export default function SessionDetailPage({ params }: PageProps) {
  const router = useRouter()
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

      await claimLegacyLocalData(user.id, username)
      void syncPendingData()

      let localSession = await db.sessions.get(id)
      if (localSession && (!localSession.owner_id || localSession.username === username)) {
        if (localSession.owner_id !== user.id) {
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

      const { data: cloudSession, error: sessionError } = await supabase
        .from('sessions')
        .select('id, owner_id, username, folder_id, name, partner_language, started_at, ended_at, duration_seconds, updated_at')
        .eq('id', id)
        .single()

      if (sessionError || !cloudSession) {
        setPageError('Không tìm thấy hội thoại hoặc bạn không có quyền truy cập.')
        return
      }

      const { data: cloudEntries, error: entriesError } = await supabase
        .from('transcript_entries')
        .select('*')
        .eq('session_id', id)
        .order('start_ms', { ascending: true })
      if (entriesError) throw entriesError

      const formattedSession: LocalSession = {
        id: cloudSession.id,
        owner_id: cloudSession.owner_id || user.id,
        username: cloudSession.username,
        folder_id: cloudSession.folder_id,
        name: cloudSession.name,
        partner_language: cloudSession.partner_language,
        started_at: cloudSession.started_at,
        ended_at: cloudSession.ended_at,
        duration_seconds: cloudSession.duration_seconds,
        sync_status: 'synced',
        updated_at: cloudSession.updated_at || new Date().toISOString(),
      }
      const formattedEntries: LocalTranscriptEntry[] = (cloudEntries || []).map((entry) => ({
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

      await db.transaction('rw', db.sessions, db.transcriptEntries, async () => {
        await db.sessions.put(formattedSession)
        await db.transcriptEntries.bulkPut(formattedEntries)
      })

      setSession(formattedSession)
      setNewName(formattedSession.name)
      setEntries(formattedEntries)
    } catch (error) {
      console.error('Error loading session:', error)
      setPageError('Không thể tải dữ liệu hội thoại. Hãy kiểm tra kết nối và thử lại.')
    } finally {
      setLoading(false)
    }
  }, [id, router])

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
    if (!session || !confirm('Xóa vĩnh viễn hội thoại và toàn bộ transcript?')) return
    setPageError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.from('sessions').delete().eq('id', session.id)
      if (error) throw error

      await db.transaction('rw', db.sessions, db.transcriptEntries, async () => {
        await db.transcriptEntries.where('session_id').equals(session.id).delete()
        await db.sessions.delete(session.id)
      })
      router.replace('/history')
    } catch (error) {
      console.error('Failed to delete session:', error)
      setPageError('Chưa thể xóa hội thoại trên máy chủ. Dữ liệu trên thiết bị vẫn được giữ nguyên.')
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
      setPageError('Không thể tạo tệp xuất. Vui lòng thử lại.')
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
      if (!response.ok || !data.summary) throw new Error(data.error || 'Không thể tạo bản tóm tắt.')
      setAiSummary(data.summary)
    } catch (error) {
      console.error('Error during AI summarize:', error)
      setSummaryError(error instanceof Error ? error.message : 'Không thể kết nối dịch vụ tóm tắt.')
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
          title: `Tóm tắt: ${session.name}`,
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
    return (
      <div className="app-loading" role="status">
        <Loader2 className="animate-spin" aria-hidden="true" />
        <span>Đang tải hội thoại</span>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="detail-not-found">
        <FileText aria-hidden="true" />
        <h1>Không mở được hội thoại</h1>
        <p>{pageError || 'Dữ liệu không tồn tại trên thiết bị này.'}</p>
        <button type="button" onClick={() => router.replace('/history')}>
          <ArrowLeft aria-hidden="true" /> Trở về lịch sử
        </button>
      </div>
    )
  }

  const partnerLanguage = getPartnerLanguage(session.partner_language)
  const firstEntryStart = entries[0]?.start_ms ?? 0
  const duration = `${Math.floor(session.duration_seconds / 60)} phút ${session.duration_seconds % 60} giây`

  return (
    <div className="workspace-shell">
      <WorkspaceHeader title="Chi tiết hội thoại" subtitle={session.name} />

      <main className="detail-main">
        <button type="button" className="back-link" onClick={() => router.push('/history')}>
          <ArrowLeft aria-hidden="true" /> Lịch sử hội thoại
        </button>

        <section className="detail-titlebar">
          <div className="detail-title">
            {renaming ? (
              <div className="rename-control">
                <label htmlFor="session-name" className="sr-only">Tên hội thoại</label>
                <input
                  id="session-name"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  maxLength={180}
                  autoFocus
                />
                <button type="button" onClick={handleRename} aria-label="Lưu tên"><Check aria-hidden="true" /></button>
                <button type="button" onClick={() => setRenaming(false)} aria-label="Hủy đổi tên"><X aria-hidden="true" /></button>
              </div>
            ) : (
              <div className="title-with-action">
                <h1>{session.name}</h1>
                <button type="button" onClick={() => setRenaming(true)} aria-label="Đổi tên hội thoại" title="Đổi tên">
                  <Edit3 aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="detail-metadata">
              <span><CalendarDays aria-hidden="true" />{new Date(session.started_at).toLocaleString('vi-VN')}</span>
              <span><Clock3 aria-hidden="true" />{duration}</span>
              <span className="language-inline"><b>{partnerLanguage?.shortName ?? session.partner_language.toUpperCase()}</b>{partnerLanguage?.name ?? session.partner_language}</span>
            </div>
          </div>

          <div className="detail-actions">
            <button type="button" className="ai-command" onClick={() => void handleAiSummarize()} disabled={entries.length === 0}>
              <Sparkles aria-hidden="true" /> Tóm tắt AI
            </button>
            <div className="export-control">
              <button type="button" onClick={() => setShowExportMenu((current) => !current)} aria-expanded={showExportMenu}>
                <Download aria-hidden="true" /> Xuất file <ChevronDown aria-hidden="true" />
              </button>
              {showExportMenu && (
                <div className="export-menu">
                  <button type="button" onClick={() => void handleExport('pdf')}><FileText aria-hidden="true" /> PDF</button>
                  <button type="button" onClick={() => void handleExport('txt')}><FileText aria-hidden="true" /> Văn bản TXT</button>
                  <button type="button" onClick={() => void handleExport('json')}><FileJson aria-hidden="true" /> Dữ liệu JSON</button>
                </div>
              )}
            </div>
            <button type="button" className="delete-command" onClick={handleDelete} aria-label="Xóa hội thoại" title="Xóa vĩnh viễn">
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
              <h2 id="transcript-heading">Transcript</h2>
              <p>{entries.length} đoạn hội thoại đã lưu</p>
            </div>
            <span className={`sync-label sync-label--${session.sync_status}`}>
              {session.sync_status === 'synced' ? 'Đã đồng bộ' : 'Có thay đổi chưa đồng bộ'}
            </span>
          </header>

          {entries.length === 0 ? (
            <div className="transcript-archive__empty">
              <Volume2 aria-hidden="true" />
              <strong>Không có nội dung văn bản</strong>
              <p>Phiên có thể đã kết thúc trước khi nhận diện được lời nói.</p>
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
                      <span>{entry.speaker === 'host' ? 'Bạn nói' : `${partnerLanguage?.name ?? 'Đối tác'} nói`}</span>
                      <time>{formatTimeline(entry.start_ms - firstEntryStart)}</time>
                      {!isEditing && (
                        <button type="button" onClick={() => startEditing(entry)} aria-label="Sửa đoạn hội thoại" title="Sửa">
                          <Edit3 aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="entry-editor">
                        <label>
                          <span>Tiếng Việt</span>
                          <textarea
                            rows={3}
                            value={entry.speaker === 'host' ? editOrigText : editTransText}
                            onChange={(event) => entry.speaker === 'host' ? setEditOrigText(event.target.value) : setEditTransText(event.target.value)}
                          />
                        </label>
                        <label>
                          <span>{partnerLanguage?.name ?? 'Ngôn ngữ đối tác'}</span>
                          <textarea
                            rows={3}
                            value={entry.speaker === 'partner' ? editOrigText : editTransText}
                            onChange={(event) => entry.speaker === 'partner' ? setEditOrigText(event.target.value) : setEditTransText(event.target.value)}
                          />
                        </label>
                        <footer>
                          <button type="button" className="secondary-command" onClick={() => setEditingEntryId(null)}>Hủy</button>
                          <button type="button" className="primary-command" onClick={() => void handleSaveEntryEdit(entry.id)}><Check aria-hidden="true" /> Lưu thay đổi</button>
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
                <div><h2 id="summary-title">Tóm tắt AI</h2><p>{session.name}</p></div>
              </div>
              <button type="button" onClick={() => setShowSummaryModal(false)} aria-label="Đóng"><X aria-hidden="true" /></button>
            </header>

            {aiLoading && !aiSummary ? (
              <div className="report-loading" role="status">
                <Loader2 className="animate-spin" aria-hidden="true" />
                <strong>Đang phân tích transcript</strong>
                <p>Thời gian xử lý phụ thuộc độ dài hội thoại và dịch vụ AI đã cấu hình.</p>
              </div>
            ) : (
              <div className="report-layout">
                <aside className="report-settings">
                  <fieldset>
                    <legend>Phong cách trình bày</legend>
                    {SUMMARY_STYLES.map((style) => (
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
                    <h3><LockKeyhole aria-hidden="true" /> Chia sẻ bảo mật</h3>
                    <p>Mật khẩu là tùy chọn. Người nhận chỉ xem được bản tóm tắt qua liên kết này.</p>
                    <label htmlFor="share-password">Mật khẩu truy cập</label>
                    <input
                      id="share-password"
                      type="password"
                      value={sharePassword}
                      onChange={(event) => setSharePassword(event.target.value)}
                      placeholder="Để trống nếu không cần"
                      maxLength={128}
                    />
                    <button type="button" onClick={handleCreateShareLink} disabled={!aiSummary || aiLoading}>
                      <Link2 aria-hidden="true" /> Tạo liên kết
                    </button>
                    {shareLink && (
                      <div className="share-result">
                        <input value={shareLink} readOnly aria-label="Liên kết chia sẻ" />
                        <button type="button" onClick={handleCopyLink} aria-label="Sao chép liên kết">
                          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                        </button>
                      </div>
                    )}
                  </section>
                </aside>

                <section className="report-preview">
                  <header>
                    <div><h3>Bản xem trước</h3><p>Báo cáo HTML từ nội dung tóm tắt</p></div>
                    <button
                      type="button"
                      onClick={async () => {
                        const { downloadSummaryHTML } = await import('@/lib/html-generator')
                        downloadSummaryHTML(session.name, aiSummary, session.started_at, partnerLanguage?.name || session.partner_language)
                      }}
                      disabled={!aiSummary}
                    >
                      <Download aria-hidden="true" /> Tải HTML
                    </button>
                  </header>
                  {summaryError ? (
                    <div className="report-error" role="alert"><p>{summaryError}</p><button type="button" onClick={() => void handleAiSummarize()}>Thử lại</button></div>
                  ) : aiSummary ? (
                    <iframe
                      title="Xem trước báo cáo tóm tắt"
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
