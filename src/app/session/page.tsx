'use client'

import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useRouter } from 'next/navigation'
import { useRecording } from '@soniox/react'
import {
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  Columns2,
  History,
  Languages,
  Loader2,
  LogOut,
  Mic,
  Moon,
  PanelTop,
  RotateCcw,
  Square,
  Sun,
  User,
  WifiOff,
} from 'lucide-react'
import PayPayLogo from '@/components/PayPayLogo'
import { useSessionLifecycle } from '@/hooks/useSessionLifecycle'
import { useTheme } from '@/hooks/useTheme'
import { createClient } from '@/lib/supabase/client'
import { getPartnerLanguage, PARTNER_LANGUAGES } from '@/lib/languages'
import { parseTokensToMessages, TranscriptMessage } from '@/lib/soniox-parser'
import { initAutoSync } from '@/lib/sync-manager'
import { formatTimeline } from '@/lib/utils'

type RecordingMode = 'one_way' | 'two_way' | 'scribe'
type LayoutMode = 'stacked' | 'split' | 'flipped'
type FontSize = 75 | 100 | 120 | 150 | 200
type ConversationSide = 'partner' | 'host'

const FONT_SIZES: FontSize[] = [75, 100, 120, 150, 200]
const PREFERENCE_EVENT = 'paylingo:preference-change'

const MODE_OPTIONS: Array<{
  value: RecordingMode
  label: string
  description: string
}> = [
  {
    value: 'one_way',
    label: 'Dịch sang Việt',
    description: 'Tự nhận diện ngôn ngữ và dịch sang tiếng Việt',
  },
  {
    value: 'two_way',
    label: 'Đối thoại 2 chiều',
    description: 'Dịch qua lại giữa tiếng Việt và ngôn ngữ đã chọn',
  },
  {
    value: 'scribe',
    label: 'Ghi nguyên bản',
    description: 'Ghi lời nói, không tạo bản dịch',
  },
]

function subscribeToPreferences(callback: () => void) {
  window.addEventListener('storage', callback)
  window.addEventListener(PREFERENCE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(PREFERENCE_EVENT, callback)
  }
}

function readLayoutPreference(): LayoutMode {
  const value = localStorage.getItem('paylingo_layout_mode')
  return value === 'stacked' || value === 'flipped' ? value : 'split'
}

function readFontPreference(): FontSize {
  const value = Number(localStorage.getItem('paylingo_font_size'))
  return FONT_SIZES.includes(value as FontSize) ? (value as FontSize) : 100
}

function savePreference(key: string, value: string) {
  localStorage.setItem(key, value)
  window.dispatchEvent(new Event(PREFERENCE_EVENT))
}

function useDisplayPreferences() {
  const layoutMode = useSyncExternalStore(
    subscribeToPreferences,
    readLayoutPreference,
    () => 'split' as LayoutMode
  )
  const fontSize = useSyncExternalStore(
    subscribeToPreferences,
    readFontPreference,
    () => 100 as FontSize
  )

  return {
    layoutMode,
    fontSize,
    setLayoutMode: (value: LayoutMode) => savePreference('paylingo_layout_mode', value),
    setFontSize: (value: FontSize) => savePreference('paylingo_font_size', String(value)),
  }
}

function getPanelText(
  message: TranscriptMessage,
  side: ConversationSide,
  recordingMode: RecordingMode,
  partnerLang: string
) {
  if (recordingMode === 'scribe') {
    return message.speaker === side ? message.original_text : ''
  }

  if (side === 'partner') {
    if (partnerLang === 'any' && message.speaker === 'host') return ''
    return message.speaker === 'partner' ? message.original_text : message.translated_text
  }

  return message.speaker === 'host' ? message.original_text : message.translated_text
}

