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
  Check,
  Sun,
  Moon,
  Sparkles,
  SunDim
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/hooks/useTheme'
import { parseTokensToMessages, TranscriptMessage } from '@/lib/soniox-parser'
import { useSessionLifecycle } from '@/hooks/useSessionLifecycle'
import { initAutoSync, syncPendingData } from '@/lib/sync-manager'
import { formatTimeline } from '@/lib/utils'
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

// SUB-COMPONENT: Manages active recording session, WebSocket streaming, and message rendering.
// This component remounts completely when key (recordingMode + partnerLang) changes,
// preventing any React Error #310 hook ordering mismatches in @soniox/react.
function SessionActiveArea({
  recordingMode,
  partnerLang,
  setPartnerLang,
  layoutMode,
  fontSize,
  handleToggleLayout,
  handleLogout,
  setFontSize,
  setIsRecordingActive
}: {
  recordingMode: 'one_way' | 'two_way' | 'scribe'
  partnerLang: string
  setPartnerLang: (lang: string) => void
  layoutMode: 'stacked' | 'split' | 'flipped'
  fontSize: 75 | 100 | 120 | 150 | 200
  handleToggleLayout: () => void
  handleLogout: () => void
  setFontSize: (size: any) => void
  setIsRecordingActive: (active: boolean) => void
}) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [showFontSizeDropdown, setShowFontSizeDropdown] = useState(false)
  const [showPartnerScrollBottom, setShowPartnerScrollBottom] = useState(false)
  const [showHostScrollBottom, setShowHostScrollBottom] = useState(false)

  const partnerScrollRef = useRef<HTMLDivElement>(null)
  const hostScrollRef = useRef<HTMLDivElement>(null)

  const [splitRatio, setSplitRatio] = useState(35)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      
      let clientX = e.clientX
      let newRatio: number
      if (layoutMode === 'flipped') {
        const distanceVal = containerRect.right - clientX
        newRatio = (distanceVal / containerRect.width) * 100
      } else {
        const distanceVal = clientX - containerRect.left
        newRatio = (distanceVal / containerRect.width) * 100
      }
      
      newRatio = Math.max(15, Math.min(85, newRatio))
      setSplitRatio(newRatio)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!containerRef.current || e.touches.length === 0) return
      const containerRect = containerRef.current.getBoundingClientRect()
      
      let clientX = e.touches[0].clientX
      let newRatio: number
      if (layoutMode === 'flipped') {
        const distanceVal = containerRect.right - clientX
        newRatio = (distanceVal / containerRect.width) * 100
      } else {
        const distanceVal = clientX - containerRect.left
        newRatio = (distanceVal / containerRect.width) * 100
      }
      
      newRatio = Math.max(15, Math.min(85, newRatio))
      setSplitRatio(newRatio)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleMouseUp)
    }
  }, [isDragging, layoutMode])

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

  // Configure Soniox Real-time Hook and dynamic translation configuration
  const recordingConfig = useMemo(() => {
    if (recordingMode === 'scribe') {
      if (partnerLang === 'any') {
        return {
          language_hints: ['vi', 'en', 'zh', 'ja', 'ko', 'es', 'ru', 'de', 'th'],
          language_hints_strict: false,
          translation: undefined
        }
      } else {
        return {
          language_hints: ['vi', partnerLang],
          language_hints_strict: true,
          translation: undefined
        }
      }
    } else if (recordingMode === 'one_way' || partnerLang === 'any') {
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
  }, [recordingMode, partnerLang])

  const {
    isActive,
    state,
    finalTokens,
    partialTokens,
    start,
    stop
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

  // Lift isActive state up to parent so the persistent header knows when to lock toggles
  useEffect(() => {
    setIsRecordingActive(isActive)
  }, [isActive, setIsRecordingActive])

  // Sync and parse tokens into conversation messages in real-time
  useEffect(() => {
    if (finalTokens.length > 0 || partialTokens.length > 0) {
      const parsed = parseTokensToMessages(finalTokens, partialTokens, partnerLang)
      setMessages(parsed)
    } else {
      setMessages([])
    }
  }, [finalTokens, partialTokens, partnerLang])

  // Hook into session database lifecycle, autosave, and guards
  const {
    silenceWarning,
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

  const handleStart = async () => {
    try {
      const selected = PARTNER_LANGUAGES.find(l => l.code === partnerLang)
      await startSession(selected?.name || partnerLang)
      await start()
    } catch (err) {
      console.error('Failed to start session:', err)
    }
  }

  const handleStop = async () => {
    try {
      await stop()
      await stopSession()
    } catch (err) {
      console.error('Failed to stop session:', err)
    }
  }

  const handlePartnerScroll = () => {
    const el = partnerScrollRef.current
    if (!el) return
    const isScrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 80
    setShowPartnerScrollBottom(isScrolledUp)
  }

  const handleHostScroll = () => {
    const el = hostScrollRef.current
    if (!el) return
    const isScrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 80
    setShowHostScrollBottom(isScrolledUp)
  }

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

  useEffect(() => {
    if (partnerScrollRef.current && !showPartnerScrollBottom) {
      partnerScrollRef.current.scrollTop = partnerScrollRef.current.scrollHeight
    }
  }, [messages, showPartnerScrollBottom])

  useEffect(() => {
    if (hostScrollRef.current && !showHostScrollBottom) {
      hostScrollRef.current.scrollTop = hostScrollRef.current.scrollHeight
    }
  }, [messages, silenceWarning, showHostScrollBottom])

  const selectedPartner = PARTNER_LANGUAGES.find(l => l.code === partnerLang)

  const firstMsgStartMs = useMemo(() => {
    if (messages.length === 0) return 0
    return messages[0].start_ms
  }, [messages])

  const router = useRouter()

  return (
    <div className="flex-1 w-full flex flex-col min-h-0 relative z-10 animate-slide-up-fade">
      {/* Warning/Status Banners inside active area */}
      <div className="w-full space-y-2 mb-3 relative z-30 shrink-0">
        {offlineIndicator && (
          <div className="w-full bg-amber-500/10 border border-amber-500/20 text-amber-400 py-3 px-5 rounded-full text-xs font-bold flex items-center gap-2 animate-pulse shadow-lg shadow-amber-500/5">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Mất kết nối mạng. Đang lưu tạm bản dịch vào bộ nhớ máy (Offline-first)...</span>
          </div>
        )}

        {wakeLockError && isActive && (
          <div className="w-full bg-slate-800/40 border border-white/5 text-slate-400 py-2.5 px-4 rounded-full text-[10px] font-bold flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500/70" />
            <span>Trình duyệt không hỗ trợ Wake Lock. Hãy chỉnh tăng thời gian chờ tắt màn hình trên thiết bị.</span>
          </div>
        )}
      </div>

      {/* Main panels layout */}
      <main
        ref={containerRef}
        className={`flex-1 w-full relative z-10 min-h-0 ${
          layoutMode === 'split' || layoutMode === 'flipped'
            ? `grid grid-cols-1 grid-rows-[3.5fr_6.5fr] md:grid-rows-none md:flex ${
                layoutMode === 'flipped' ? 'md:flex-row-reverse' : 'md:flex-row'
              } md:items-stretch gap-3 md:gap-0`
            : 'flex flex-col gap-3 md:gap-4'
        }`}
      >
        
        {/* PANEL A - PARTNER PANEL */}
        <section
          style={
            layoutMode === 'split' || layoutMode === 'flipped'
              ? { width: `calc(${splitRatio}% - 6px)` }
              : undefined
          }
          className={`glass-panel rounded-3xl p-4 md:p-6 flex flex-col relative overflow-hidden border-t-2 border-partner/30 shadow-partner/5 shadow-2xl min-h-0 ${
            isDragging ? 'duration-0' : 'transition-all duration-500'
          } ${
            layoutMode === 'flipped' ? 'transform rotate-180 flex-[7_7_0%] order-1' : 'flex-[7_7_0%]'
          } ${layoutMode === 'split' || layoutMode === 'flipped' ? 'md:flex-none' : 'md:flex-[7_7_0%]'}`}
        >
          <div className="absolute inset-0 bg-partner/[0.003] pointer-events-none"></div>

          {/* Panel A Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/5 relative z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-lg md:text-2xl">{selectedPartner?.flag}</span>
              <div>
                <h3 className="font-black text-xs md:text-sm text-slate-100 uppercase tracking-wide">KHUNG ĐỐI TÁC</h3>
                <p className="text-[9px] md:text-[10px] text-partner font-extrabold uppercase tracking-widest mt-0.5">
                  {selectedPartner?.name} ONLY
                </p>
              </div>
            </div>

            <div className="text-[10px] font-black text-slate-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full uppercase tracking-wider">
              {selectedPartner?.name}
            </div>
          </div>

          {/* Panel A Messages Scroll Area */}
          <div 
            ref={partnerScrollRef}
            onScroll={handlePartnerScroll}
            className="flex-1 overflow-y-auto py-3 space-y-4 pr-1 scroll-smooth"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none px-4">
                <Volume2 className="w-12 h-12 text-partner mb-3 stroke-[1.5]" />
                <p className="text-sm font-black text-slate-300 uppercase tracking-wide">Chưa có hội thoại</p>
                <p className="text-xs text-slate-400 mt-2 max-w-[220px] font-medium leading-relaxed">Chọn ngôn ngữ đối tác, đặt thiết bị giữa bàn và bấm Bắt đầu dịch.</p>
              </div>
            ) : (
              messages.map((msg) => {
                if (partnerLang === 'any' && msg.speaker === 'host') return null

                const displayText = msg.speaker === 'partner' ? msg.original_text : msg.translated_text
                if (!displayText || !displayText.trim()) return null

                const timelineStr = formatTimeline(msg.start_ms - firstMsgStartMs)

                return (
                  <div key={msg.id} className="flex flex-col w-full items-start gap-1 animate-fadeIn">
                    <span className="text-[9px] md:text-[10px] font-extrabold uppercase tracking-widest px-1 text-partner/70 flex items-center gap-1.5">
                      <span>{msg.speaker === 'partner' ? selectedPartner?.name : 'Bạn (Dịch)'}</span>
                      <span className="font-mono text-slate-500 text-[8px] md:text-[9px]">[{timelineStr}]</span>
                    </span>
                    
                    <div 
                      className={`rounded-[20px] px-4 py-2.5 text-sm md:text-base font-semibold max-w-[88%] md:max-w-[85%] shadow-lg transition-all ${
                        msg.speaker === 'partner' 
                          ? 'bg-gradient-to-br from-partner/15 to-partner/5 border border-partner/20 text-partner-foreground' 
                          : 'bg-white/5 border border-white/10 text-slate-200'
                      } ${!msg.is_final ? 'opacity-70 italic animate-pulse' : ''}`}
                      style={{ fontSize: `${fontSize}%` }}
                    >
                      {displayText}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {showPartnerScrollBottom && (
            <button
              onClick={scrollToBottomPartner}
              className="absolute bottom-12 py-2 px-4 left-1/2 -translate-x-1/2 bg-partner/90 hover:bg-partner text-slate-950 rounded-full font-black shadow-xl flex items-center gap-1.5 transition-all duration-200 active:scale-95 hover:scale-105 z-20 cursor-pointer border border-white/10 text-xs tracking-wide"
            >
              <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
              Cuộn xuống
            </button>
          )}

          {isActive && (
            <div className="pt-2.5 flex items-center justify-between text-[10px] text-partner font-bold border-t border-white/5 shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-partner animate-ping"></span>
                PARTNER LISTENING
              </span>
              <span className="text-slate-500 font-extrabold tracking-wider">LATENCY ~1.2S</span>
            </div>
          )}
        </section>

        {(layoutMode === 'split' || layoutMode === 'flipped') && (
          <div
            onMouseDown={() => setIsDragging(true)}
            onTouchStart={() => setIsDragging(true)}
            className="hidden md:flex w-3 hover:w-4 cursor-col-resize select-none h-full items-center justify-center transition-all z-40 relative group shrink-0"
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-white/5 group-hover:bg-primary/30 group-active:bg-primary/50 transition-colors"></div>
            <div className="w-1.5 h-8 rounded-full bg-slate-500/20 group-hover:bg-slate-400/80 group-active:bg-primary/80 transition-colors flex flex-col gap-0.5 items-center justify-center py-1">
              <span className="w-1 h-1 rounded-full bg-white/50"></span>
              <span className="w-1 h-1 rounded-full bg-white/50"></span>
              <span className="w-1 h-1 rounded-full bg-white/50"></span>
            </div>
          </div>
        )}

        {/* PANEL B - HOST PANEL */}
        <section
          style={
            layoutMode === 'split' || layoutMode === 'flipped'
              ? { width: `calc(${100 - splitRatio}% - 6px)` }
              : undefined
          }
          className={`glass-panel rounded-3xl p-4 md:p-6 flex flex-col relative overflow-hidden border-t-2 border-host/30 shadow-host/5 shadow-2xl min-h-0 ${
            isDragging ? 'duration-0' : 'transition-all duration-500'
          } ${
            layoutMode === 'flipped' ? 'flex-[13_13_0%] order-2' : 'flex-[13_13_0%]'
          } ${layoutMode === 'split' || layoutMode === 'flipped' ? 'md:flex-none' : 'md:flex-[13_13_0%]'}`}
        >
          <div className="absolute inset-0 bg-host/[0.003] pointer-events-none"></div>

          {/* Panel B Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/5 relative z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-lg md:text-2xl">🇻🇳</span>
              <div>
                <h3 className="font-black text-xs md:text-sm text-slate-100 uppercase tracking-wide">KHUNG CỦA BẠN</h3>
                <p className="text-[9px] md:text-[10px] text-host font-extrabold uppercase tracking-widest mt-0.5">
                  TIẾNG VIỆT ONLY
                </p>
              </div>
            </div>
            
            <div className="text-[10px] font-black text-slate-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full uppercase tracking-wider">
              Khóa Tiếng Việt
            </div>
          </div>

          {/* Panel B Messages Scroll Area */}
          <div 
            ref={hostScrollRef}
            onScroll={handleHostScroll}
            className="flex-1 overflow-y-auto py-3 space-y-4 pr-1 scroll-smooth"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none px-4">
                <Volume2 className="w-12 h-12 text-host mb-3 stroke-[1.5]" />
                <p className="text-sm font-black text-slate-300 uppercase tracking-wide">Chưa có hội thoại</p>
                <p className="text-xs text-slate-400 mt-2 max-w-[220px] font-medium leading-relaxed">Mọi lời nói tiếng Việt và bản dịch tiếng Việt của đối tác sẽ hiện ở đây.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const displayText = msg.speaker === 'host' ? msg.original_text : msg.translated_text
                if (!displayText || !displayText.trim()) return null

                const timelineStr = formatTimeline(msg.start_ms - firstMsgStartMs)

                return (
                  <div key={msg.id} className="flex flex-col w-full items-start gap-1 animate-fadeIn">
                    <span className="text-[9px] md:text-[10px] font-extrabold uppercase tracking-widest px-1 text-host/70 flex items-center gap-1.5">
                      <span>{msg.speaker === 'host' ? 'Bạn' : `${selectedPartner?.name} (Dịch)`}</span>
                      <span className="font-mono text-slate-500 text-[8px] md:text-[9px]">[{timelineStr}]</span>
                    </span>
                    
                    <div 
                      className={`rounded-[20px] px-4 py-2.5 text-sm md:text-base font-semibold max-w-[88%] md:max-w-[85%] shadow-lg transition-all ${
                        msg.speaker === 'host' 
                          ? 'bg-gradient-to-br from-host/15 to-host/5 border border-host/20 text-host-foreground' 
                          : 'bg-white/5 border border-white/10 text-slate-200'
                      } ${!msg.is_final ? 'opacity-70 italic animate-pulse' : ''}`}
                      style={{ fontSize: `${fontSize}%` }}
                    >
                      {displayText}
                    </div>
                  </div>
                )
              })
            )}

            {silenceWarning && (
              <div className="w-full flex justify-center py-2 animate-bounce my-2 shrink-0">
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-2xl text-[11px] font-semibold flex items-start gap-2.5 max-w-[95%] shadow-lg shadow-red-500/5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 animate-pulse mt-0.5" />
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="uppercase text-[9px] tracking-wider font-extrabold text-red-500">CẢNH BÁO TỰ ĐỘNG DỪNG</span>
                    <span>Không phát hiện âm thanh trong 4 phút. Cuộc họp sẽ tự động dừng sau 1 phút nữa để tiết kiệm chi phí!</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {showHostScrollBottom && (
            <button
              onClick={scrollToBottomHost}
              className="absolute bottom-12 py-2 px-4 left-1/2 -translate-x-1/2 bg-host/90 hover:bg-host text-slate-950 rounded-full font-black shadow-xl flex items-center gap-1.5 transition-all duration-200 active:scale-95 hover:scale-105 z-20 cursor-pointer border border-white/10 text-xs tracking-wide"
            >
              <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
              Cuộn xuống
            </button>
          )}

          {isActive && (
            <div className="pt-2.5 flex items-center justify-between text-[10px] text-host font-bold border-t border-white/5 shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-host animate-ping"></span>
                HOST LISTENING
              </span>
              <span className="text-slate-500 font-extrabold tracking-wider">LATENCY ~1.2S</span>
            </div>
          )}
        </section>
      </main>

      {/* Control Navigation Dashboard */}
      <footer className="w-full flex flex-col md:flex-row items-center justify-between mt-3 py-3 px-4 md:px-5 glass-panel rounded-3xl gap-3 md:gap-4 relative z-20 shrink-0 border border-white/5 shadow-2xl">
        
        {/* Left Column: Connection Status & Language Selector */}
        <div className="flex items-center justify-between md:justify-start gap-3 md:gap-6 w-full md:w-auto shrink-0 pb-3 md:pb-0 border-b border-white/5 md:border-none">
          <div className="flex items-center gap-3 text-left pl-1">
            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 border border-black/10 ${
              state === 'connecting' || state === 'starting' ? 'bg-yellow-500 animate-pulse' :
              state === 'recording' ? 'bg-red-500 animate-pulse-glowing' : 
              'bg-slate-600'
            }`} />
            
            <div className="flex flex-col">
              <span className="text-[10px] md:text-xs font-black text-slate-100 uppercase tracking-wider leading-tight">
                {state === 'idle' ? 'Đang chờ' :
                 state === 'starting' ? 'Khởi động...' :
                 state === 'connecting' ? 'Kết nối...' :
                 state === 'recording' ? 'Đang dịch' :
                 state === 'paused' ? 'Tạm dừng' :
                 state === 'stopping' ? 'Đang dừng...' :
                 state === 'stopped' ? 'Đã dừng' : 'Đang chờ'}
              </span>
              <span className="text-[8px] md:text-[9px] text-slate-500 font-extrabold uppercase mt-0.5 tracking-widest hidden sm:inline-flex items-center gap-1">
                {state === 'recording' ? 'KẾT NỐI ỔN ĐỊNH' : 'AUDIO CHƯA KÍCH HOẠT'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-4 h-[44px] text-xs font-bold text-white transition-all duration-200 hover:bg-white/[0.08] shadow-inner shrink-0 focus-within:border-host/40">
            <Languages className="w-4 h-4 text-partner shrink-0" />
            <select
              disabled={isActive || recordingMode === 'one_way'}
              value={partnerLang}
              onChange={(e) => setPartnerLang(e.target.value)}
              className="bg-transparent text-xs font-extrabold text-white cursor-pointer outline-none border-none py-2 pr-1 shrink-0 focus:ring-0 focus:border-none focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {PARTNER_LANGUAGES.filter(lang => {
                if (recordingMode === 'two_way') {
                  return lang.code !== 'any'
                }
                return true
              }).map(lang => (
                <option key={lang.code} value={lang.code} className="bg-slate-950 text-white">
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
            <span className="text-slate-500 font-extrabold text-xs mx-0.5">⇆</span>
            <span className="flex items-center gap-1 text-slate-300 text-xs font-extrabold uppercase tracking-wide shrink-0">
              🇻🇳 VI
            </span>
          </div>
        </div>

        {/* Right Column: Actions (Start/Stop, Font, Layout, History, Logout) */}
        <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto mt-1 md:mt-0">
          {state === 'idle' || state === 'stopped' || state === 'error' ? (
            <button
              onClick={handleStart}
              className="flex-1 md:flex-none h-[44px] px-6 rounded-full font-black bg-gradient-to-r from-host to-partner hover:scale-[1.02] text-white shadow-lg shadow-host/20 transition-all duration-200 ease-out active:scale-[0.97] flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider animate-pulse-glowing"
            >
              <Mic className="w-4 h-4 text-white shrink-0" />
              <span>Bắt đầu</span>
            </button>
          ) : state === 'starting' || state === 'connecting' ? (
            <button
              disabled
              className="flex-1 md:flex-none h-[44px] px-6 rounded-full font-black bg-slate-800 text-slate-400 border border-white/5 transition-all duration-200 flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-not-allowed"
            >
              <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
              <span>Kết nối...</span>
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex-1 md:flex-none h-[44px] px-6 rounded-full font-black bg-gradient-to-r from-red-500 to-red-600 hover:scale-[1.02] text-white shadow-lg shadow-red-500/20 transition-all duration-200 ease-out active:scale-[0.97] flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
            >
              <Square className="w-3.5 h-3.5 text-white fill-white shrink-0" />
              <span>Dừng dịch</span>
            </button>
          )}

          {/* Font Size Selector */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowFontSizeDropdown(!showFontSizeDropdown)}
              className="h-[44px] px-4 rounded-full border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-all duration-200 ease-out active:scale-[0.97] cursor-pointer flex items-center gap-2 text-xs font-bold"
              title="Chỉnh cỡ chữ dịch"
            >
              <span className="font-black text-[9px] bg-slate-800 text-slate-300 px-1 py-0.5 rounded leading-none tracking-wide">AA</span>
              <span className="text-xs">{fontSize}%</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showFontSizeDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showFontSizeDropdown && (
              <>
                <div className="fixed inset-0 z-40 cursor-default" onClick={() => setShowFontSizeDropdown(false)} />
                <div className="absolute bottom-full right-0 mb-2.5 w-32 glass-panel rounded-2xl py-1.5 z-50 border border-white/10 shadow-2xl flex flex-col animate-fadeIn overflow-hidden">
                  {([75, 100, 120, 150, 200] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => {
                        setFontSize(size)
                        localStorage.setItem('paylingo_font_size', size.toString())
                        setShowFontSizeDropdown(false)
                      }}
                      className={`w-full px-4 py-2 text-left text-xs font-bold transition-all hover:bg-white/5 flex items-center justify-between cursor-pointer ${
                        fontSize === size ? 'text-host bg-host/5' : 'text-slate-300'
                      }`}
                    >
                      <span>Cỡ {size}%</span>
                      {fontSize === size && <Check className="w-3.5 h-3.5 text-host shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Layout Switcher */}
          <button
            onClick={handleToggleLayout}
            className="h-[44px] px-4 rounded-full border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-all duration-200 ease-out active:scale-[0.97] cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0"
            title="Chuyển đổi giao diện"
          >
            {layoutMode === 'stacked' && <LayoutGrid className="w-4 h-4 text-host" />}
            {layoutMode === 'split' && <Columns className="w-4 h-4 text-partner" />}
            {layoutMode === 'flipped' && <Rotate3d className="w-4 h-4 text-amber-500 animate-spin" style={{ animationDuration: '3s' }} />}
            <span className="hidden md:inline">
              {layoutMode === 'stacked' && 'Xếp chồng'}
              {layoutMode === 'split' && 'Song song'}
              {layoutMode === 'flipped' && 'Xoay 180°'}
            </span>
          </button>

          {/* History Page Trigger */}
          <button
            onClick={() => router.push('/history')}
            className="h-[44px] px-4 rounded-full border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-all duration-200 ease-out active:scale-[0.97] cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0"
          >
            <History className="w-4 h-4 text-host" />
            <span className="hidden md:inline">Lịch sử</span>
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-[44px] h-[44px] rounded-full border border-red-500/10 hover:border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all duration-200 ease-out active:scale-[0.97] cursor-pointer flex items-center justify-center shrink-0"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  )
}

// MAIN COMPONENT: Manages parent states, theme, authentication, and mounts persistent sliding header
// alongside the key-remountable SessionActiveArea.
export default function SessionPage() {
  const router = useRouter()
  const { theme, changeTheme } = useTheme()
  const [recordingMode, setRecordingMode] = useState<'one_way' | 'two_way' | 'scribe'>('one_way')
  const [partnerLang, setPartnerLang] = useState('any')
  const [userLabel, setUserLabel] = useState<string>('Khách')
  const [isLoadingAuth, setIsLoadingAuth] = useState(true)

  // Persistent recording state lifted from child to lock header toggle when active
  const [isRecordingActive, setIsRecordingActive] = useState(false)

  // Layout & Font states managed in parent to preserve settings across remounts
  const [layoutMode, setLayoutMode] = useState<'stacked' | 'split' | 'flipped'>('split')
  const [fontSize, setFontSize] = useState<75 | 100 | 120 | 150 | 200>(100)

  // Floating Mode Explanation Toast notification state
  const [toast, setToast] = useState<{ mode: 'one_way' | 'two_way' | 'scribe'; key: number } | null>(null)

  // Auto-dismiss mode change toast after 3.2 seconds
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => {
      setToast(null)
    }, 3200)
    return () => clearTimeout(timer)
  }, [toast])

  // Initialize sync and retrieve stored preferences on mount
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

  // Authenticate user
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

  const handleModeChange = (mode: 'one_way' | 'two_way' | 'scribe') => {
    if (isRecordingActive) return
    if (mode !== recordingMode) {
      setToast({ mode, key: Date.now() })
    }
    setRecordingMode(mode)
    if (mode === 'one_way') {
      setPartnerLang('any')
    } else if (mode === 'two_way') {
      if (partnerLang === 'any') {
        setPartnerLang('en')
      }
    }
  }

  const handleToggleLayout = () => {
    const modes: ('stacked' | 'split' | 'flipped')[] = ['stacked', 'split', 'flipped']
    const nextIndex = (modes.indexOf(layoutMode) + 1) % modes.length
    const nextMode = modes[nextIndex]
    setLayoutMode(nextMode)
    localStorage.setItem('paylingo_layout_mode', nextMode)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-host" />
        <span className="text-slate-400 mt-4 text-xs font-semibold tracking-wide">Đang kiểm tra phòng dịch...</span>
      </div>
    )
  }

  const activeIndex = recordingMode === 'one_way' ? 0 : recordingMode === 'two_way' ? 1 : 2

  return (
    <div className="h-screen h-[100dvh] w-full flex flex-col p-3 md:p-5 relative overflow-hidden bg-background">
      {/* Decorative Blur Blobs */}
      <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-host/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/3 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-partner/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Persistent Static Header: Never unmounts, enabling premium slide animations */}
      <header className="w-full flex items-center justify-between py-3 px-4 md:px-5 glass-panel rounded-full mb-3 md:mb-4 relative z-20 shrink-0 border border-white/5 shadow-xl gap-2">
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <PayPayLogo className="h-6 md:h-8 w-auto text-white shrink-0 hover:scale-[1.02] transition-transform duration-200" width={75} height={28} />
          <div className="h-4 w-px bg-white/10 shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-full text-[8px] md:text-[10px] font-extrabold uppercase tracking-widest bg-host/10 border border-host/15 text-host flex items-center gap-1 shadow-inner">
              <UserCheck className="w-3 h-3 text-host shrink-0" />
              <span className="hidden xs:inline">{userLabel}</span>
              <span className="xs:hidden">{userLabel.slice(0, 5)}...</span>
            </span>
          </div>
        </div>

        {/* Premium Sliding Segmented Control Capsule */}
        <div className="relative flex items-center p-0.5 bg-black/35 rounded-full border border-white/5 shadow-inner shrink-0 scale-90 xs:scale-100 w-[240px] md:w-[310px] h-[38px] md:h-[40px]">
          {/* Sliding active pill background layer */}
          <div 
            className="absolute top-0.5 bottom-0.5 left-1 w-[calc((100%-4px)/3-4px)] bg-host rounded-full transition-transform duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow z-0" 
            style={{ transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 4}px))` }}
          />

          <button
            disabled={isRecordingActive}
            onClick={() => handleModeChange('one_way')}
            className={`relative z-10 w-1/3 h-full rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-colors duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] flex items-center justify-center cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none ${
              recordingMode === 'one_way' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Dịch một chiều từ mọi ngôn ngữ sang Tiếng Việt"
          >
            One Way
          </button>
          
          <button
            disabled={isRecordingActive}
            onClick={() => handleModeChange('two_way')}
            className={`relative z-10 w-1/3 h-full rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-colors duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] flex items-center justify-center cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none ${
              recordingMode === 'two_way' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Dịch song ngữ hai chiều giữa hai ngôn ngữ"
          >
            Two Way
          </button>
          
          <button
            disabled={isRecordingActive}
            onClick={() => handleModeChange('scribe')}
            className={`relative z-10 w-1/3 h-full rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-colors duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] flex items-center justify-center cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none ${
              recordingMode === 'scribe' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Ghi lại nguyên bản lời nói của từng bên, không dịch"
          >
            <span className="hidden xs:inline">Smart Scribe</span>
            <span className="inline xs:hidden">Scribe</span>
          </button>
        </div>

        {/* Premium Theme Selector Pill inside header */}
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <div className="hidden md:flex items-center gap-0.5 sm:gap-1 p-0.5 bg-black/10 rounded-full border border-white/5">
            <button
              onClick={() => changeTheme('dark')}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer ${
                theme === 'dark' ? 'bg-host text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Steel Dark - Giao diện tối kim loại"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => changeTheme('light')}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer ${
                theme === 'light' ? 'bg-host text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Tech Blue Light - Giao diện sáng công nghệ"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Small version and build timestamp on the right */}
          <div className="text-right flex flex-col justify-center leading-none pr-1">
            <span className="text-[9px] md:text-[10px] text-slate-400 font-black uppercase tracking-widest">
              v3.0.3
            </span>
            <span className="text-[7px] md:text-[8px] text-slate-600 font-bold mt-1 hidden sm:inline">
              2026-07-13 12:08
            </span>
          </div>
        </div>
      </header>

      <SessionActiveArea
        key={`${recordingMode}-${partnerLang}`}
        recordingMode={recordingMode}
        partnerLang={partnerLang}
        setPartnerLang={setPartnerLang}
        layoutMode={layoutMode}
        fontSize={fontSize}
        handleToggleLayout={handleToggleLayout}
        handleLogout={handleLogout}
        setFontSize={setFontSize}
        setIsRecordingActive={setIsRecordingActive}
      />

      {/* Ultra-Premium Mode Explanation Toast */}
      {toast && (
        <div 
          key={toast.key}
          onClick={() => setToast(null)}
          className="absolute top-[76px] md:top-[92px] left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-[390px] pointer-events-auto cursor-pointer animate-toast-slide-in"
        >
          <div className="glass-panel border-white/10 rounded-2xl p-3 shadow-2xl flex items-center gap-3 relative overflow-hidden backdrop-blur-xl border border-white/5 hover:bg-white/[0.02] active:scale-98 transition-all duration-200">
            {/* Toast Mode Gradient Accent background bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
              toast.mode === 'one_way' ? 'bg-host' : toast.mode === 'two_way' ? 'bg-partner' : 'bg-amber-glow'
            }`} />
            
            {/* Icon Area */}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              toast.mode === 'one_way' ? 'bg-host/15 text-host' : toast.mode === 'two_way' ? 'bg-partner/15 text-partner' : 'bg-amber-500/15 text-amber-glow'
            }`}>
              {toast.mode === 'one_way' && <Mic className="w-4.5 h-4.5" />}
              {toast.mode === 'two_way' && <Languages className="w-4.5 h-4.5" />}
              {toast.mode === 'scribe' && <Volume2 className="w-4.5 h-4.5" />}
            </div>

            {/* Text Area */}
            <div className="flex-1 min-w-0 pr-1">
              <h4 className="font-extrabold text-[10px] md:text-[11px] text-white uppercase tracking-wider">
                {toast.mode === 'one_way' && 'Dịch Một Chiều (One-Way)'}
                {toast.mode === 'two_way' && 'Dịch Song Ngữ (Two-Way)'}
                {toast.mode === 'scribe' && 'Ghi Âm Nguyên Bản (Smart Scribe)'}
              </h4>
              <p className="text-[9px] md:text-[10px] text-slate-300 font-semibold mt-0.5 leading-snug">
                {toast.mode === 'one_way' && 'Hệ thống tự động nghe mọi ngôn ngữ và dịch trực tiếp sang Tiếng Việt.'}
                {toast.mode === 'two_way' && 'Hỗ trợ đối thoại song ngữ hai chiều tốc độ cao giữa bạn và đối tác.'}
                {toast.mode === 'scribe' && 'Ghi và nhận dạng giọng nói nguyên bản của từng bên, không dịch.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
