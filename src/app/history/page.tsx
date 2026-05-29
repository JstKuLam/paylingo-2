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
  Volume2,
  ListChecks,
  FolderPlus,
  Folder,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Copy,
  Share2
} from 'lucide-react'
import { db, LocalSession, LocalTranscriptEntry, LocalFolder } from '@/lib/db'
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

export default function HistoryPage() {
  const router = useRouter()
  const [username, setUsername] = useState<string>('')
  const [sessions, setSessions] = useState<LocalSession[]>([])
  const [folders, setFolders] = useState<LocalFolder[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  // Multi-select status
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [folderName, setFolderName] = useState('')
  
  // Selected Session Details for Modal View
  const [selectedSession, setSelectedSession] = useState<LocalSession | null>(null)
  const [sessionEntries, setSessionEntries] = useState<LocalTranscriptEntry[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)

  // AI Summary Modal state
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [sharePassword, setSharePassword] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  
  // Editing Message state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editOrigText, setEditOrigText] = useState('')
  const [editTransText, setEditTransText] = useState('')

  // 1. Authenticate check & Load folders and sessions from Dexie (local-first!)
  const loadData = async () => {
    const supabase = createClient()
    const { data: { session: supaSession } } = await supabase.auth.getSession()

    const name = supaSession?.user?.user_metadata?.username
    if (!supaSession || !name) {
      router.push('/')
      return
    }
    
    setUsername(name)

    // Fetch all folders
    const localFolders = await db.folders
      .where('username')
      .equals(name)
      .reverse()
      .sortBy('created_at')

    // Fetch all sessions
    const localSessions = await db.sessions
      .where('username')
      .equals(name)
      .reverse()
      .sortBy('started_at')

    setFolders(localFolders)
    setSessions(localSessions)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [router])

  // 2. Filter sessions based on search
  const filteredSessions = sessions.filter(sess => {
    const term = searchQuery.toLowerCase().trim()
    if (!term) return true
    return sess.name.toLowerCase().includes(term)
  })

  // Group independent sessions (not in folders)
  const independentSessions = filteredSessions.filter(s => !s.folder_id)

  // 3. Open Detail Modal
  const handleOpenDetails = async (session: LocalSession) => {
    if (isSelectMode) {
      toggleSelect(session.id)
      return
    }
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
    setShowExportMenu(false)
  }

  // Toggle multi-select mode
  const handleToggleSelectMode = () => {
    setIsSelectMode(!isSelectMode)
    setSelectedIds([])
  }

  // Toggle single item selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  // Create Folder and move selected sessions into it
  const handleCreateFolder = async () => {
    if (!folderName.trim() || selectedIds.length < 2) return

    try {
      const folderId = crypto.randomUUID()
      const now = new Date().toISOString()

      // 1. Create folder locally
      const newFolder: LocalFolder = {
        id: folderId,
        username,
        name: folderName.trim(),
        created_at: now,
        updated_at: now,
        sync_status: 'pending'
      }
      await db.folders.put(newFolder)

      // 2. Assign folder_id to selected sessions
      await db.sessions.where('id').anyOf(selectedIds).modify({
        folder_id: folderId,
        sync_status: 'pending',
        updated_at: now
      })

      // Update local states
      setFolderName('')
      setShowFolderModal(false)
      setIsSelectMode(false)
      setSelectedIds([])
      
      // Reload UI lists
      await loadData()

      // Trigger background sync to Supabase
      syncPendingData()
    } catch (err) {
      console.error('Failed to group into folder:', err)
    }
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

    // Update state
    setSessions(prev => prev.map(s => s.id === selectedSession.id ? { ...s, name: newName, sync_status: 'pending', updated_at: now } : s))
    setSelectedSession(prev => prev ? { ...prev, name: newName, sync_status: 'pending', updated_at: now } : null)
    setRenamingId(null)
    syncPendingData()
  }

  // 6. Delete Session
  const handleDeleteSession = async (sessId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa vĩnh viễn cuộc hội thoại này?')) return

    try {
      await db.sessions.delete(sessId)
      await db.transcriptEntries.where('session_id').equals(sessId).delete()

      setSessions(prev => prev.filter(s => s.id !== sessId))
      
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

    setSessionEntries(prev => prev.map(e => e.id === entryId ? { ...e, original_text: editOrigText, translated_text: editTransText, sync_status: 'pending', updated_at: now } : e))
    setEditingEntryId(null)
    syncPendingData()
  }

  // 8. Trigger Exports
  const handleExport = async (format: 'pdf' | 'txt' | 'json') => {
    if (!selectedSession) return
    const langObj = PARTNER_LANGUAGES.find(l => l.code === selectedSession.partner_language)
    const langName = langObj?.name || selectedSession.partner_language

    setShowExportMenu(false)

    if (format === 'pdf') {
      await downloadSessionPDF(
        selectedSession.name,
        selectedSession.partner_language,
        langName,
        selectedSession.started_at,
        sessionEntries
      )
    } else if (format === 'txt') {
      await downloadSessionTXT(
        selectedSession.name,
        langName,
        selectedSession.started_at,
        sessionEntries
      )
    } else {
      await downloadSessionJSON(
        selectedSession.name,
        selectedSession.partner_language,
        langName,
        selectedSession.started_at,
        sessionEntries
      )
    }
  }

  // 9. AI Summarization for Session
  const handleAiSummarize = async () => {
    if (!selectedSession) return
    setAiLoading(true)
    setShareLink('')
    setSharePassword('')
    setShowSummaryModal(true)

    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: selectedSession.id })
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
    if (!selectedSession || !aiSummary) return
    setAiLoading(true)

    try {
      const res = await fetch('/api/shared/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selectedSession.id,
          title: `Tóm tắt: ${selectedSession.name}`,
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
        <span className="text-slate-400 mt-4 text-sm font-medium">Đang tải lịch sử dịch...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full flex flex-col p-4 relative overflow-hidden bg-background">
      {/* Decorative Blob */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-host/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="w-full flex items-center justify-between py-3 px-4 glass-panel rounded-2xl mb-4 relative z-20 shrink-0">
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
              Quản lý và tóm tắt hội thoại AI
            </p>
          </div>
        </div>

        {/* Dynamic Buttons */}
        <div className="flex items-center gap-1.5 z-35">
          {isSelectMode ? (
            <>
              {selectedIds.length >= 2 && (
                <button
                  onClick={() => setShowFolderModal(true)}
                  className="p-2.5 rounded-xl border border-amber-glow/20 bg-amber-glow/5 hover:bg-amber-glow/10 text-amber-glow transition-all flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  Thêm vào thư mục ({selectedIds.length})
                </button>
              )}
              <button
                onClick={handleToggleSelectMode}
                className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all flex items-center gap-1 text-[10px] font-extrabold cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Hủy chọn
              </button>
            </>
          ) : (
            <button
              onClick={handleToggleSelectMode}
              className="p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-slate-300 transition-all flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide cursor-pointer"
            >
              <ListChecks className="w-3.5 h-3.5 text-host" />
              Chọn mục
            </button>
          )}

          <div className="text-xs font-bold text-slate-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl hidden sm:flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-host" />
            Local-first (Dexie)
          </div>
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

      {/* Content scroll area */}
      <main className="flex-1 w-full relative z-10 overflow-y-auto min-h-0 space-y-6 pb-6">
        
        {/* SECTION 1: FOLDERS GRID */}
        {folders.length > 0 && !searchQuery && (
          <div className="space-y-3">
            <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Folder className="w-4 h-4 text-amber-glow fill-amber-glow/10" />
              Thư mục của bạn ({folders.length})
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {folders.map(folder => {
                const sessCount = sessions.filter(s => s.folder_id === folder.id).length
                
                return (
                  <div
                    key={folder.id}
                    onClick={() => router.push(`/history/folders/${folder.id}`)}
                    className="glass-panel hover:border-white/10 p-4 rounded-2xl flex flex-col justify-between cursor-pointer hover:scale-[1.02] hover:shadow-lg transition-all duration-300 relative group overflow-hidden"
                  >
                    <Folder className="w-8 h-8 text-amber-glow fill-amber-glow/10 mb-2 group-hover:scale-105 transition-transform" />
                    <div>
                      <h3 className="text-xs font-bold text-slate-200 group-hover:text-white truncate">{folder.name}</h3>
                      <p className="text-[9px] text-slate-500 mt-1 font-semibold">{sessCount} cuộc hội thoại</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* SECTION 2: CONVERSATIONS LIST */}
        <div className="space-y-3">
          <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">
            {isSelectMode ? 'Chọn các cuộc hội thoại' : folders.length > 0 ? 'Các cuộc hội thoại độc lập' : 'Danh sách hội thoại'}
          </h2>

          {independentSessions.length === 0 && !isSelectMode ? (
            <div className="min-h-[200px] flex flex-col items-center justify-center text-center opacity-30 select-none">
              <FolderOpen className="w-12 h-12 text-host mb-2" />
              <p className="text-xs font-bold text-slate-300">Không có hội thoại độc lập nào</p>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="min-h-[200px] flex flex-col items-center justify-center text-center opacity-30 select-none">
              <FolderOpen className="w-12 h-12 text-host mb-2" />
              <p className="text-xs font-bold text-slate-300">Không tìm thấy kết quả nào</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(isSelectMode ? filteredSessions : independentSessions).map((sess) => {
                const dateStr = new Date(sess.started_at).toLocaleDateString('vi-VN')
                const min = Math.floor(sess.duration_seconds / 60)
                const sec = sess.duration_seconds % 60
                const langObj = PARTNER_LANGUAGES.find(l => l.code === sess.partner_language)
                const isSelected = selectedIds.includes(sess.id)

                return (
                  <div
                    key={sess.id}
                    onClick={() => handleOpenDetails(sess)}
                    className={`glass-panel hover:border-white/10 rounded-2xl p-5 flex items-start justify-between cursor-pointer hover:scale-[1.01] hover:shadow-lg transition-all duration-300 relative overflow-hidden group ${
                      isSelected ? 'border-host/50 bg-host/5 ring-1 ring-host/30' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {isSelectMode && (
                        <div 
                          className={`w-4 h-4 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                            isSelected ? 'bg-host border-host text-white' : 'border-white/20 bg-white/5'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      )}
                      
                      <div className="flex flex-col min-w-0">
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
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {sess.sync_status === 'pending' && (
                        <span className="px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-widest bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 flex items-center gap-1">
                          <CloudLightning className="w-2.5 h-2.5" />
                          Chờ đồng bộ
                        </span>
                      )}
                      {!isSelectMode && (
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-all" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* CREATE FOLDER POPUP DIALOG */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-sm glass-panel rounded-3xl p-6 flex flex-col shadow-2xl relative border border-white/5">
            <h3 className="text-sm font-black text-white flex items-center gap-2 mb-3">
              <FolderPlus className="w-4 h-4 text-amber-glow" />
              TẠO THƯ MỤC MỚI
            </h3>
            <p className="text-[10px] text-slate-400 font-bold leading-relaxed mb-4">
              Nhập tên cho thư mục mới để nhóm {selectedIds.length} cuộc hội thoại đã chọn.
            </p>

            <input
              type="text"
              placeholder="Tên thư mục (ví dụ: Đàm phán, Ký hợp đồng...)"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="w-full py-2.5 px-3.5 rounded-xl glass-input text-xs font-bold text-white mb-4 focus:outline-none"
              autoFocus
            />

            <div className="flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setShowFolderModal(false)}
                className="py-2 px-4 rounded-xl bg-white/5 border border-white/10 text-[10px] font-extrabold uppercase text-slate-400 hover:bg-white/10 cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!folderName.trim()}
                className="py-2 px-5 rounded-xl bg-gradient-to-r from-host to-partner text-slate-950 font-extrabold text-[10px] uppercase cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
              >
                Xác nhận tạo
              </button>
            </div>
          </div>
        </div>
      )}

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

                    {/* Direct Page Link */}
                    <button
                      onClick={() => {
                        handleCloseDetails()
                        router.push(`/history/sessions/${selectedSession.id}`)
                      }}
                      className="p-1 rounded-lg hover:bg-white/5 text-host hover:text-host/80 cursor-pointer"
                      title="Mở toàn màn hình (Đường dẫn riêng)"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                
                <p className="text-[10px] text-slate-400 mt-2 font-bold flex items-center gap-3">
                  <span>Khởi tạo: {new Date(selectedSession.started_at).toLocaleString('vi-VN')}</span>
                  <span>Ngôn ngữ đối tác: {PARTNER_LANGUAGES.find(l => l.code === selectedSession.partner_language)?.name}</span>
                </p>
              </div>

              {/* Action triggers */}
              <div className="flex items-center gap-1.5 shrink-0 z-40">
                {/* Tóm tắt AI */}
                <button
                  onClick={handleAiSummarize}
                  className="p-2 md:p-2.5 rounded-xl border border-host/20 bg-host/5 hover:bg-host/10 text-host transition-all cursor-pointer flex items-center gap-1 text-[10px] font-extrabold"
                  title="Tóm tắt AI cuộc họp"
                >
                  <Sparkles className="w-3.5 h-3.5 animate-pulse text-host" />
                  <span className="hidden sm:inline">Tóm tắt AI</span>
                </button>

                {/* Dropdown Export menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="p-2 md:p-2.5 rounded-xl border border-partner/20 bg-partner/5 hover:bg-partner/10 text-partner transition-all cursor-pointer flex items-center gap-1 text-[10px] font-extrabold"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Xuất File</span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>

                  {showExportMenu && (
                    <div className="absolute right-0 mt-2 w-32 glass-panel rounded-xl py-1 z-50 border border-white/5 shadow-2xl animate-fadeIn">
                      <button
                        onClick={() => handleExport('pdf')}
                        className="w-full text-left px-3 py-2 text-xs font-bold text-slate-350 hover:text-white hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                      >
                        <span className="text-red-400">PDF</span> Xuất PDF
                      </button>
                      <button
                        onClick={() => handleExport('txt')}
                        className="w-full text-left px-3 py-2 text-xs font-bold text-slate-350 hover:text-white hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                      >
                        <span className="text-blue-400">TXT</span> Xuất TXT
                      </button>
                      <button
                        onClick={() => handleExport('json')}
                        className="w-full text-left px-3 py-2 text-xs font-bold text-slate-355 hover:text-white hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                      >
                        <span className="text-green-400">JSON</span> Xuất JSON
                      </button>
                    </div>
                  )}
                </div>
                
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

      {/* AI SUMMARY POPUP MODAL */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-55 flex items-center justify-center p-4 animate-fadeIn">
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