function TranscriptPanel({
  side,
  title,
  languageLabel,
  languageCode,
  messages,
  firstMessageStart,
  fontSize,
  recordingMode,
  partnerLang,
  isActive,
  silenceWarning,
  scrollRef,
}: {
  side: ConversationSide
  title: string
  languageLabel: string
  languageCode: string
  messages: TranscriptMessage[]
  firstMessageStart: number
  fontSize: FontSize
  recordingMode: RecordingMode
  partnerLang: string
  isActive: boolean
  silenceWarning?: boolean
  scrollRef: RefObject<HTMLDivElement | null>
}) {
  const [showJumpButton, setShowJumpButton] = useState(false)
  const visibleMessages = useMemo(
    () =>
      messages.flatMap((message) => {
        const text = getPanelText(message, side, recordingMode, partnerLang).trim()
        return text ? [{ message, text }] : []
      }),
    [messages, partnerLang, recordingMode, side]
  )

  const latestMarker = visibleMessages.at(-1)?.message.id ?? ''

  useEffect(() => {
    const element = scrollRef.current
    if (element && !showJumpButton) {
      element.scrollTop = element.scrollHeight
    }
  }, [latestMarker, scrollRef, showJumpButton])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    setShowJumpButton(element.scrollHeight - element.scrollTop - element.clientHeight > 96)
  }

  const scrollToLatest = () => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    setShowJumpButton(false)
  }

  return (
    <section className={`transcript-panel transcript-panel--${side}`}>
      <header className="transcript-panel__header">
        <div className="language-identity">
          <span className="language-code" aria-hidden="true">{languageCode}</span>
          <div>
            <h2>{title}</h2>
            <p>{languageLabel}</p>
          </div>
        </div>
        <span className={`listening-state ${isActive ? 'is-active' : ''}`}>
          <span aria-hidden="true" />
          {isActive ? 'Đang nghe' : 'Sẵn sàng'}
        </span>
      </header>

      <div ref={scrollRef} onScroll={handleScroll} className="transcript-panel__body" aria-live="polite">
        {visibleMessages.length === 0 ? (
          <div className="transcript-empty">
            <Languages aria-hidden="true" />
            <strong>{isActive ? 'Đang chờ giọng nói' : 'Chưa bắt đầu phiên dịch'}</strong>
            <p>
              {isActive
                ? 'Bản ghi sẽ xuất hiện ở đây ngay khi hệ thống nhận diện được lời nói.'
                : side === 'partner'
                  ? 'Đặt màn hình hướng về phía người đối thoại.'
                  : 'Kiểm tra chế độ và ngôn ngữ trước khi bật micro.'}
            </p>
          </div>
        ) : (
          <ol className="transcript-list">
            {visibleMessages.map(({ message, text }) => (
              <li key={message.id} className={message.is_final ? '' : 'is-partial'}>
                <div className="transcript-meta">
                  <span>{message.speaker === 'host' ? 'Bạn' : languageLabel}</span>
                  <time>{formatTimeline(message.start_ms - firstMessageStart)}</time>
                </div>
                <p style={{ fontSize: `${fontSize}%` }}>{text}</p>
              </li>
            ))}
          </ol>
        )}

        {silenceWarning && (
          <div className="session-alert session-alert--danger" role="alert">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>Sắp tự động dừng</strong>
              <p>Không có âm thanh trong 4 phút. Phiên sẽ dừng sau 1 phút nữa để tránh phát sinh chi phí.</p>
            </div>
          </div>
        )}
      </div>

      {showJumpButton && (
        <button type="button" className="jump-to-latest" onClick={scrollToLatest}>
          <ArrowDown aria-hidden="true" />
          Mới nhất
        </button>
      )}
    </section>
  )
}

