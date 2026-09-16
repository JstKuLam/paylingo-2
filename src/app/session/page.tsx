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
import { isAllowedEmail } from '@/lib/auth-utils'
import {
  AlertTriangle,
  ArrowDown,
  Columns2,
  History,
  Languages,
  Loader2,
  Mic,
  Moon,
  PanelTop,
  RotateCcw,
  Square,
  Sun,
  WifiOff,
} from 'lucide-react'
import PayPayLogo from '@/components/PayPayLogo'
import ProfileMenu from '@/components/ProfileMenu'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useSessionLifecycle } from '@/hooks/useSessionLifecycle'
import { useTheme } from '@/hooks/useTheme'
import { useLanguage } from '@/hooks/useLanguage'
import { authClient } from '@/lib/auth-client'
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

function subscribeToPreferences(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener('storage', callback)
  window.addEventListener(PREFERENCE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(PREFERENCE_EVENT, callback)
  }
}

function readLayoutPreference(): LayoutMode {
  if (typeof window === 'undefined') return 'split'
  const value = localStorage.getItem('paylingo_layout_mode')
  return value === 'stacked' || value === 'flipped' ? value : 'split'
}

function readFontPreference(): FontSize {
  if (typeof window === 'undefined') return 100
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
  const { t } = useLanguage()
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
    <section className={`transcript-panel transcript-panel--${side} glass-panel-modern`}>
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
          {isActive ? t.listeningStateActive : t.listeningStateReady}
        </span>
      </header>

      <div ref={scrollRef} onScroll={handleScroll} className="transcript-panel__body" aria-live="polite">
        {visibleMessages.length === 0 ? (
          <div className="transcript-empty">
            <Languages aria-hidden="true" />
            <strong>{isActive ? t.emptyActiveTitle : t.emptyIdleTitle}</strong>
            <p>
              {isActive
                ? t.emptyActiveDesc
                : side === 'partner'
                  ? t.emptyPartnerIdleDesc
                  : t.emptyHostIdleDesc}
            </p>
          </div>
        ) : (
          <ol className="transcript-list">
            {visibleMessages.map(({ message, text }) => (
              <li key={message.id} className={message.is_final ? '' : 'is-partial'}>
                <div className="transcript-meta">
                  <span>{message.speaker === 'host' ? t.speakerYou : languageLabel}</span>
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
              <strong>{t.silenceWarningTitle}</strong>
              <p>{t.silenceWarningDesc}</p>
            </div>
          </div>
        )}
      </div>

      {showJumpButton && (
        <button type="button" className="jump-to-latest" onClick={scrollToLatest}>
          <ArrowDown aria-hidden="true" />
          {t.jumpLatest}
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
  const { language, t } = useLanguage()
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
      throw new Error(data.error || t.errorInitService)
    }
    return { api_key: data.api_key }
  }, [t.errorInitService])

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
    model: 'stt-rt-v5',
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

  const selectedPartner = getPartnerLanguage(partnerLang, language) ?? PARTNER_LANGUAGES[0]
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
        error instanceof Error ? error.message : t.errorStartSession
      )
    }
  }

  const handleStop = async () => {
    setOperationError('')
    try {
      await stop()
    } catch (error) {
      console.error('Failed to stop recording:', error)
      setOperationError(t.errorStopSession)
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
    state === 'recording' ? t.statusRecording :
    isStarting ? t.statusConnectingMic :
    state === 'stopping' ? t.statusSaving :
    state === 'error' ? t.statusError : t.statusReady

  return (
    <div className="session-workspace">
      <div className="session-setup-bar glass-panel-modern squircle-xl shadow-md border border-white/10 dark:border-white/5 relative z-10">
        <div className="language-route">
          <label htmlFor="partner-language">{t.partnerLangLabel}</label>
          <div>
            <Languages aria-hidden="true" />
            <select
              id="partner-language"
              value={partnerLang}
              disabled={isActive || recordingMode === 'one_way'}
              onChange={(event) => setPartnerLang(event.target.value)}
            >
              {PARTNER_LANGUAGES.filter((langItem) => recordingMode !== 'two_way' || langItem.code !== 'any')
                .map((langItem) => {
                  const localizedName = langItem.code === 'any' ? t.autoDetect : langItem.name
                  return (
                    <option key={langItem.code} value={langItem.code}>{localizedName}</option>
                  )
                })}
            </select>
            <span aria-hidden="true">→</span>
            <strong>{t.vietnameseLabel}</strong>
          </div>
        </div>

        <div className="display-controls" aria-label={t.displayControlsAria}>
          <label>
            <span>{t.fontSizeLabel}</span>
            <select value={fontSize} onChange={(event) => setFontSize(Number(event.target.value) as FontSize)}>
              {FONT_SIZES.map((size) => <option key={size} value={size}>{size}%</option>)}
            </select>
          </label>
          <div className="icon-segment" role="group" aria-label={t.layoutGroupAria}>
            <button
              type="button"
              className={layoutMode === 'stacked' ? 'is-active' : ''}
              onClick={() => setLayoutMode('stacked')}
              aria-label={t.layoutStackedAria}
              title={t.layoutStackedTitle}
            >
              <PanelTop aria-hidden="true" />
            </button>
            <button
              type="button"
              className={layoutMode === 'split' ? 'is-active' : ''}
              onClick={() => setLayoutMode('split')}
              aria-label={t.layoutSplitAria}
              title={t.layoutSplitTitle}
            >
              <Columns2 aria-hidden="true" />
            </button>
            <button
              type="button"
              className={layoutMode === 'flipped' ? 'is-active' : ''}
              onClick={() => setLayoutMode('flipped')}
              aria-label={t.layoutFlippedAria}
              title={t.layoutFlippedTitle}
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
              <p>{t.offlineNotice}</p>
            </div>
          )}
          {wakeLockError && isActive && (
            <div className="session-alert session-alert--warning" role="status">
              <AlertTriangle aria-hidden="true" />
              <p>{t.wakeLockNotice}</p>
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
            title={t.partnerPanelTitle}
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
            aria-label={t.dividerAria}
            title={t.dividerTitle}
          ><span /></button>
        )}

        <div className="conversation-grid__host">
          <TranscriptPanel
            side="host"
            title={t.hostPanelTitle}
            languageLabel={t.vietnameseLabel}
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

      <footer className="session-command-bar glass-panel-modern squircle-xl shadow-md border border-white/10 dark:border-white/5 relative z-10">
        <div className={`recording-status recording-status--${state === 'recording' ? 'live' : state === 'error' ? 'error' : 'idle'}`} aria-live="polite">
          <span aria-hidden="true" className={state === 'recording' ? 'animate-pulse' : ''} />
          <div>
            <strong>{stateLabel}</strong>
            <small>{state === 'recording' ? t.statusSubRecording : t.statusSubReady}</small>
          </div>
        </div>

        {canStart ? (
          <button type="button" className="record-command record-command--start active:scale-[0.98]" onClick={handleStart}>
            <Mic aria-hidden="true" />
            {t.startBtn}
          </button>
        ) : isStarting ? (
          <button type="button" className="record-command glass-button-modern" disabled>
            <Loader2 className="animate-spin" aria-hidden="true" />
            {t.connectingBtn}
          </button>
        ) : (
          <button type="button" className={`record-command record-command--stop active:scale-[0.98] ${state === 'recording' ? 'is-recording' : ''}`} onClick={handleStop} disabled={state === 'stopping'}>
            {state === 'stopping' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Square aria-hidden="true" />}
            {state === 'stopping' ? t.savingBtn : t.stopBtn}
          </button>
        )}
      </footer>
    </div>
  )
}

