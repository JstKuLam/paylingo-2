'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Trash2, 
  Edit3, 
  FileText, 
  Check, 
  X, 
  Calendar, 
  Clock, 
  Volume2, 
  Loader2,
  Sparkles,
  CloudLightning,
  ChevronDown,
  Copy,
  Share2
} from 'lucide-react'
import { db, LocalSession, LocalTranscriptEntry } from '@/lib/db'
import { syncPendingData } from '@/lib/sync-manager'
import { createClient } from '@/lib/supabase/client'
import { downloadSessionPDF, downloadSessionTXT, downloadSessionJSON } from '@/lib/pdf-generator'

const PARTNER_LANGUAGES = [
  { code: 'any', name: 'Mọi ngôn ngữ (Any)', flag: '🌐' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'th', name: 'ภาษาไทย', flag: '🇹🇭' },
]

interface PageProps {
  params: Promise<{ id: string }>
}

export default function SessionDetailPage({ params }: PageProps) {
  const router = useRouter()
  const { id } = use(params)

  const [session, setSession] = useState<LocalSession | null>(null)
  const [entries, setEntries] = useState<LocalTranscriptEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)

  // Editing Message state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editOrigText, setEditOrigText] = useState('')
  const [editTransText, setEditTransText] = useState('')

  // AI Summary Modal state
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [sharePassword, setSharePassword] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)

  // Load Session and Entries
  useEffect(() => {
    const loadSessionData = async () => {
      try {
        // 1. Try IndexedDB first (Local-first!)
        let localSess = await db.sessions.get(id)
        let localEntries: LocalTranscriptEntry[] = []

        if (localSess) {
          localEntries = await db.transcriptEntries
            .where('session_id')
            .equals(id)
            .sortBy('start_ms')
          
          setSession(localSess)
          setNewName(localSess.name)
          setEntries(localEntries)
          setLoading(false)
          return
        }

        // 2. Fallback to Supabase if not found locally
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/')
          return
        }

        const { data: supaSess, error: sessError } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', id)
          .single()

        if (sessError || !supaSess) {
          router.push('/history')
          return
        }

        const { data: supaEntries, error: entriesError } = await supabase
          .from('transcript_entries')
          .select('*')
          .eq('session_id', id)
          .order('start_ms', { ascending: true })

        // Populate local IndexedDB so next loads are instant offline-first
        const formattedSession: LocalSession = {
          id: supaSess.id,
          username: supaSess.username,
          folder_id: supaSess.folder_id,
          name: supaSess.name,
          partner_language: supaSess.partner_language,
          started_at: supaSess.started_at,
          ended_at: supaSess.ended_at,
          duration_seconds: supaSess.duration_seconds,
          sync_status: 'synced',
          updated_at: supaSess.updated_at || new Date().toISOString()
        }

        const formattedEntries: LocalTranscriptEntry[] = (supaEntries || []).map(e => ({
          id: e.id,
          session_id: e.session_id,
          speaker: e.speaker,
          original_text: e.original_text,
          translated_text: e.translated_text,
          start_ms: e.start_ms,
          end_ms: e.end_ms,
          created_at: e.created_at,
          sync_status: 'synced',
          updated_at: e.updated_at || new Date().toISOString()
        }))

        await db.sessions.put(formattedSession)
        for (const entry of formattedEntries) {
          await db.transcriptEntries.put(entry)
        }

        setSession(formattedSession)
        setNewName(formattedSession.name)
        setEntries(formattedEntries)
      } catch (err) {
        console.error('Error loading session:', err)
        router.push('/history')
      } finally {
        setLoading(false)
      }
    }

    loadSessionData()
  }, [id, router])

  // Rename Session
  const handleRename = async () => {
    if (!session || !newName.trim()) return

    const now = new Date().toISOString()
    await db.sessions.update(session.id, {
      name: newName,
      sync_status: 'pending',
      updated_at: now
    })

    setSession(prev => prev ? { ...prev, name: newName, sync_status: 'pending', updated_at: now } : null)
    setRenaming(false)
    syncPendingData()
  }

  // Delete Session
  const handleDelete = async () => {
    if (!session || !confirm('Bạn có chắc chắn muốn xóa cuộc hội thoại này?')) return

    try {
      await db.sessions.delete(session.id)
      await db.transcriptEntries.where('session_id').equals(session.id).delete()

      const supabase = createClient()
      await supabase.from('sessions').delete().eq('id', session.id)

      router.push('/history')
      syncPendingData()
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  // Save entry edit
  const handleSaveEntryEdit = async (entryId: string) => {
    if (!editOrigText.trim() && !editTransText.trim()) return

    const now = new Date().toISOString()
    await db.transcriptEntries.update(entryId, {
      original_text: editOrigText,
      translated_text: editTransText,
      sync_status: 'pending',
      updated_at: now
    })

    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, original_text: editOrigText, translated_text: editTransText, sync_status: 'pending', updated_at: now } : e))
    setEditingEntryId(null)
    syncPendingData()
  }

  // Trigger Exports
  const handleExport = async (format: 'pdf' | 'txt' | 'json') => {
    if (!session) return
    const langObj = PARTNER_LANGUAGES.find(l => l.code === session.partner_language)
    const langName = langObj?.name || session.partner_language

    setShowExportMenu(false)

    if (format === 'pdf') {
      await downloadSessionPDF(session.name, session.partner_language, langName, session.started_at, entries)
    } else if (format === 'txt') {
      await downloadSessionTXT(session.name, langName, session.started_at, entries)
    } else {
      await downloadSessionJSON(session.name, session.partner_language, langName, session.started_at, entries)
    }
  }

  // AI Summarization
  const handleAiSummarize = async () => {
    if (!session) return
    setAiLoading(true)
    setShareLink('')
    setSharePassword('')
    setShowSummaryModal(true)

    try {
      // Step 1: Call Summarize API
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id })
      })

      const data = await res.json()
      if (data.error) {
        alert(data.error)
        setShowSummaryModal(false)
        return
      }

      setAiSummary(data.summary)
    } catch (err) {
      alert('Không thể kết nối AI tóm tắt')
      setShowSummaryModal(false)
    } finally {
      setAiLoading(false)
    }
  }

  // Create Shared Link
  const handleCreateShareLink = async () => {
    if (!session || !aiSummary) return
    setAiLoading(true)

    try {
      const res = await fetch('/api/shared/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          title: `Tóm tắt: ${session.name}`,
          summaryContent: aiSummary,
          password: sharePassword
        })
      })

      const data = await res.json()
      if (data.error) {
        alert(data.error)
        return
      }

      if (typeof window !== 'undefined') {
        const link = `${window.location.origin}/shared/summary/${data.id}`
        setShareLink(link)
      }
    } catch (err) {
      alert('Không thể tạo liên kết chia sẻ')
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-host" />
        <span className="text-slate-400 mt-4 text-sm font-medium">Đang tải cuộc hội thoại...</span>
      </div>
    )
  }

  if (!session) return null

  const partnerLangObj = PARTNER_LANGUAGES.find(l => l.code === session.partner_language)
  const durationMin = Math.floor(session.duration_seconds / 60)
  const durationSec = session.duration_seconds % 60

  return (
    <div className="min-h-screen w-full flex flex-col p-4 relative overflow-hidden bg-background">
      {/* Decorative Blob */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-host/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="w-full flex items-center justify-between py-3 px-4 glass-panel rounded-2xl mb-4 relative z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/history')}
            className="p-2 rounded-xl border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="py-1 px-3 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white focus:outline-none"
                  autoFocus
                />
                <button onClick={handleRename} className="p-1.5 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 cursor-pointer">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setRenaming(false)} className="p-1.5 rounded-lg bg-white/5 text-slate-400 border border-white/10 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-bold text-white leading-none truncate max-w-[150px] sm:max-w-xs md:max-w-md">
                  {session.name}
                </h1>
                <button onClick={() => setRenaming(true)} className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 cursor-pointer">
                  <Edit3 className="w-3 h-3" />
                </button>
              </div>
            )}
            <p className="text-[9px] text-slate-400 mt-1 font-semibold flex flex-wrap items-center gap-2">
              <Calendar className="w-3 h-3 text-host" /> {new Date(session.started_at).toLocaleString('vi-VN')}
              <span className="text-slate-600">|</span>
              <Clock className="w-3 h-3 text-partner" /> {durationMin}p {durationSec}s
              <span className="text-slate-600">|</span>
              <span>{partnerLangObj?.flag} {partnerLangObj?.name}</span>
            </p>
          </div>
        </div>

        {/* Action Triggers */}
        <div className="flex items-center gap-1.5 z-30">
          {/* AI Summary Button */}
          <button
            onClick={handleAiSummarize}
            className="p-2.5 rounded-xl border border-host/20 bg-host/5 hover:bg-host/10 text-host transition-all cursor-pointer flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide"
            title="Tóm tắt AI cuộc họp"
          >
            <Sparkles className="w-3.5 h-3.5 animate-pulse text-host" />
            <span className="hidden sm:inline">Tóm tắt AI</span>
          </button>

          {/* Dropdown Export Button */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="p-2.5 rounded-xl border border-partner/20 bg-partner/5 hover:bg-partner/10 text-partner transition-all cursor-pointer flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Xuất File</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-32 glass-panel rounded-xl py-1 z-50 shadow-2xl border border-white/5 animate-fadeIn">
                <button
                  onClick={() => handleExport('pdf')}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                >
                  <span className="text-red-400 font-extrabold">PDF</span> Xuất PDF
                </button>
                <button
                  onClick={() => handleExport('txt')}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                >
                  <span className="text-blue-400 font-extrabold">TXT</span> Xuất TXT
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                >
                  <span className="text-green-400 font-extrabold">JSON</span> Xuất JSON
                </button>
              </div>
            )}
          </div>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all cursor-pointer"
            title="Xóa vĩnh viễn"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Dialog Screen */}
      <main className="flex-1 w-full overflow-y-auto space-y-3 relative z-10 pb-6 pr-1">
        {entries.length === 0 ? (
          <div className="h-[50vh] flex flex-col items-center justify-center opacity-30 text-center select-none">
            <Volume2 className="w-14 h-14 text-host mb-3" />
            <p className="text-sm font-bold text-slate-400">Phiên dịch này không có nội dung văn bản nào được lưu</p>
          </div>
        ) : (
          entries.map((entry) => {
            const isEditing = editingEntryId === entry.id

            return (
              <div 
                key={entry.id} 
                className={`flex flex-col p-4 rounded-2xl border transition-all ${
                  entry.speaker === 'host' 
                    ? 'bg-host/5 border-host/15 max-w-[85%] mr-auto' 
                    : 'bg-partner/5 border-partner/15 max-w-[85%] ml-auto'
                }`}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 block mb-1">TIẾNG VIỆT:</label>
                      <textarea
                        rows={2}
                        value={entry.speaker === 'host' ? editOrigText : editTransText}
                        onChange={(e) => {
                          if (entry.speaker === 'host') setEditOrigText(e.target.value)
                          else setEditTransText(e.target.value)
                        }}
                        className="w-full text-xs p-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-host/50 font-medium"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-slate-400 block mb-1">{partnerLangObj?.name?.toUpperCase()}:</label>
                      <textarea
                        rows={2}
                        value={entry.speaker === 'partner' ? editOrigText : editTransText}
                        onChange={(e) => {
                          if (entry.speaker === 'partner') setEditOrigText(e.target.value)
                          else setEditTransText(e.target.value)
                        }}
                        className="w-full text-xs p-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-partner/50 font-medium"
                      />
                    </div>

                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        onClick={() => handleSaveEntryEdit(entry.id)}
                        className="py-1 px-3 rounded-lg bg-host text-white hover:opacity-90 text-xs font-bold cursor-pointer"
                      >
                        Lưu
                      </button>
                      <button
                        onClick={() => setEditingEntryId(null)}
                        className="py-1 px-3 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 text-xs font-bold cursor-pointer"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative group">
                    {/* Floating Edit Icon */}
                    <button
                      onClick={() => {
                        setEditingEntryId(entry.id)
                        setEditOrigText(entry.original_text)
                        setEditTransText(entry.translated_text)
                      }}
                      className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <div className="space-y-1.5 pr-6">
                      {/* Host translation line */}
                      <div className="flex items-start gap-1.5">
                        <span className="text-[9px] font-extrabold uppercase text-host tracking-wider min-w-[50px]">Host:</span>
                        <span className="text-xs text-slate-200 font-medium leading-relaxed">
                          {entry.speaker === 'host' ? entry.original_text : entry.translated_text}
                        </span>
                      </div>

                      {/* Partner translation line */}
                      <div className="flex items-start gap-1.5">
                        <span className="text-[9px] font-extrabold uppercase text-partner tracking-wider min-w-[50px] truncate">{partnerLangObj?.name}:</span>
                        <span className="text-xs text-slate-350 leading-relaxed font-medium">
                          {entry.speaker === 'partner' ? entry.original_text : entry.translated_text}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </main>

      {/* AI SUMMARY POPUP MODAL */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-2xl h-[85vh] glass-panel rounded-3xl p-5 md:p-8 flex flex-col relative overflow-hidden shadow-2xl">
            
            {/* Modal Title */}
            <div className="flex items-center justify-between pb-3 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-host animate-pulse" />
                <h2 className="text-sm md:text-base font-black text-white uppercase tracking-wider">AI Tóm tắt cuộc họp</h2>
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="p-1.5 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal scroll contents */}
            <div className="flex-1 overflow-y-auto py-4 min-h-0 space-y-4">
              {aiLoading ? (
                <div className="h-full flex flex-col items-center justify-center py-20 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-host" />
                  <p className="text-xs font-bold text-slate-400 mt-4">AI đang phân tích và soạn thảo bản tóm tắt...</p>
                </div>
              ) : (
                <>
                  {/* Share Setup Section */}
                  <div className="glass-panel bg-white/[0.02] border border-white/5 p-4 rounded-2xl space-y-3">
                    <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-partner" />
                      Cấu hình Chia sẻ bảo mật
                    </h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Bạn có thể tạo một URL chia sẻ công khai cho bất kỳ ai xem bản tóm tắt này. Đặt mật khẩu tùy chọn để bảo vệ tài liệu.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Đặt mật khẩu bảo mật (để trống nếu công khai)..."
                        value={sharePassword}
                        onChange={(e) => setSharePassword(e.target.value)}
                        className="flex-1 py-2 px-3.5 rounded-xl bg-slate-950 border border-white/10 text-xs font-bold text-white focus:outline-none focus:border-host/50"
                      />
                      <button
                        onClick={handleCreateShareLink}
                        className="py-2 px-5 rounded-xl bg-gradient-to-r from-host to-partner text-white font-extrabold text-xs cursor-pointer shadow-lg active:scale-95 transition-all"
                      >
                        Tạo Link Chia Sẻ
                      </button>
                    </div>

                    {shareLink && (
                      <div className="mt-3 p-3 bg-partner/5 border border-partner/20 rounded-xl flex items-center justify-between gap-3 animate-fadeIn">
                        <span className="text-[10px] font-bold text-slate-300 truncate select-all">{shareLink}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(shareLink)
                            setCopied(true)
                            setTimeout(() => setCopied(false), 2000)
                          }}
                          className="shrink-0 py-1.5 px-3 rounded-lg bg-partner text-slate-950 font-extrabold text-[10px] hover:opacity-90 flex items-center gap-1 cursor-pointer"
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copied ? 'Đã copy' : 'Copy'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Summary Text Render */}
                  <div className="glass-panel p-5 rounded-2xl space-y-3">
                    <h3 className="text-[11px] font-extrabold uppercase text-host tracking-wider">Xem trước bản tóm tắt:</h3>
                    <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed border-t border-white/5 pt-3 max-h-[300px] overflow-y-auto pr-1">
                      {aiSummary}
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
