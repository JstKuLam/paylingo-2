'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Calendar, 
  Clock, 
  FolderOpen,
  Volume2, 
  Loader2,
  Sparkles,
  ChevronRight,
  Copy,
  Share2
} from 'lucide-react'
import { db, LocalSession, LocalFolder } from '@/lib/db'
import { syncPendingData } from '@/lib/sync-manager'
import { createClient } from '@/lib/supabase/client'

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

export default function FolderDetailPage({ params }: PageProps) {
  const router = useRouter()
  const { id } = use(params)

  const [folder, setFolder] = useState<LocalFolder | null>(null)
  const [sessions, setSessions] = useState<LocalSession[]>([])
  const [loading, setLoading] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')

  // AI Summary Modal state
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [sharePassword, setSharePassword] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)

  // Load Folder details & associated Sessions
  useEffect(() => {
    const loadFolderData = async () => {
      try {
        // 1. Try IndexedDB
        let localFolder = await db.folders.get(id)
        let localSessions: LocalSession[] = []

        if (localFolder) {
          localSessions = await db.sessions
            .where('folder_id')
            .equals(id)
            .reverse()
            .sortBy('started_at')
          
          setFolder(localFolder)
          setNewName(localFolder.name)
          setSessions(localSessions)
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

        const { data: supaFolder, error: folderError } = await supabase
          .from('folders')
          .select('*')
          .eq('id', id)
          .single()

        if (folderError || !supaFolder) {
          router.push('/history')
          return
        }

        const { data: supaSessions, error: sessError } = await supabase
          .from('sessions')
          .select('*')
          .eq('folder_id', id)
          .order('started_at', { ascending: false })

        const formattedFolder: LocalFolder = {
          id: supaFolder.id,
          username: supaFolder.username,
          name: supaFolder.name,
          created_at: supaFolder.created_at,
          updated_at: supaFolder.updated_at || new Date().toISOString(),
          sync_status: 'synced'
        }

        const formattedSessions: LocalSession[] = (supaSessions || []).map(s => ({
          id: s.id,
          username: s.username,
          folder_id: s.folder_id,
          name: s.name,
          partner_language: s.partner_language,
          started_at: s.started_at,
          ended_at: s.ended_at,
          duration_seconds: s.duration_seconds,
          sync_status: 'synced',
          updated_at: s.updated_at || new Date().toISOString()
        }))

        await db.folders.put(formattedFolder)
        for (const sess of formattedSessions) {
          await db.sessions.put(sess)
        }

        setFolder(formattedFolder)
        setNewName(formattedFolder.name)
        setSessions(formattedSessions)
      } catch (err) {
        console.error('Error loading folder:', err)
        router.push('/history')
      } finally {
        setLoading(false)
      }
    }

    loadFolderData()
  }, [id, router])

  // Rename Folder
  const handleRename = async () => {
    if (!folder || !newName.trim()) return

    const now = new Date().toISOString()
    await db.folders.update(folder.id, {
      name: newName,
      sync_status: 'pending',
      updated_at: now
    })

    setFolder(prev => prev ? { ...prev, name: newName, sync_status: 'pending', updated_at: now } : null)
    setRenaming(false)
    syncPendingData()
  }

  // Delete Folder (Un-groups sessions, moves sessions back to Root)
  const handleDeleteFolder = async () => {
    if (!folder || !confirm('Bạn có chắc chắn muốn xóa thư mục này? Các cuộc hội thoại trong thư mục sẽ không bị xóa mà được chuyển ra ngoài.')) return

    try {
      // 1. Update Dexie: set folder_id to null for all sessions in this folder
      await db.sessions.where('folder_id').equals(folder.id).modify({
        folder_id: null,
        sync_status: 'pending',
        updated_at: new Date().toISOString()
      })

      // 2. Delete Folder from Dexie
      await db.folders.delete(folder.id)

      // 3. Delete from online Supabase
      const supabase = createClient()
      
      // Update online sessions
      await supabase
        .from('sessions')
        .update({ folder_id: null })
        .eq('folder_id', folder.id)

      // Delete folder online
      await supabase
        .from('folders')
        .delete()
        .eq('id', folder.id)

      router.push('/history')
      syncPendingData()
    } catch (err) {
      console.error('Failed to delete folder:', err)
    }
  }

  // Remove a single session from this folder
  const handleRemoveSessionFromFolder = async (sessId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Xóa cuộc hội thoại này ra khỏi thư mục?')) return

    try {
      const now = new Date().toISOString()
      await db.sessions.update(sessId, {
        folder_id: null,
        sync_status: 'pending',
        updated_at: now
      })

      setSessions(prev => prev.filter(s => s.id !== sessId))

      const supabase = createClient()
      await supabase
        .from('sessions')
        .update({ folder_id: null })
        .eq('id', sessId)

      syncPendingData()
    } catch (err) {
      console.error('Failed to remove session from folder:', err)
    }
  }

  // AI Summarization for Folder
  const handleAiSummarize = async () => {
    if (!folder) return
    setAiLoading(true)
    setShareLink('')
    setSharePassword('')
    setShowSummaryModal(true)

    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folder.id })
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

  // Create Shared Link for Folder Summary
  const handleCreateShareLink = async () => {
    if (!folder || !aiSummary) return
    setAiLoading(true)

    try {
      const res = await fetch('/api/shared/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: folder.id,
          title: `Tóm tắt thư mục: ${folder.name}`,
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
        <span className="text-slate-400 mt-4 text-sm font-semibold tracking-wide">Đang tải thư mục...</span>
      </div>
    )
  }

  if (!folder) return null

  return (
    <div className="min-h-screen w-full flex flex-col p-4 md:p-6 relative overflow-hidden bg-background">
      {/* Decorative Blob */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-host/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="w-full flex items-center justify-between py-3 px-5 glass-panel rounded-3xl mb-4 relative z-20 border border-white/5">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => router.push('/history')}
            className="w-11 h-11 rounded-full border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-all flex items-center justify-center active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            {renaming ? (
              <div className="flex items-center gap-2 animate-fadeIn">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="py-1.5 px-4 rounded-full bg-slate-950 border border-white/10 text-xs font-bold text-white focus:outline-none focus:border-host/40"
                  autoFocus
                />
                <button onClick={handleRename} className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 active:scale-[0.95] transition-all cursor-pointer flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setRenaming(false)} className="w-8 h-8 rounded-full bg-white/5 text-slate-400 border border-white/10 active:scale-[0.95] transition-all cursor-pointer flex items-center justify-center shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-black text-white leading-none truncate max-w-[150px] sm:max-w-xs md:max-w-md flex items-center gap-2 tracking-wide">
                  <FolderOpen className="w-4.5 h-4.5 text-amber-glow fill-amber-glow/10" />
                  {folder.name}
                </h1>
                <button onClick={() => setRenaming(true)} className="p-1.5 rounded-full hover:bg-white/5 text-slate-400 hover:text-slate-200 cursor-pointer">
                  <Edit3 className="w-3 h-3" />
                </button>
              </div>
            )}
            <p className="text-[9px] text-slate-400 mt-1 font-bold uppercase tracking-wider flex items-center gap-2">
              <span>Tạo ngày: {new Date(folder.created_at).toLocaleDateString('vi-VN')}</span>
              <span className="text-slate-700">•</span>
              <span>{sessions.length} hội thoại</span>
            </p>
          </div>
        </div>

        {/* Header buttons (Apple HIG styled Capsule & Circle) */}
        <div className="flex items-center gap-2 z-30">
          {/* AI Folder Summarization */}
          <button
            onClick={handleAiSummarize}
            disabled={sessions.length === 0}
            className="h-10 px-4 rounded-full border border-host/30 bg-host/5 hover:bg-host/10 text-host transition-all duration-300 cursor-pointer flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none active:scale-95"
            title="Tóm tắt AI toàn bộ thư mục"
          >
            <Sparkles className="w-4 h-4 text-host" />
            <span>Tóm tắt thư mục</span>
          </button>

          {/* Delete Folder */}
          <button
            onClick={handleDeleteFolder}
            className="w-10 h-10 rounded-full border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all duration-300 cursor-pointer flex items-center justify-center active:scale-95"
            title="Xóa thư mục"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Sessions Grid inside the Folder */}
      <main className="flex-1 w-full relative z-10 overflow-y-auto min-h-0">
        {sessions.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center opacity-30 select-none px-4">
            <Volume2 className="w-14 h-14 text-host mb-3 stroke-[1.5]" />
            <p className="text-sm font-extrabold text-slate-350">Thư mục trống</p>
            <p className="text-xs text-slate-400 mt-1 max-w-[220px]">Hãy thêm hội thoại vào thư mục này ở trang Lịch sử.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6">
            {sessions.map((sess) => {
              const dateStr = new Date(sess.started_at).toLocaleDateString('vi-VN')
              const min = Math.floor(sess.duration_seconds / 60)
              const sec = sess.duration_seconds % 60
              const langObj = PARTNER_LANGUAGES.find(l => l.code === sess.partner_language)

              return (
                <div
                  key={sess.id}
                  onClick={() => router.push(`/history/sessions/${sess.id}`)}
                  className="glass-panel hover:border-white/10 rounded-3xl p-5 flex items-start justify-between cursor-pointer hover:shadow-2xl active:scale-[0.98] transition-all duration-300 relative overflow-hidden group border border-white/5"
                >
                  <div className="flex flex-col pr-4 min-w-0">
                    <h3 className="text-sm font-black text-slate-200 group-hover:text-white truncate tracking-wide">
                      {sess.name}
                    </h3>
                    
                    <div className="flex flex-wrap items-center gap-3 mt-4 text-[10px] text-slate-400 font-extrabold tracking-wider">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-host" />
                        {dateStr}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-partner" />
                        {min}p {sec}s
                      </span>
                      <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                        <span className="text-[11px] mr-1">{langObj?.flag}</span>
                        {langObj?.name || sess.partner_language}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={(e) => handleRemoveSessionFromFolder(sess.id, e)}
                      className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-slate-500 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5 transition-all z-20 cursor-pointer flex items-center justify-center active:scale-95"
                      title="Bỏ khỏi thư mục"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-all duration-300" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* AI SUMMARY POPUP MODAL */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-2xl h-[85vh] glass-panel rounded-3xl p-5 md:p-8 flex flex-col relative overflow-hidden shadow-2xl border border-white/5">
            
            {/* Modal Title */}
            <div className="flex items-center justify-between pb-3 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-host animate-pulse" />
                <h2 className="text-xs font-black text-white uppercase tracking-wider">Tóm tắt Thư mục AI</h2>
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="w-9 h-9 rounded-full border border-white/5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 cursor-pointer flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal scroll contents */}
            <div className="flex-1 overflow-y-auto py-4 min-h-0 space-y-4">
              {aiLoading ? (
                <div className="h-full flex flex-col items-center justify-center py-20 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-host" />
                  <p className="text-xs font-bold text-slate-400 mt-4 tracking-wide">AI đang phân tích và tổng hợp toàn bộ các cuộc đàm thoại...</p>
                </div>
              ) : (
                <>
                  {/* Share Setup Section */}
                  <div className="glass-panel bg-white/[0.01] border border-white/5 p-5 rounded-3xl space-y-3.5">
                    <h3 className="text-xs font-black text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
                      <Share2 className="w-4 h-4 text-partner" />
                      Cấu hình Chia sẻ bảo mật thư mục
                    </h3>
                    <p className="text-[10px] text-slate-400 leading-normal font-bold">
                      Tạo một liên kết tóm tắt tổng hợp của thư mục &ldquo;{folder.name}&rdquo;. Bảo vệ bằng mật khẩu tùy chọn để tăng cường an ninh.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Đặt mật khẩu bảo mật (để trống nếu công khai)..."
                        value={sharePassword}
                        onChange={(e) => setSharePassword(e.target.value)}
                        className="flex-1 py-3 px-4 rounded-2xl bg-slate-950 border border-white/10 text-xs font-bold text-white focus:outline-none focus:border-host/50 placeholder:text-slate-700"
                      />
                      <button
                        onClick={handleCreateShareLink}
                        className="h-11 px-5 rounded-full bg-gradient-to-r from-host to-partner text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg active:scale-95 transition-all duration-300 flex items-center justify-center gap-1"
                      >
                        Tạo Link Chia Sẻ
                      </button>
                    </div>

                    {shareLink && (
                      <div className="mt-3 p-3.5 bg-partner/5 border border-partner/20 rounded-2xl flex items-center justify-between gap-3 animate-fadeIn">
                        <span className="text-[10px] font-bold text-slate-300 truncate select-all">{shareLink}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(shareLink)
                            setCopied(true)
                            setTimeout(() => setCopied(false), 2000)
                          }}
                          className="shrink-0 h-8 px-4.5 rounded-full bg-partner text-slate-950 font-black text-[10px] uppercase tracking-wider hover:opacity-90 flex items-center gap-1 cursor-pointer transition-all duration-300 active:scale-95"
                        >
                          {copied ? <Check className="w-3 h-3 stroke-[3]" /> : <Copy className="w-3 h-3" />}
                          {copied ? 'Đã copy' : 'Copy'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Summary Text Render */}
                  <div className="glass-panel p-5 rounded-3xl space-y-3.5 border border-white/5">
                    <h3 className="text-[10px] font-black uppercase text-host tracking-wider">Xem trước bản tóm tắt thư mục:</h3>
                    <div className="text-xs text-slate-350 font-medium whitespace-pre-wrap leading-relaxed border-t border-white/5 pt-4 max-h-[300px] overflow-y-auto pr-1">
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