function SessionActiveArea({
  recordingMode,
  partnerLang,
  setPartnerLang,
  layoutMode,
  fontSize,
  setFontSize,
  setLayoutMode,
  setIsRecordingActive,
}: {
  recordingMode: RecordingMode
  partnerLang: string
  setPartnerLang: (language: string) => void
  layoutMode: LayoutMode
  fontSize: FontSize
  setFontSize: (size: FontSize) => void
  setLayoutMode: (layout: LayoutMode) => void
  setIsRecordingActive: (active: boolean) => void
}) {
  const [operationError, setOperationError] = useState('')
  const [splitRatio, setSplitRatio] = useState(42)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLElement>(null)
  const partnerScrollRef = useRef<HTMLDivElement>(null)
  const hostScrollRef = useRef<HTMLDivElement>(null)

  const getSonioxConfig = useCallback(async () => {
    const response = await fetch('/api/auth/soniox-key', { method: 'POST' })
    const data: { api_key?: string; error?: string } = await response.json()
    if (!response.ok || !data.api_key) {
      throw new Error(data.error || 'Không thể khởi tạo dịch vụ phiên dịch.')
    }
    return { api_key: data.api_key }
  }, [])

  const recordingConfig = useMemo(() => {
    if (recordingMode === 'scribe') {
      return partnerLang === 'any'
        ? {
            language_hints: ['vi', 'en', 'zh', 'ja', 'ko', 'es', 'ru', 'de', 'th'],
            language_hints_strict: false,
            translation: undefined,
          }
        : {
            language_hints: ['vi', partnerLang],
            language_hints_strict: true,
            translation: undefined,
          }
    }

    if (recordingMode === 'one_way' || partnerLang === 'any') {
      return {
        language_hints: ['vi', 'en', 'zh', 'ja', 'ko', 'es', 'ru', 'de', 'th'],
        language_hints_strict: false,
        translation: { type: 'one_way' as const, target_language: 'vi' },
      }
    }

    return {
      language_hints: ['vi', partnerLang],
      language_hints_strict: true,
      translation: {
        type: 'two_way' as const,
        language_a: 'vi',
        language_b: partnerLang,
      },
    }
  }, [partnerLang, recordingMode])

  const { isActive, state, finalTokens, partialTokens, start, stop } = useRecording({
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
    reset_transcript_on_reconnect: false,
  })

  const messages = useMemo(
    () => parseTokensToMessages(finalTokens, partialTokens),
    [finalTokens, partialTokens]
  )
  const firstMessageStart = messages[0]?.start_ms ?? 0

  useEffect(() => {
    setIsRecordingActive(isActive)
  }, [isActive, setIsRecordingActive])

  const {
    silenceWarning,
    wakeLockError,
    offlineIndicator,
    startSession,
    stopSession,
  } = useSessionLifecycle({
    partnerLang,
    isActive,
    messages,
    stopRecording: stop,
  })

  const selectedPartner = getPartnerLanguage(partnerLang) ?? PARTNER_LANGUAGES[0]
  const isStarting = state === 'starting' || state === 'connecting'
  const canStart = state === 'idle' || state === 'stopped' || state === 'error'

  const handleStart = async () => {
    setOperationError('')
    try {
      await startSession(selectedPartner.name)
      await start()
    } catch (error) {
      console.error('Failed to start session:', error)
      await stopSession()
      setOperationError(
        error instanceof Error ? error.message : 'Không thể bắt đầu phiên. Vui lòng kiểm tra micro và thử lại.'
      )
    }
  }

  const handleStop = async () => {
    setOperationError('')
    try {
      await stop()
    } catch (error) {
      console.error('Failed to stop recording:', error)
      setOperationError('Kết nối âm thanh đã ngắt, nhưng dữ liệu trên máy vẫn được lưu.')
    } finally {
      await stopSession()
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handlePointerMove = (event: PointerEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const ratio = layoutMode === 'flipped'
        ? ((rect.right - event.clientX) / rect.width) * 100
        : ((event.clientX - rect.left) / rect.width) * 100
      setSplitRatio(Math.max(25, Math.min(75, ratio)))
    }
    const stopDragging = () => setIsDragging(false)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDragging)
    }
  }, [isDragging, layoutMode])

  const handleDividerPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const conversationStyle = {
    '--partner-size': `${splitRatio}fr`,
    '--host-size': `${100 - splitRatio}fr`,
  } as CSSProperties

  const stateLabel =
    state === 'recording' ? 'Đang phiên dịch' :
    isStarting ? 'Đang kết nối micro' :
    state === 'stopping' ? 'Đang lưu phiên' :
    state === 'error' ? 'Lỗi kết nối' : 'Sẵn sàng'

  return (
    <div className="session-workspace">
      <div className="session-setup-bar">
        <div className="language-route">
          <label htmlFor="partner-language">Ngôn ngữ đối tác</label>
          <div>
            <Languages aria-hidden="true" />
            <select
              id="partner-language"
              value={partnerLang}
              disabled={isActive || recordingMode === 'one_way'}
              onChange={(event) => setPartnerLang(event.target.value)}
            >
              {PARTNER_LANGUAGES.filter((language) => recordingMode !== 'two_way' || language.code !== 'any')
                .map((language) => (
                  <option key={language.code} value={language.code}>{language.name}</option>
                ))}
            </select>
            <span aria-hidden="true">→</span>
            <strong>Tiếng Việt</strong>
          </div>
        </div>

        <div className="display-controls" aria-label="Thiết lập hiển thị">
          <label>
            <span>Cỡ chữ</span>
            <select value={fontSize} onChange={(event) => setFontSize(Number(event.target.value) as FontSize)}>
              {FONT_SIZES.map((size) => <option key={size} value={size}>{size}%</option>)}
            </select>
          </label>
          <div className="icon-segment" role="group" aria-label="Bố cục hội thoại">
            <button
              type="button"
              className={layoutMode === 'stacked' ? 'is-active' : ''}
              onClick={() => setLayoutMode('stacked')}
              aria-label="Xếp hai khung theo chiều dọc"
              title="Xếp dọc"
            >
              <PanelTop aria-hidden="true" />
            </button>
            <button
              type="button"
              className={layoutMode === 'split' ? 'is-active' : ''}
              onClick={() => setLayoutMode('split')}
              aria-label="Chia hai khung song song"
              title="Song song"
            >
              <Columns2 aria-hidden="true" />
            </button>
            <button
              type="button"
              className={layoutMode === 'flipped' ? 'is-active' : ''}
              onClick={() => setLayoutMode('flipped')}
              aria-label="Xoay khung đối tác 180 độ"
              title="Đối diện qua bàn"
            >
              <RotateCcw aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {(offlineIndicator || (wakeLockError && isActive) || operationError) && (
        <div className="session-alert-stack">
          {offlineIndicator && (
            <div className="session-alert session-alert--warning" role="status">
              <WifiOff aria-hidden="true" />
              <p>Mất kết nối mạng. Bản ghi vẫn được lưu trên thiết bị và sẽ đồng bộ khi có mạng.</p>
            </div>
          )}
          {wakeLockError && isActive && (
            <div className="session-alert session-alert--warning" role="status">
              <AlertTriangle aria-hidden="true" />
              <p>Thiết bị có thể tự tắt màn hình. Hãy tăng thời gian chờ trong cài đặt hệ thống.</p>
            </div>
          )}
          {operationError && (
            <div className="session-alert session-alert--danger" role="alert">
              <AlertTriangle aria-hidden="true" />
              <p>{operationError}</p>
            </div>
          )}
        </div>
      )}

      <main
        ref={containerRef}
        className={`conversation-grid conversation-grid--${layoutMode} ${isDragging ? 'is-dragging' : ''}`}
        style={conversationStyle}
      >
        <div className="conversation-grid__partner">
          <TranscriptPanel
            side="partner"
            title="Màn hình đối tác"
            languageLabel={selectedPartner.name}
            languageCode={selectedPartner.shortName}
            messages={messages}
            firstMessageStart={firstMessageStart}
            fontSize={fontSize}
            recordingMode={recordingMode}
            partnerLang={partnerLang}
            isActive={isActive}
            scrollRef={partnerScrollRef}
          />
        </div>

        {layoutMode !== 'stacked' && (
          <button
            type="button"
            className="conversation-divider"
            onPointerDown={handleDividerPointerDown}
            aria-label="Kéo để thay đổi độ rộng hai khung"
            title="Kéo để thay đổi độ rộng"
          ><span /></button>
        )}

        <div className="conversation-grid__host">
          <TranscriptPanel
            side="host"
            title="Màn hình của bạn"
            languageLabel="Tiếng Việt"
            languageCode="VI"
            messages={messages}
            firstMessageStart={firstMessageStart}
            fontSize={fontSize}
            recordingMode={recordingMode}
            partnerLang={partnerLang}
            isActive={isActive}
            silenceWarning={silenceWarning}
            scrollRef={hostScrollRef}
          />
        </div>
      </main>

      <footer className="session-command-bar">
        <div className={`recording-status recording-status--${state === 'recording' ? 'live' : state === 'error' ? 'error' : 'idle'}`} aria-live="polite">
          <span aria-hidden="true" />
          <div>
            <strong>{stateLabel}</strong>
            <small>{state === 'recording' ? 'Âm thanh đang được xử lý trực tiếp' : 'Micro chỉ bật khi bạn bắt đầu'}</small>
          </div>
        </div>

        {canStart ? (
          <button type="button" className="record-command record-command--start" onClick={handleStart}>
            <Mic aria-hidden="true" />
            Bắt đầu phiên dịch
          </button>
        ) : isStarting ? (
          <button type="button" className="record-command" disabled>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Đang kết nối
          </button>
        ) : (
          <button type="button" className="record-command record-command--stop" onClick={handleStop} disabled={state === 'stopping'}>
            {state === 'stopping' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Square aria-hidden="true" />}
            {state === 'stopping' ? 'Đang lưu' : 'Dừng và lưu phiên'}
          </button>
        )}
      </footer>
    </div>
  )
}

