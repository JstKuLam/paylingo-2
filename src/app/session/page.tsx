'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useRecording } from '@soniox/react'
import { 
  Mic, 
  MicOff, 
  Square, 
  ChevronRight, 
  ChevronDown,
  ArrowDown,
  Languages, 
  LogOut, 
  Loader2, 
  Volume2, 
  Wifi, 
  WifiOff,
  History,
  Rotate3d,
  UserCheck,
  AlertTriangle,
  LayoutGrid,
  Columns,
  Maximize2,
  ArrowLeft,
  Search,
  Trash2,
  Edit3,
  FileText,
  Check,
  X,
  Calendar,
  Clock,
  FolderOpen,
  CloudLightning,
  Database
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseTokensToMessages, TranscriptMessage } from '@/lib/soniox-parser'
import { useSessionLifecycle } from '@/hooks/useSessionLifecycle'
import { initAutoSync, syncPendingData } from '@/lib/sync-manager'
import { db, LocalSession, LocalTranscriptEntry } from '@/lib/db'
import { downloadSessionPDF } from '@/lib/pdf-generator'
import PayPayLogo from '@/components/PayPayLogo'

const PARTNER_LANGUAGES = [
  { code: 'any', name: 'Mọi ngôn ngữ (Any)', flag: '🌐', label: 'Any' },
  { code: 'en', name: 'English', flag: '🇬🇧', label: 'English' },
  { code: 'zh', name: '中文', flag: '🇨🇳', label: 'Chinese' },
  { code: 'ja', name: '日本語', flag: '🇯🇵', label: 'Japanese' },
  { code: 'ko', name: '한국어', flag: '🇰🇷', label: 'Korean' },
  { code: 'es', name: 'Español', flag: '🇪🇸', label: 'Spanish' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺', label: 'Russian' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', label: 'German' },
  { code: 'th', name: 'ภาษาไทย', flag: '🇹🇭', label: 'Thai' },
]

