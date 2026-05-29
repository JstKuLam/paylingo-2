'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Search, 
  Trash2, 
  Edit3, 
  FileText, 
  Check, 
  X, 
  Calendar, 
  Clock, 
  Languages,
  Loader2,
  FolderOpen,
  CloudLightning,
  ChevronRight,
  Database,
  Volume2
} from 'lucide-react'
import { db, LocalSession, LocalTranscriptEntry } from '@/lib/db'
import { syncPendingData } from '@/lib/sync-manager'
import { createClient } from '@/lib/supabase/client'
import { downloadSessionPDF } from '@/lib/pdf-generator'

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

export default function HistoryPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<LocalSession[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  
  // Selected Session Details for Modal View
  const [selectedSession, setSelectedSession] = useState<LocalSession | null>(null)
  const [sessionEntries, setSessionEntries] = useState<LocalTranscriptEntry[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  
  // Editing Message state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editOrigText, setEditOrigText] = useState('')
  const [editTransText, setEditTransText] = useState('')

  // 1. Authenticate check & Load sessions from Dexie (local-first!)
  useEffect(() => {
    const loadSessions = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      const username = session?.user?.user_metadata?.username
      if (!session || !username) {
        router.push('/')
        return
      }
      
      // Fetch all local sessions belonging to this username, sorted by started_at desc
      const localSessions = await db.sessions
        .where('username')
        .equals(username)
        .reverse()
        .sortBy('started_at')

      setSessions(localSessions)
      setLoading(false)
    }

    loadSessions()
  }, [router])

  // 2. Refresh lists on query filter change
  const filteredSessions = sessions.filter(sess => {
    const term = searchQuery.toLowerCase().trim()
    if (!term) return true
    
    // Check if session name contains term
    const matchesName = sess.name.toLowerCase().includes(term)
    
    // We can also let CJK/Vietnamese searches work flawlessly
    return matchesName
  })

  // 3. Open Detail Modal
  const handleOpenDetails = async (session: LocalSession) => {
    setSelectedSession(session)
    setNewName(session.name)
    
    // Fetch associated transcript entries sorted by start_ms
    const entries = await db.transcriptEntries
      .where('session_id')
      .equals(session.id)
      .sortBy('start_ms')

    setSessionEntries(entries)
  }

  // 4. Close Details
  const handleCloseDetails = () => {
    setSelectedSession(null)
    setSessionEntries([])
    setEditingEntryId(null)
    setRenamingId(null)
  }

  // 5. Rename Session
  const handleRename = async () => {
    if (!selectedSession || !newName.trim()) return

    const now = new Date().toISOString()
    await db.sessions.update(selectedSession.id, {
      name: newName,
      sync_status: 'pending',
      updated_at: now
    })

    // Update in UI lists
    setSessions(prev => prev.map(s => s.id === selectedSession.id ? { ...s, name: newName, sync_status: 'pending', updated_at: now } : s))
    setSelectedSession(prev => prev ? { ...prev, name: newName, sync_status: 'pending', updated_at: now } : null)
    setRenamingId(null)
    
    // Trigger sync
    syncPendingData()
  }

  // 6. Delete Session (both Dexie and Supabase)
  const handleDeleteSession = async (sessId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa vĩnh viễn cuộc hội thoại này?')) return

    try {
      // 1. Delete locally from Dexie
      await db.sessions.delete(sessId)
      await db.transcriptEntries.where('session_id').equals(sessId).delete()

      // Update UI list
      setSessions(prev => prev.filter(s => s.id !== sessId))
      
      // 2. Delete from online Supabase using browser client
      const supabase = createClient()
      await supabase.from('sessions').delete().eq('id', sessId)
      
      handleCloseDetails()
      syncPendingData()
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  // 7. Save Message Edits
  const handleSaveEntryEdit = async (entryId: string) => {
    if (!editOrigText.trim() && !editTransText.trim()) return

    const now = new Date().toISOString()
    await db.transcriptEntries.update(entryId, {
      original_text: editOrigText,
      translated_text: editTransText,
      sync_status: 'pending',
      updated_at: now
    })

    // Update in local UI state
    setSessionEntries(prev => prev.map(e => e.id === entryId ? { ...e, original_text: editOrigText, translated_text: editTransText, sync_status: 'pending', updated_at: now } : e))
    setEditingEntryId(null)
    
    // Sync
    syncPendingData()
  }

  // 8. Export to PDF
  const handleExportPDF = async () => {
    if (!selectedSession) return

    const langObj = PARTNER_LANGUAGES.find(l => l.code === selectedSession.partner_language)
    const langName = langObj?.name || selectedSession.partner_language

    await downloadSessionPDF(
      selectedSession.name,
      selectedSession.partner_language,
      langName,
      selectedSession.started_at,
      sessionEntries
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-host" />
        <span className="text-slate-400 mt-4 text-sm font-medium">Đang tải lịch sử hội thoại...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full flex flex-col p-4 relative overflow-hidden bg-background">
      {/* Decorative Blur Blobs */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-host/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="w-full flex items-center justify-between py-3 px-4 glass-panel rounded-2xl mb-4 relative z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/session')}
            className="p-2 rounded-xl border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white leading-none">Lịch sử dịch</h1>
            <p className="text-[10px] text-slate-400 mt-1 font-semibold">
              Quản lý các cuộc đàm thoại đã ghi
            </p>
          </div>
        </div>

        <div className="text-xs font-bold text-slate-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-host" />
          Offline-first (Dexie)
        </div>
      </header>

      {/* Search Bar */}
      <div className="w-full mb-4 relative z-20 shrink-0">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên cuộc hội thoại..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full py-3.5 pl-11 pr-4 rounded-xl glass-input text-sm font-medium"
          />
        </div>
      </div>

      {/* Content Area */}
      <main className="flex-1 w-full relative z-10 overflow-y-auto min-h-0">
        {filteredSessions.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center opacity-30 select-none px-4">
            <FolderOpen className="w-14 h-14 text-host mb-3 stroke-[1.5]" />
            <p className="text-sm font-bold text-slate-300">Không tìm thấy cuộc hội thoại nào</p>
            <p className="text-xs text-slate-400 mt-1 max-w-[220px]">Hãy bắt đầu một phiên dịch mới trên trang chủ để lưu dữ liệu.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-6">
            {filteredSessions.map((sess) => {
              const dateStr = new Date(sess.started_at).toLocaleDateString('vi-VN')
              const min = Math.floor(sess.duration_seconds / 60)
              const sec = sess.duration_seconds % 60
              const langObj = PARTNER_LANGUAGES.find(l => l.code === sess.partner_language)

              return (
                <div
                  key={sess.id}
                  onClick={() => handleOpenDetails(sess)}
                  className="glass-panel hover:border-white/10 rounded-2xl p-5 flex items-start justify-between cursor-pointer hover:scale-[1.01] hover:shadow-lg hover:shadow-black/10 transition-all duration-300 relative overflow-hidden group"
                >
                  <div className="flex flex-col pr-4 min-w-0">
                    <h3 className="text-sm font-bold text-slate-200 group-hover:text-white truncate">
                      {sess.name}
                    </h3>
                    
                    <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-slate-400 font-bold">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-host" />
                        {dateStr}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-partner" />
                        {min}p {sec}s
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-xs">{langObj?.flag}</span>
                        {langObj?.name || sess.partner_language}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {sess.sync_status === 'pending' && (
                      <span className="px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-widest bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 flex items-center gap-1">
                        <CloudLightning className="w-2.5 h-2.5" />
                        Chờ đồng bộ
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-all" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* DETAIL MODAL OVERLAY */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 animate-fadeIn">
          <div className="w-full max-w-4xl h-[90vh] glass-panel rounded-3xl p-5 md:p-8 flex flex-col relative overflow-hidden max-h-[750px] shadow-2xl">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-white/5 shrink-0">
              <div className="flex-1 mr-4 min-w-0">
                {renamingId ? (
                  <div className="flex items-center gap-2 max-w-md">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white focus:outline-none"
                    />
                    <button
                      onClick={handleRename}
                      className="p-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-all cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setRenamingId(null)}
                      className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-base md:text-lg font-black text-white leading-none truncate max-w-xs md:max-w-md">
                      {selectedSession.name}
                    </h2>
                    <button
                      onClick={() => setRenamingId(selectedSession.id)}
                      className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                
                <p className="text-[10px] text-slate-400 mt-2 font-bold flex items-center gap-3">
                  <span>Khởi tạo: {new Date(selectedSession.started_at).toLocaleString('vi-VN')}</span>
                  <span>Ngôn ngữ đối tác: {PARTNER_LANGUAGES.find(l => l.code === selectedSession.partner_language)?.name}</span>
                </p>
              </div>

              {/* Action triggers */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleExportPDF}
                  className="p-2.5 rounded-xl border border-partner/20 bg-partner/5 hover:bg-partner/10 text-partner transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
                  title="Xuất file PDF"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Xuất PDF</span>
                </button>
                
                <button
                  onClick={() => handleDeleteSession(selectedSession.id)}
                  className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all cursor-pointer"
                  title="Xóa vĩnh viễn"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  onClick={handleCloseDetails}
                  className="p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Dialog columns */}
            <div className="flex-1 overflow-y-auto py-5 space-y-4 pr-1 min-h-0">
              {sessionEntries.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
                  <Volume2 className="w-10 h-10 text-host mb-2" />
                  <p className="text-xs font-bold text-slate-400">Phiên hội thoại này không có nội dung text</p>
                </div>
              ) : (
                sessionEntries.map((entry) => {
                  const isEditing = editingEntryId === entry.id
                  const partObj = PARTNER_LANGUAGES.find(l => l.code === selectedSession.partner_language)

                  return (
                    <div 
                      key={entry.id} 
                      className={`flex flex-col p-3.5 rounded-2xl border transition-all ${
                        entry.speaker === 'host' 
                          ? 'bg-host/5 border-host/15 max-w-[90%] mr-auto' 
                          : 'bg-partner/5 border-partner/15 max-w-[90%] ml-auto'
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
                              className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-white/10 text-white focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-bold text-slate-400 block mb-1">{partObj?.name?.toUpperCase()}:</label>
                            <textarea
                              rows={2}
                              value={entry.speaker === 'partner' ? editOrigText : editTransText}
                              onChange={(e) => {
                                if (entry.speaker === 'partner') setEditOrigText(e.target.value)
                                else setEditTransText(e.target.value)
                              }}
                              className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-white/10 text-white focus:outline-none"
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
                          {/* Floating Edit Button */}
                          <button
                            onClick={() => {
                              setEditingEntryId(entry.id)
                              setEditOrigText(entry.original_text)
                              setEditTransText(entry.translated_text)
                            }}
                            className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                            title="Sửa nội dung câu này"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>

                          <div className="space-y-1.5">
                            {/* Host Bubble */}
                            <div className="flex items-start gap-1.5">
                              <span className="text-[9px] font-extrabold uppercase text-host tracking-wider min-w-[50px]">Host:</span>
                              <span className="text-xs text-slate-200 font-medium">
                                {entry.speaker === 'host' ? entry.original_text : entry.translated_text}
                              </span>
                            </div>

                            {/* Partner Bubble */}
                            <div className="flex items-start gap-1.5">
                              <span className="text-[9px] font-extrabold uppercase text-partner tracking-wider min-w-[50px]">{partObj?.name}:</span>
                              <span className="text-xs text-slate-300">
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