export default function SessionPage() {
  const router = useRouter()
  const { theme, changeTheme } = useTheme()
  const { layoutMode, fontSize, setLayoutMode, setFontSize } = useDisplayPreferences()
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('one_way')
  const [partnerLang, setPartnerLang] = useState('any')
  const [userLabel, setUserLabel] = useState('Khách')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isLoadingAuth, setIsLoadingAuth] = useState(true)
  const [isRecordingActive, setIsRecordingActive] = useState(false)

  useEffect(() => initAutoSync(), [])

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/')
        return
      }

      // Reject anonymous logins
      if (!session.user.email) {
        await supabase.auth.signOut()
        router.replace('/?error=unauthorized')
        return
      }

      const email = session.user.email

      const isAllowedDomain = email?.toLowerCase().endsWith('@pay2pay.vn') || process.env.NODE_ENV === 'development'
      if (!isAllowedDomain) {
        await supabase.auth.signOut()
        router.replace('/?error=domain_restricted')
        return
      }

      const username = session?.user?.user_metadata?.username ||
                       session?.user?.user_metadata?.full_name ||
                       session?.user?.user_metadata?.name ||
                       email?.split('@')[0]

      if (!username) {
        router.replace('/')
        return
      }

      setUserLabel(username)
      setUserEmail(email || null)
      setIsLoadingAuth(false)
    }
    void checkAuth()
  }, [router])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  const handleModeChange = (mode: RecordingMode) => {
    if (isRecordingActive) return
    setRecordingMode(mode)
    if (mode === 'one_way') setPartnerLang('any')
    if (mode === 'two_way' && partnerLang === 'any') setPartnerLang('en')
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (isLoadingAuth) {
    return (
      <div className="app-loading" role="status">
        <Loader2 className="animate-spin" aria-hidden="true" />
        <span>Đang mở bàn phiên dịch</span>
      </div>
    )
  }

  return (
    <div className="session-shell">
      <header className="session-header">
        <div className="session-brand">
          <PayPayLogo width={102} height={32} />
          <div>
            <strong>Live Interpreter</strong>
            <span>Phòng của {userLabel}</span>
          </div>
        </div>

        <nav className="session-mode-tabs" aria-label="Chế độ phiên dịch">
          {MODE_OPTIONS.map((mode) => (
            <button
              type="button"
              key={mode.value}
              className={recordingMode === mode.value ? 'is-active' : ''}
              disabled={isRecordingActive}
              onClick={() => handleModeChange(mode.value)}
              aria-describedby={`mode-${mode.value}-description`}
            >
              {mode.label}
              <span id={`mode-${mode.value}-description`} className="sr-only">{mode.description}</span>
            </button>
          ))}
        </nav>

        <div className="session-header-actions">
          <button
            type="button"
            onClick={() => router.push('/history')}
            disabled={isRecordingActive}
            aria-label="Mở lịch sử"
            title="Lịch sử"
          >
            <History aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            title={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
          >
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          <div className="profile-menu-container" ref={menuRef}>
            <button
              type="button"
              className="profile-trigger"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              disabled={isRecordingActive}
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              aria-label="Menu tài khoản"
            >
              <div className="profile-avatar">
                {userLabel ? userLabel.charAt(0).toUpperCase() : <User size={14} />}
              </div>
              <span className="profile-username">{userLabel}</span>
              <ChevronDown className={`profile-chevron ${isMenuOpen ? 'is-active' : ''}`} aria-hidden="true" />
            </button>

            {isMenuOpen && (
              <div className="profile-dropdown" role="menu">
                <div className="dropdown-user-info">
                  <div className="dropdown-username">{userLabel}</div>
                  <div className="dropdown-email">{userEmail || 'Tài khoản khách'}</div>
                </div>
                <div className="dropdown-divider" />
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    void handleLogout()
                  }}
                  className="dropdown-item logout-item"
                  role="menuitem"
                >
                  <LogOut aria-hidden="true" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            )}
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
        setFontSize={setFontSize}
        setLayoutMode={setLayoutMode}
        setIsRecordingActive={setIsRecordingActive}
      />
    </div>
  )
}