export default function SessionPage() {
  const router = useRouter()
  const { theme, changeTheme } = useTheme()
  const { t } = useLanguage()
  const { layoutMode, fontSize, setLayoutMode, setFontSize } = useDisplayPreferences()
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('scribe')
  const [partnerLang, setPartnerLang] = useState('any')
  const [userLabel, setUserLabel] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isLoadingAuth, setIsLoadingAuth] = useState(true)
  const [isRecordingActive, setIsRecordingActive] = useState(false)

  const modeOptions = useMemo(
    () => [
      {
        value: 'scribe' as RecordingMode,
        label: t.modeScribeLabel,
        description: t.modeScribeDesc,
      },
      {
        value: 'one_way' as RecordingMode,
        label: t.modeOneWayLabel,
        description: t.modeOneWayDesc,
      },
      {
        value: 'two_way' as RecordingMode,
        label: t.modeTwoWayLabel,
        description: t.modeTwoWayDesc,
      },
    ],
    [t]
  )

  useEffect(() => {
    try {
      return initAutoSync()
    } catch (err) {
      console.error('Failed to init auto sync:', err)
    }
  }, [])

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user }, error: userError } = await authClient.getUser()
        if (userError || !user) {
          router.replace('/')
          return
        }

        if (!user.email) {
          await authClient.signOut()
          router.replace('/?error=unauthorized')
          return
        }

        const email = user.email

        const isAllowed = isAllowedEmail(email)
        if (!isAllowed) {
          await authClient.signOut()
          router.replace('/?error=domain_restricted')
          return
        }

        const username = user.user_metadata?.username ||
                         user.user_metadata?.full_name ||
                         user.user_metadata?.name ||
                         email?.split('@')[0] || 'User'

        setUserLabel(username)
        setIsLoadingAuth(false)
      } catch (err) {
        console.error('Error checking auth in SessionPage:', err)
        router.replace('/')
      }
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

  if (isLoadingAuth) {
    return (
      <div className="app-loading" role="status">
        <Loader2 className="animate-spin" aria-hidden="true" />
        <span>{t.openingWorkspace}</span>
      </div>
    )
  }

  const effectiveUserLabel = userLabel || t.profileGuest

  return (
    <div className="session-shell relative overflow-hidden">
      {/* Liquid Glass Background Blobs */}
      <div className="liquid-bg-container" aria-hidden="true">
        <div className="liquid-blob liquid-blob-primary" />
        <div className="liquid-blob liquid-blob-partner" />
        <div className="liquid-blob liquid-blob-warning" />
      </div>

      <header className="session-header glass-panel-modern border-b border-white/10 shadow-lg relative z-50 bg-opacity-70 dark:bg-opacity-50">
        <div className="session-brand">
          <PayPayLogo width={102} height={32} />
          <div>
            <strong>Live Interpreter</strong>
            <span>{t.roomOf.replace('{user}', effectiveUserLabel)}</span>
          </div>
        </div>

        <nav className="session-mode-tabs" aria-label={t.heroEyebrow}>
          {modeOptions.map((mode) => (
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
            aria-label={t.navHistory}
            title={t.navHistory}
          >
            <History aria-hidden="true" />
          </button>
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? t.themeLight : t.themeDark}
            title={theme === 'dark' ? t.themeLight : t.themeDark}
          >
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          <ProfileMenu disabled={isRecordingActive} />
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