export default function SessionPage() {
  const router = useRouter()
  const [partnerLang, setPartnerLang] = useState('any')
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [userLabel, setUserLabel] = useState<string>('Khách')
  const [isLoadingAuth, setIsLoadingAuth] = useState(true)
  
  // Phase 5 Layout Switcher states
  const [layoutMode, setLayoutMode] = useState<'stacked' | 'split' | 'flipped'>('split')

  // History Overlay states
  const [showHistory, setShowHistory] = useState(false)
  const [historySessions, setHistorySessions] = useState<LocalSession[]>([])
  const [searchHistoryQuery, setSearchHistoryQuery] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedSession, setSelectedSession] = useState<LocalSession | null>(null)
  const [sessionEntries, setSessionEntries] = useState<LocalTranscriptEntry[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editOrigText, setEditOrigText] = useState('')
  const [editTransText, setEditTransText] = useState('')

  // Font Size state (75%, 100%, 120%, 150%, 200%)
  const [fontSize, setFontSize] = useState<75 | 100 | 120 | 150 | 200>(100)
  const [showFontSizeDropdown, setShowFontSizeDropdown] = useState(false)
  
  // Scroll to bottom helper states
  const [showPartnerScrollBottom, setShowPartnerScrollBottom] = useState(false)
  const [showHostScrollBottom, setShowHostScrollBottom] = useState(false)

  const partnerScrollRef = useRef<HTMLDivElement>(null)
  const hostScrollRef = useRef<HTMLDivElement>(null)

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const username = session?.user?.user_metadata?.username
      
      if (username) {
        const localSessions = await db.sessions
          .where('username')
          .equals(username)
          .reverse()
          .sortBy('started_at')
        setHistorySessions(localSessions)
      }
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    if (showHistory) {
      loadHistory()
    }
  }, [showHistory, loadHistory])

  // Filter sessions
  const filteredSessions = historySessions.filter(sess => {
    const term = searchHistoryQuery.toLowerCase().trim()
    if (!term) return true
    return sess.name.toLowerCase().includes(term)
  })

  // Open Detail
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

  // Close Details
  const handleCloseDetails = () => {
    setSelectedSession(null)
    setSessionEntries([])
    setEditingEntryId(null)
    setRenamingId(null)
  }

  // Rename Session
  const handleRename = async () => {
    if (!selectedSession || !newName.trim()) return

    const now = new Date().toISOString()
    await db.sessions.update(selectedSession.id, {
      name: newName,
      sync_status: 'pending',
      updated_at: now
    })

    // Update in UI lists
    setHistorySessions(prev => prev.map(s => s.id === selectedSession.id ? { ...s, name: newName, sync_status: 'pending', updated_at: now } : s))
    setSelectedSession(prev => prev ? { ...prev, name: newName, sync_status: 'pending', updated_at: now } : null)
    setRenamingId(null)
    
    // Trigger sync
    syncPendingData()
  }

  // Delete Session
  const handleDeleteSession = async (sessId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa vĩnh viễn cuộc hội thoại này?')) return

    try {
      // 1. Delete locally from Dexie
      await db.sessions.delete(sessId)
      await db.transcriptEntries.where('session_id').equals(sessId).delete()

      // Update UI list
      setHistorySessions(prev => prev.filter(s => s.id !== sessId))
      
      // 2. Delete from online Supabase
      const supabase = createClient()
      await supabase.from('sessions').delete().eq('id', sessId)
      
      handleCloseDetails()
      syncPendingData()
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  // Save Message Edits
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

  // Export to PDF
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

  // Initialize auto-sync, read layout, and read font size once on mount
  useEffect(() => {
    initAutoSync()
    
    if (typeof window !== 'undefined') {
      const savedLayout = localStorage.getItem('paylingo_layout_mode') as any
      if (savedLayout && ['stacked', 'split', 'flipped'].includes(savedLayout)) {
        setLayoutMode(savedLayout)
      }
      
      const savedFontSize = localStorage.getItem('paylingo_font_size')
      if (savedFontSize) {
        setFontSize(parseInt(savedFontSize) as any)
      }
    }
  }, [])



  // 1. Authenticate user by username
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      const username = session?.user?.user_metadata?.username
      if (!session || !username) {
        router.push('/')
        return
      }

      setUserLabel(username)
      setIsLoadingAuth(false)
    }
    checkAuth()
  }, [router])

  const getSonioxConfig = useCallback(async () => {
    const response = await fetch('/api/auth/soniox-key', { method: 'POST' })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Failed to retrieve Soniox key')
    }
    return {
      api_key: data.api_key
    }
  }, [])

  // 2. Configure Soniox Real-time Hook and dynamic translation configuration
  const recordingConfig = useMemo(() => {
    if (partnerLang === 'any') {
      return {
        language_hints: ['vi', 'en', 'zh', 'ja', 'ko', 'es', 'ru', 'de', 'th'],
        language_hints_strict: false,
        translation: {
          type: 'one_way' as const,
          target_language: 'vi'
        }
      }
    } else {
      return {
        language_hints: ['vi', partnerLang],
        language_hints_strict: true,
        translation: {
          type: 'two_way' as const,
          language_a: 'vi',
          language_b: partnerLang
        }
      }
    }
  }, [partnerLang])

  const {
    isActive,
    state,
    finalTokens,
    partialTokens,
    isPaused,
    isSourceMuted,
    isReconnecting,
    reconnectAttempt,
    start,
    stop,
    pause,
    resume
  } = useRecording({
    config: getSonioxConfig,
    model: 'stt-rt-v4',
    enable_language_identification: true,
    enable_endpoint_detection: true,
    language_hints: recordingConfig.language_hints,
    language_hints_strict: recordingConfig.language_hints_strict,
    translation: recordingConfig.translation,
    auto_reconnect: true,
    max_reconnect_attempts: 10,
    reconnect_base_delay_ms: 1000,
    reset_transcript_on_reconnect: false
  })

  // 3. Sync and parse tokens into conversation messages in real-time
  useEffect(() => {
    if (finalTokens.length > 0 || partialTokens.length > 0) {
      const parsed = parseTokensToMessages(finalTokens, partialTokens, partnerLang)
      setMessages(parsed)
    } else {
      setMessages([])
    }
  }, [finalTokens, partialTokens, partnerLang])

  // 4. Hook into session database lifecycle, autosave, and guards
  const {
    sessionId,
    silenceWarning,
    isMinutesExhausted,
    wakeLockError,
    offlineIndicator,
    startSession,
    stopSession
  } = useSessionLifecycle({
    partnerLang,
    isActive,
    messages,
    stopRecording: stop
  })

  // 5. Wrap Start Recording to create local DB record
  const handleStart = async () => {
    try {
      const selected = PARTNER_LANGUAGES.find(l => l.code === partnerLang)
      await startSession(selected?.name || partnerLang)
      await start()
    } catch (err) {
      console.error('Failed to start session:', err)
    }
  }

  // 6. Wrap Stop Recording to update local DB status
  const handleStop = async () => {
    try {
      await stop()
      await stopSession()
    } catch (err) {
      console.error('Failed to stop session:', err)
    }
  }

  // 7. Toggle Layout Modes
  const handleToggleLayout = () => {
    const modes: ('stacked' | 'split' | 'flipped')[] = ['stacked', 'split', 'flipped']
    const nextIndex = (modes.indexOf(layoutMode) + 1) % modes.length
    const nextMode = modes[nextIndex]
    setLayoutMode(nextMode)
    localStorage.setItem('paylingo_layout_mode', nextMode)
  }



  // Scroll detectors to check if user has scrolled up to review history
  const handlePartnerScroll = () => {
    const el = partnerScrollRef.current
    if (!el) return
    // Show button if scrolled up by more than 80px from bottom
    const isScrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 80
    setShowPartnerScrollBottom(isScrolledUp)
  }

  const handleHostScroll = () => {
    const el = hostScrollRef.current
    if (!el) return
    // Show button if scrolled up by more than 80px from bottom
    const isScrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 80
    setShowHostScrollBottom(isScrolledUp)
  }

  // Smooth scroll to bottom handlers
  const scrollToBottomPartner = () => {
    const el = partnerScrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      setShowPartnerScrollBottom(false)
    }
  }

  const scrollToBottomHost = () => {
    const el = hostScrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      setShowHostScrollBottom(false)
    }
  }

  // Auto-scroll panels on message update - only if user is already at the bottom
  useEffect(() => {
    if (partnerScrollRef.current && !showPartnerScrollBottom) {
      partnerScrollRef.current.scrollTop = partnerScrollRef.current.scrollHeight
    }
  }, [messages, showPartnerScrollBottom])

  useEffect(() => {
    if (hostScrollRef.current && !showHostScrollBottom) {
      hostScrollRef.current.scrollTop = hostScrollRef.current.scrollHeight
    }
  }, [messages, showHostScrollBottom])

  // Handle Logout
  const handleLogout = async () => {
    if (isActive) {
      await handleStop()
    }
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-host" />
        <span className="text-slate-400 mt-4 text-sm font-medium">Đang kiểm tra phòng dịch...</span>
      </div>
    )
  }

  const selectedPartner = PARTNER_LANGUAGES.find(l => l.code === partnerLang)

  return (
    <div className="h-screen h-[100dvh] w-full flex flex-col p-2 md:p-4 relative overflow-hidden bg-background">
      {/* Decorative Blur Blobs */}
      <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-host/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/3 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-partner/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Warning/Status Banners */}
      <div className="w-full space-y-2 mb-3 relative z-30">
        {offlineIndicator && (
          <div className="w-full bg-amber-500/15 border border-amber-500/30 text-amber-400 py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-pulse">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Mất kết nối mạng. Đang lưu tạm bản dịch vào bộ nhớ máy (Offline-first)...</span>
          </div>
        )}

        {silenceWarning && (
          <div className="w-full bg-red-500/15 border border-red-500/30 text-red-400 py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-bounce">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Không phát hiện âm thanh trong 4 phút. Cuộc họp sẽ tự động dừng sau 1 phút nữa để tiết kiệm chi phí!</span>
          </div>
        )}

        {wakeLockError && isActive && (
          <div className="w-full bg-slate-500/15 border border-slate-500/30 text-slate-400 py-2 px-3 rounded-xl text-[10px] font-semibold flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Trình duyệt không hỗ trợ Wake Lock. Hãy chỉnh tăng thời gian chờ tắt màn hình trên thiết bị.</span>
          </div>
        )}
      </div>

      {/* Dynamic Header */}
      <header className="w-full flex items-center justify-between py-2 px-3.5 md:py-3 md:px-4 glass-panel rounded-xl md:rounded-2xl mb-2.5 md:mb-4 relative z-20 shrink-0">
        <div className="flex items-center gap-3">
          <PayPayLogo className="h-7 md:h-8 w-auto text-white shrink-0" width={92} height={35} />
          <div className="h-4 w-px bg-white/20 shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-wider bg-host/10 border border-host/20 text-host flex items-center gap-1">
                <UserCheck className="w-2.5 h-2.5" />
                {userLabel}
              </span>
            </div>
            <p className="text-[9px] md:text-[10px] text-slate-400 mt-1 font-semibold">
              Hội thoại song ngữ trực tiếp 2 chiều
            </p>
          </div>
        </div>
      </header>

      {/* Main Translation Container with Layout switching transitions */}
      <main className={`flex-1 w-full relative z-10 min-h-0 ${
        layoutMode === 'split' 
          ? 'grid grid-cols-1 grid-rows-[3.5fr_6.5fr] md:grid-rows-none md:grid-cols-[3.5fr_6.5fr] gap-2.5 md:gap-4' 
          : 'flex flex-col gap-2.5 md:gap-4'
      }`}>
        
        {/* PANEL A - PARTNER PANEL (Always shows partner's language) */}
        <section className={`glass-panel rounded-2xl md:rounded-3xl p-3 md:p-6 flex flex-col relative overflow-hidden border-t-2 border-partner/30 shadow-partner/5 shadow-2xl transition-all duration-500 min-h-0 ${
          layoutMode === 'flipped' ? 'transform rotate-180 flex-[7_7_0%] md:flex-[7_7_0%] order-1' : 'flex-[7_7_0%] md:flex-[7_7_0%]'
        }`}>
          <div className="absolute inset-0 bg-partner/[0.005] pointer-events-none"></div>

          {/* Panel A Header */}
          <div className="flex items-center justify-between pb-2.5 md:pb-4 border-b border-white/5 relative z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-base md:text-xl">{selectedPartner?.flag}</span>
              <div>
                <h3 className="font-extrabold text-xs md:text-sm text-slate-200">KHUNG ĐỐI TÁC</h3>
                <p className="text-[9px] md:text-[10px] text-partner font-semibold uppercase tracking-wider">
                  {selectedPartner?.name} Only
                </p>
              </div>
            </div>

            <div className="hidden sm:block text-xs font-bold text-slate-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
              {selectedPartner?.name}
            </div>
          </div>

          {/* Panel A Messages Scroll Area */}
          <div 
            ref={partnerScrollRef}
            onScroll={handlePartnerScroll}
            className="flex-1 overflow-y-auto py-2.5 space-y-3.5 md:py-4 md:space-y-4 pr-1 scroll-smooth"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none px-4">
                <Volume2 className="w-12 h-12 text-partner mb-3 stroke-[1.5]" />
                <p className="text-sm font-bold text-slate-300">Chưa có hội thoại</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Chọn ngôn ngữ, đặt thiết bị giữa bàn và bấm Start để dịch.</p>
              </div>
            ) : (
              messages.map((msg) => {
                // If partner language is 'any', do not show host speech (or its empty translation) in Panel A
                if (partnerLang === 'any' && msg.speaker === 'host') return null

                const displayText = msg.speaker === 'partner' ? msg.original_text : msg.translated_text
                if (!displayText || !displayText.trim()) return null

                return (
                  <div key={msg.id} className="flex flex-col w-full items-start gap-1">
                    {/* Speaker Label */}
                    <span className="text-[9px] md:text-[10px] font-extrabold uppercase tracking-wider px-1 text-slate-400">
                      {msg.speaker === 'partner' ? selectedPartner?.name : 'Bạn (Dịch)'}
                    </span>
                    
                    {/* Message Bubble */}
                    <div 
                      className={`rounded-xl px-3 py-2 text-sm md:text-base font-medium max-w-[88%] md:max-w-[85%] ${
                        msg.speaker === 'partner' 
                          ? 'bg-partner/10 border border-partner/20 text-partner-foreground' 
                          : 'bg-white/5 border border-white/10 text-slate-300'
                      } ${!msg.is_final ? 'opacity-70 italic' : ''}`}
                      style={{ fontSize: `${fontSize}%` }}
                    >
                      {displayText}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Scroll to Bottom Button */}
          {showPartnerScrollBottom && (
            <button
              onClick={scrollToBottomPartner}
              className="absolute bottom-12 py-1.5 px-3 text-[10px] md:bottom-16 md:py-2 md:px-4 md:text-xs left-1/2 -translate-x-1/2 bg-partner/90 hover:bg-partner text-slate-950 rounded-full font-black shadow-xl flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 z-20 cursor-pointer animate-bounce border border-white/10"
            >
              <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
              Cuộn xuống (Scroll to bottom)
            </button>
          )}

          {/* Panel A Active Speaker indicator */}
          {isActive && (
            <div className="pt-2 flex items-center justify-between text-[10px] text-partner font-semibold border-t border-white/5 shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-partner animate-ping"></span>
                Partner Listening
              </span>
              <span className="text-slate-500 font-bold">Latency ~1.2s</span>
            </div>
          )}
        </section>

        {/* PANEL B - HOST PANEL (Always shows Vietnamese) */}
        <section className={`glass-panel rounded-2xl md:rounded-3xl p-3 md:p-6 flex flex-col relative overflow-hidden border-t-2 border-host/30 shadow-host/5 shadow-2xl transition-all duration-500 min-h-0 ${
          layoutMode === 'flipped' ? 'flex-[13_13_0%] md:flex-[13_13_0%] order-2' : 'flex-[13_13_0%] md:flex-[13_13_0%]'
        }`}>
          <div className="absolute inset-0 bg-host/[0.005] pointer-events-none"></div>

          {/* Panel B Header */}
          <div className="flex items-center justify-between pb-2.5 md:pb-4 border-b border-white/5 relative z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-base md:text-xl">🇻🇳</span>
              <div>
                <h3 className="font-extrabold text-xs md:text-sm text-slate-200">KHUNG CỦA BẠN</h3>
                <p className="text-[9px] md:text-[10px] text-host font-semibold uppercase tracking-wider">
                  TIẾNG VIỆT ONLY
                </p>
              </div>
            </div>
            
            <div className="hidden sm:block text-xs font-bold text-slate-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
              Khóa Tiếng Việt
            </div>
          </div>

          {/* Panel B Messages Scroll Area */}
          <div 
            ref={hostScrollRef}
            onScroll={handleHostScroll}
            className="flex-1 overflow-y-auto py-2.5 space-y-3.5 md:py-4 md:space-y-4 pr-1 scroll-smooth"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none px-4">
                <Volume2 className="w-12 h-12 text-host mb-3 stroke-[1.5]" />
                <p className="text-sm font-bold text-slate-300">Chưa có hội thoại</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Mọi lời nói tiếng Việt và bản dịch tiếng Việt của đối tác sẽ hiện ở đây.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const displayText = msg.speaker === 'host' ? msg.original_text : msg.translated_text
                if (!displayText || !displayText.trim()) return null

                return (
                  <div key={msg.id} className="flex flex-col w-full items-start gap-1">
                    {/* Speaker Label */}
                    <span className="text-[9px] md:text-[10px] font-extrabold uppercase tracking-wider px-1 text-slate-400">
                      {msg.speaker === 'host' ? 'Bạn' : `${selectedPartner?.name} (Dịch)`}
                    </span>
                    
                    {/* Message Bubble */}
                    <div 
                      className={`rounded-xl px-3 py-2 text-sm md:text-base font-medium max-w-[88%] md:max-w-[85%] ${
                        msg.speaker === 'host' 
                          ? 'bg-host/10 border border-host/20 text-host-foreground' 
                          : 'bg-white/5 border border-white/10 text-slate-300'
                      } ${!msg.is_final ? 'opacity-70 italic' : ''}`}
                      style={{ fontSize: `${fontSize}%` }}
                    >
                      {displayText}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Scroll to Bottom Button */}
          {showHostScrollBottom && (
            <button
              onClick={scrollToBottomHost}
              className="absolute bottom-12 py-1.5 px-3 text-[10px] md:bottom-16 md:py-2 md:px-4 md:text-xs left-1/2 -translate-x-1/2 bg-host/90 hover:bg-host text-slate-950 rounded-full font-black shadow-xl flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 z-20 cursor-pointer animate-bounce border border-white/10"
            >
              <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
              Cuộn xuống (Scroll to bottom)
            </button>
          )}

          {/* Panel B Active Speaker indicator */}
          {isActive && (
            <div className="pt-2 flex items-center justify-between text-[10px] text-host font-semibold border-t border-white/5 shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-host animate-ping"></span>
                Host Listening
              </span>
              <span className="text-slate-500 font-bold">Latency ~1.2s</span>
            </div>
          )}
        </section>
      </main>

      {/* Control Navigation Dashboard */}
      <footer className="w-full flex flex-col md:flex-row items-center justify-between mt-2.5 py-2 px-3 md:py-4 md:px-5 glass-panel rounded-xl md:rounded-2xl gap-2.5 md:gap-4 relative z-20 shrink-0">
        
        {/* Left Column: Connection & Recording Status Details + Language Selector */}
        <div className="flex items-center justify-between md:justify-start gap-3 md:gap-6 w-full md:w-auto shrink-0 pb-2 md:pb-0 border-b border-white/5 md:border-none">
          {/* Status Details */}
          <div className="flex items-center gap-2 text-left">
            <div className={`w-2.5 h-2.5 rounded-full flex items-center justify-center shrink-0 ${
              isReconnecting || state === 'connecting' || state === 'starting' ? 'bg-yellow-500 animate-pulse' :
              state === 'recording' ? 'bg-red-500 animate-pulse-glowing' : 
              'bg-slate-600'
            }`} />
            
            <div className="flex flex-col">
              <span className="text-[10px] md:text-xs font-bold text-white capitalize leading-tight">
                {isReconnecting ? 'Mất mạng...' :
                 state === 'idle' ? 'Đang chờ' :
                 state === 'starting' ? 'Khởi động...' :
                 state === 'connecting' ? 'Kết nối...' :
                 state === 'recording' ? 'Đang dịch' :
                 state === 'paused' ? 'Tạm dừng' :
                 state === 'stopping' ? 'Đang dừng...' :
                 state === 'stopped' ? 'Đã dừng' : 'Đang chờ'}
              </span>
              <span className="text-[8px] md:text-[10px] text-slate-400 font-semibold mt-0.5 hidden sm:inline-flex items-center gap-1">
                {isReconnecting ? (
                  <>
                    <WifiOff className="w-2.5 h-2.5 text-yellow-500 shrink-0" />
                    Đang kết nối lại...
                  </>
                ) : state === 'recording' ? (
                  <>
                    <Wifi className="w-2.5 h-2.5 text-green-400 shrink-0" />
                    Kết nối Soniox ổn định
                  </>
                ) : (
                  <>
                    <WifiOff className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                    Chưa mở kết nối audio
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Language translation indicator (English <---> Việt Nam) */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-1.5 py-0.5 md:px-3 md:py-1 text-[10px] md:text-xs font-bold text-white transition-all shadow-inner shrink-0">
            <select
              disabled={isActive}
              value={partnerLang}
              onChange={(e) => setPartnerLang(e.target.value)}
              className="bg-transparent text-[10px] md:text-xs font-bold text-white transition-all cursor-pointer outline-none border-none py-1.5 px-1 min-h-[36px] flex items-center"
            >
              {PARTNER_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code} className="bg-slate-900 text-white">
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
            <span className="text-slate-500 font-extrabold text-[9px] md:text-[11px] mx-0.5">⇆</span>
            <span className="flex items-center gap-1 text-slate-300 text-[10px] md:text-xs py-1 px-1 shrink-0">
              🇻🇳 VI
            </span>
          </div>
        </div>

        {/* Right Column: Actions (Start/Stop, Font Size, Layout, History, Sign Out) */}
        <div className="flex items-center justify-between md:justify-end gap-1.5 md:gap-2 w-full md:w-auto mt-1 md:mt-0">
          
          {/* Start/Stop Button */}
          {state === 'idle' || state === 'stopped' || state === 'canceled' || state === 'error' ? (
            <button
              onClick={handleStart}
              className="flex-1 md:flex-none py-2 px-3 md:py-2.5 md:px-6 rounded-xl font-bold bg-gradient-to-r from-host to-partner hover:scale-[1.02] text-white shadow-lg shadow-host/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs animate-pulse-glowing"
            >
              <Mic className="w-3.5 h-3.5 text-white shrink-0" />
              <span>Bắt đầu</span>
            </button>
          ) : state === 'starting' || state === 'connecting' ? (
            <button
              disabled
              className="flex-1 md:flex-none py-2 px-3 md:py-2.5 md:px-6 rounded-xl font-bold bg-slate-700 text-slate-400 border border-white/5 transition-all flex items-center justify-center gap-1.5 text-xs cursor-not-allowed"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />
              <span>Kết nối...</span>
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex-1 md:flex-none py-2 px-3 md:py-2.5 md:px-6 rounded-xl font-bold bg-gradient-to-r from-red-500 to-red-600 hover:scale-[1.02] text-white shadow-lg shadow-red-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
            >
              <Square className="w-3.5 h-3.5 text-white fill-white shrink-0" />
              <span>Dừng</span>
            </button>
          )}

          {/* Font Size Menu Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowFontSizeDropdown(!showFontSizeDropdown)}
              className="p-2 md:p-2.5 rounded-xl border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="Chỉnh cỡ chữ dịch"
            >
              <span className="font-extrabold text-[8px] md:text-[10px] bg-slate-800 px-1 py-0.5 rounded leading-none">AA</span>
              <span className="text-[11px] md:text-xs">{fontSize}%</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showFontSizeDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showFontSizeDropdown && (
              <>
                {/* Click-away backdrop */}
                <div 
                  className="fixed inset-0 z-40 cursor-default" 
                  onClick={() => setShowFontSizeDropdown(false)}
                />
                
                {/* Dropdown Menu */}
                <div className="absolute bottom-full right-0 mb-2 w-28 glass-panel rounded-xl py-1 z-50 border border-white/10 shadow-2xl flex flex-col animate-fadeIn">
                  {([75, 100, 120, 150, 200] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => {
                        setFontSize(size)
                        localStorage.setItem('paylingo_font_size', size.toString())
                        setShowFontSizeDropdown(false)
                      }}
                      className={`w-full px-2.5 py-1.5 text-left text-xs font-bold transition-all hover:bg-white/5 flex items-center justify-between cursor-pointer ${
                        fontSize === size ? 'text-host bg-host/5' : 'text-slate-300'
                      }`}
                    >
                      <span>Cỡ {size}%</span>
                      {fontSize === size && <Check className="w-3 text-host" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Layout switcher */}
          <button
            onClick={handleToggleLayout}
            className="p-2 md:p-2.5 rounded-xl border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0"
            title="Chuyển đổi giao diện"
          >
            {layoutMode === 'stacked' && <LayoutGrid className="w-3.5 h-3.5 text-host" />}
            {layoutMode === 'split' && <Columns className="w-3.5 h-3.5 text-partner" />}
            {layoutMode === 'flipped' && <Rotate3d className="w-3.5 h-3.5 text-amber-500 animate-spin" style={{ animationDuration: '3s' }} />}
            <span className="hidden md:inline">
              {layoutMode === 'stacked' && 'Xếp chồng'}
              {layoutMode === 'split' && 'Song song'}
              {layoutMode === 'flipped' && 'Xoay 180°'}
            </span>
          </button>

          {/* History Page Trigger */}
          <button
            onClick={() => setShowHistory(true)}
            className="p-2 md:p-2.5 rounded-xl border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Lịch sử</span>
          </button>

          {/* Sign Out */}
          <button
            onClick={handleLogout}
            className="p-2 md:p-2.5 rounded-xl border border-red-500/10 hover:border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all cursor-pointer shrink-0"
            title="Đăng xuất"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>

        </div>
      </footer>

      {/* HISTORY OVERLAY PANEL */}
      {showHistory && (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-md z-45 flex flex-col p-4 md:p-6 animate-fadeIn">
          {/* Header */}
          <header className="w-full flex items-center justify-between py-3.5 px-5 glass-panel rounded-2xl mb-4 relative z-20 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHistory(false)}
                className="p-2 rounded-xl border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white leading-none">Lịch sử dịch của bạn</h1>
                <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                  Quản lý các cuộc đàm thoại đã ghi
                </p>
              </div>
            </div>

            <div className="text-xs font-bold text-slate-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-host" />
              Lưu trữ thiết bị
            </div>
          </header>

          {/* Search Bar */}
          <div className="w-full mb-4 relative z-20 shrink-0">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Tìm kiếm theo tên cuộc hội thoại..."
                value={searchHistoryQuery}
                onChange={(e) => setSearchHistoryQuery(e.target.value)}
                className="w-full py-3.5 pl-11 pr-4 rounded-xl glass-input text-sm font-medium focus:outline-none"
              />
            </div>
          </div>

          {/* Content Area */}
          <main className="flex-1 w-full relative z-10 overflow-y-auto min-h-0">
            {loadingHistory ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Loader2 className="w-8 h-8 animate-spin text-host mb-3" />
                <span className="text-slate-400 text-xs font-semibold">Đang tải danh sách...</span>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center opacity-30 select-none px-4">
                <FolderOpen className="w-14 h-14 text-host mb-3 stroke-[1.5]" />
                <p className="text-sm font-bold text-slate-300">Không tìm thấy cuộc hội thoại nào</p>
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
        </div>
      )}

      {/* DETAIL MODAL OVERLAY IN SESSION PAGE */}
      {selectedSession && showHistory && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 animate-fadeIn">
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
