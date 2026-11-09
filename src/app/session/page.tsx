'use client'

import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRecording } from '@soniox/react'
import { isAllowedEmail } from '@/lib/auth-utils'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  Check,
  ChevronDown,
  Clock,
  Columns2,
  FileText,
  GripVertical,
  History,
  Link2,
  Loader2,
  MessageSquare,
  Mic,
  Moon,
  PanelTop,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Sun,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react'
import ProfileMenu from '@/components/ProfileMenu'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import LanguageFlag from '@/components/LanguageFlag'
import { useSessionLifecycle } from '@/hooks/useSessionLifecycle'
import { useTheme } from '@/hooks/useTheme'
import { useLanguage } from '@/hooks/useLanguage'
import { authClient } from '@/lib/auth-client'
import { db } from '@/lib/db'
import { getLocalizedPartnerLanguages, getPartnerLanguage, PARTNER_LANGUAGES } from '@/lib/languages'
import { parseTokensToMessages, TranscriptMessage } from '@/lib/soniox-parser'
import { initAutoSync } from '@/lib/sync-manager'
import { formatTimeline, scrollIntoViewAsync } from '@/lib/utils'

interface ManualTimelineNote {
  id: string
  text: string
  contextSnippet: string
  start_ms: number
  targetTurnId?: string
  created_at: string
}

type RecordingMode = 'two_way' | 'scribe'
type LayoutMode = 'stacked' | 'split' | 'flipped'
type FontSize = 75 | 100 | 120 | 150 | 200
type ConversationSide = 'partner' | 'host'

const FONT_SIZES: FontSize[] = [75, 100, 120, 150, 200]
const PREFERENCE_EVENT = 'paylingo:preference-change'

function subscribeToPreferences(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener('storage', callback)
  window.addEventListener('resize', callback)
  window.addEventListener(PREFERENCE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener('resize', callback)
    window.removeEventListener(PREFERENCE_EVENT, callback)
  }
}

function readLayoutPreference(): LayoutMode {
  if (typeof window === 'undefined') return 'split'
  const isMobile = window.innerWidth < 640
  const defaultLayout: LayoutMode = isMobile ? 'stacked' : 'split'
  const isMobileViewport = isMobile || window.innerWidth <= 760
  const effectiveDefault: LayoutMode = isMobileViewport ? 'stacked' : defaultLayout
  try {
    const raw = localStorage.getItem('paylingo_layout_mode')
    const prefix = isMobileViewport ? 'mobile:' : 'desktop:'
    if (raw && raw.startsWith(prefix)) {
      const value = raw.slice(prefix.length)
      if (value === 'stacked' || value === 'flipped' || value === 'split') return value
    }
    return effectiveDefault
  } catch {
    return effectiveDefault
  }
}

function readFontPreference(): FontSize {
  if (typeof window === 'undefined') return 100
  try {
    const value = Number(localStorage.getItem('paylingo_font_size'))
    return FONT_SIZES.includes(value as FontSize) ? (value as FontSize) : 100
  } catch {
    return 100
  }
}

function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
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
    setLayoutMode: (value: LayoutMode) => {
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 760
      savePreference('paylingo_layout_mode', `${isMobile ? 'mobile' : 'desktop'}:${value}`)
    },
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
    return message.original_text || message.translated_text || ''
  }

  if (side === 'partner') {
    if (partnerLang === 'any' && message.speaker === 'host') {
      return message.translated_text || message.original_text
    }
    return message.speaker === 'partner'
      ? message.original_text || message.translated_text
      : message.translated_text || message.original_text
  }

  return message.speaker === 'host'
    ? message.original_text || message.translated_text
    : message.translated_text || message.original_text
}

const TranscriptPane = memo(function TranscriptPane({
  side,
  title,
  subtitle,
  languageCode,
  flagCode,
  messages,
  firstMessageStart,
  recordingMode,
  partnerLang,
  isActive,
  silenceWarning,
  hoveredTurnId,
  onHoverTurn,
  highlightedTurnId,
  pinnedTurnId,
  onPinTurn,
  manualNotes,
  currentNoteTimelineMs,
  onAddManualNote,
  onDeleteManualNote,
  onJumpToManualNote,
  onOpenLangMenu,
  canChangeLang,
  scrollRef,
  onPaneScroll,
  onProgrammaticScroll,
}: {
  side: ConversationSide
  title: string
  subtitle: string
  languageCode: string
  flagCode?: string
  messages: TranscriptMessage[]
  firstMessageStart: number
  recordingMode: RecordingMode
  partnerLang: string
  isActive: boolean
  silenceWarning?: boolean
  hoveredTurnId: string | null
  onHoverTurn: (id: string | null) => void
  highlightedTurnId?: string | null
  pinnedTurnId?: string | null
  onPinTurn?: (id: string | null) => void
  manualNotes?: ManualTimelineNote[]
  currentNoteTimelineMs?: number
  onAddManualNote?: (text: string, targetTurnId?: string) => void
  onDeleteManualNote?: (noteId: string) => void
  onJumpToManualNote?: (note: ManualTimelineNote) => void
  onOpenLangMenu?: (anchor: HTMLElement) => void
  canChangeLang?: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  onPaneScroll?: (side: ConversationSide) => void
  onProgrammaticScroll?: () => void
}) {
  const { language, t } = useLanguage()
  const [showJumpButton, setShowJumpButton] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  const visibleMessages = useMemo(
    () =>
      messages.flatMap((message) => {
        const text = getPanelText(message, side, recordingMode, partnerLang).trim()
        return text ? [{ message, text }] : []
      }),
    [messages, partnerLang, recordingMode, side]
  )

  const totalVisibleTextLength = useMemo(
    () => visibleMessages.reduce((sum, item) => sum + item.text.length, 0),
    [visibleMessages]
  )
  const lastVisible = visibleMessages.at(-1)
  const latestMarker = lastVisible
    ? `${visibleMessages.length}:${lastVisible.message.id}:${lastVisible.text.length}:${totalVisibleTextLength}`
    : ''

  useEffect(() => {
    const element = scrollRef.current
    if (element && !showJumpButton && !(recordingMode === 'scribe' && side === 'host')) {
      onProgrammaticScroll?.()
      element.scrollTop = element.scrollHeight
    }
  }, [latestMarker, onProgrammaticScroll, recordingMode, scrollRef, showJumpButton, side])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    setShowJumpButton(element.scrollHeight - element.scrollTop - element.clientHeight > 96)
    onPaneScroll?.(side)
  }

  const scrollToLatest = () => {
    const element = scrollRef.current
    if (!element) return
    onProgrammaticScroll?.()
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    setShowJumpButton(false)
  }

  const isScribeNotePane = recordingMode === 'scribe' && side === 'host'
  const isScribeTranscriptPane = recordingMode === 'scribe' && side === 'partner'
  const speakerPrefix =
    language === 'en' ? 'Speaker' : language === 'zh' ? '发言人' : 'Người nói'

  const formatSpeakerWho = useCallback(
    (message: TranscriptMessage) => {
      if (recordingMode === 'scribe' && message.speaker_label) {
        return `${speakerPrefix} #${message.speaker_label}`
      }
      const baseWho = message.speaker === 'host' ? t.speakerYou : title
      return message.speaker_label ? `${baseWho} · #${message.speaker_label}` : baseWho
    },
    [recordingMode, speakerPrefix, t.speakerYou, title]
  )

  const pinnedTurn = useMemo(
    () => (pinnedTurnId ? messages.find((m) => m.id === pinnedTurnId) ?? null : null),
    [messages, pinnedTurnId]
  )

  const effectiveTimelineMs = pinnedTurn
    ? Math.max(0, pinnedTurn.start_ms - firstMessageStart)
    : Math.max(0, currentNoteTimelineMs ?? 0)

  const handleNoteSubmit = () => {
    const clean = noteDraft.trim()
    if (!clean || !onAddManualNote) return
    onAddManualNote(clean, pinnedTurnId || undefined)
    setNoteDraft('')
    onPinTurn?.(null)
  }

  return (
    <section
      className={`pane ${side === 'partner' ? 'pane--a' : 'pane--b'} ${!isScribeNotePane && visibleMessages.length === 0 ? 'is-empty' : ''} ${isActive ? 'is-speaking' : ''}`.trim()}
      aria-label={title}
    >
      <div className="pane__inner">
        <header className="pane__head">
          {side === 'partner' && onOpenLangMenu ? (
            <button
              type="button"
              className="pane__id pane__id--btn"
              disabled={!canChangeLang}
              onClick={(e) => onOpenLangMenu(e.currentTarget)}
              title="Nhấn để chọn ngôn ngữ đối tác"
            >
              <span className="pane__badge pane__badge--flag" title={languageCode}>
                <LanguageFlag code={flagCode || partnerLang} className="lang-flag lang-flag--md" />
              </span>
              <div className="pane__titles">
                <span className="pane__title">{title}</span>
                <span className="pane__sub">{subtitle}</span>
              </div>
              {canChangeLang && (
                <span className="pane__hint">
                  {language === 'en' ? 'Change' : language === 'zh' ? '切换语言' : 'Đổi ngôn ngữ'}
                </span>
              )}
              <ChevronDown className="pane__chev" aria-hidden="true" />
            </button>
          ) : (
            <div className="pane__id">
              {isScribeNotePane ? (
                <span className="pane__badge">NOTE</span>
              ) : (
                <span className="pane__badge pane__badge--flag" title={languageCode}>
                  <LanguageFlag code={flagCode || 'vi'} className="lang-flag lang-flag--md" />
                </span>
              )}
              <div className="pane__titles">
                <span className="pane__title">
                  {isScribeNotePane
                    ? language === 'en'
                      ? 'Manual Notes'
                      : language === 'zh'
                        ? '手动笔记'
                        : 'Ghi chú thủ công'
                    : title}
                </span>
                <span className="pane__sub">
                  {isScribeNotePane
                    ? language === 'en'
                      ? 'Timestamped notes · Click a note to jump to transcript'
                      : language === 'zh'
                        ? '时间轴笔记 · 点击笔记跳转至对应录音段落'
                        : 'Gắn với mốc thời gian · Chạm vào ghi chú để cuộn tới đoạn thoại'
                    : subtitle}
                </span>
              </div>
            </div>
          )}

          {isScribeNotePane && !isActive && (
            <Link href="/history" className="btn btn--sm btn--outline">
              <Sparkles className="i" aria-hidden="true" />
              <span>
                {language === 'en'
                  ? 'History & AI'
                  : language === 'zh'
                    ? '历史与 AI'
                    : 'Lịch sử & AI'}
              </span>
            </Link>
          )}
        </header>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="pane__scroll"
          tabIndex={0}
        >
          {isScribeNotePane ? (
            <div className="notes">
              <div className="note-composer">
                <div className="note-composer__bar">
                  <span className="cite cite--live">
                    <Clock className="i" aria-hidden="true" />
                    <span>{formatTimeline(effectiveTimelineMs)}</span>
                  </span>
                  {pinnedTurn && onPinTurn && (
                    <button
                      type="button"
                      className="note-pin-tag"
                      onClick={() => onPinTurn(null)}
                      title={
                        language === 'en'
                          ? 'Click to unpin from selected transcript line'
                          : language === 'zh'
                            ? '点击取消固定段落'
                            : 'Bỏ ghim khỏi câu thoại đã chọn'
                      }
                    >
                      <span>
                        {language === 'en'
                          ? 'Pinned to turn'
                          : language === 'zh'
                            ? '已锁定段落'
                            : 'Đang ghim đoạn thoại'}
                      </span>
                      <X className="i" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="note-composer__row">
                  <input
                    type="text"
                    className="note-composer__input"
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        if (event.nativeEvent.isComposing || event.keyCode === 229) {
                          return
                        }
                        handleNoteSubmit()
                      }
                    }}
                    placeholder={
                      language === 'en'
                        ? 'Write a note at this timestamp... (Press Enter)'
                        : language === 'zh'
                          ? '在此时间点添加笔记...（按 Enter 保存）'
                          : 'Nhập ghi chú tại mốc thời gian này... (Nhấn Enter để lưu)'
                    }
                  />
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    disabled={!noteDraft.trim()}
                    onClick={handleNoteSubmit}
                  >
                    <Plus className="i" aria-hidden="true" />
                    <span>{language === 'en' ? 'Add' : language === 'zh' ? '添加' : 'Lưu'}</span>
                  </button>
                </div>
              </div>

              {!manualNotes || manualNotes.length === 0 ? (
                <div className="list-empty">
                  <FileText className="i" aria-hidden="true" />
                  <p>
                    {language === 'en'
                      ? 'No manual notes yet. Type above or tap any transcript line on the left to pin a timestamped note.'
                      : language === 'zh'
                        ? '暂无手动笔记。可在上方输入，或点击左侧任意语音段落添加带时间戳的笔记。'
                        : 'Chưa có ghi chú nào. Nhập ghi chú ở trên hoặc chạm vào bất kỳ câu nào bên Scribe để ghim mốc thời gian.'}
                  </p>
                </div>
              ) : (
                <section className="notes__sec">
                  <h3 className="notes__h">
                    <span>
                      {language === 'en'
                        ? 'Timeline Notes'
                        : language === 'zh'
                           ? '时间轴笔记'
                           : 'Danh sách ghi chú theo mốc thời gian'}
                    </span>
                    <span className="notes__count">{manualNotes.length}</span>
                  </h3>
                  <ul className="notes__list">
                    {manualNotes.map((note) => {
                      const relMs = Math.max(0, note.start_ms)
                      return (
                        <li
                          key={note.id}
                          className="note note--clickable"
                          role="button"
                          tabIndex={0}
                          onClick={() => onJumpToManualNote?.(note)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              onJumpToManualNote?.(note)
                            }
                          }}
                          title={
                            language === 'en'
                              ? 'Click to scroll to this timestamp in Scribe'
                              : language === 'zh'
                                ? '点击滚动到对应的录音位置'
                                : 'Nhấn để cuộn tới đoạn ghi âm tại mốc thời gian này'
                          }
                        >
                          <div className="note__head">
                            <span className="cite">
                              <Clock className="i" aria-hidden="true" />
                              <span>{formatTimeline(relMs)}</span>
                            </span>
                            <span className="note__jump">
                              {language === 'en'
                                ? '↗ Jump to line'
                                : language === 'zh'
                                  ? '↗ 跳转段落'
                                  : '↗ Cuộn tới đoạn thoại'}
                            </span>
                            {onDeleteManualNote && (
                              <button
                                type="button"
                                className="note__del"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onDeleteManualNote(note.id)
                                }}
                                aria-label={
                                  language === 'en'
                                    ? 'Delete note'
                                    : language === 'zh'
                                      ? '删除笔记'
                                      : 'Xóa ghi chú'
                                }
                                title={
                                  language === 'en'
                                    ? 'Delete note'
                                    : language === 'zh'
                                      ? '删除笔记'
                                      : 'Xóa ghi chú'
                                }
                              >
                                <Trash2 className="i" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <span className="note__txt">{note.text}</span>
                          {note.contextSnippet && (
                            <span className="note__sub">“{note.contextSnippet}”</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="empty">
              <div className="empty__icon">
                <Mic className="i" aria-hidden="true" />
              </div>
              <p className="empty__text">
                {isActive
                  ? t.emptyActiveDesc
                  : side === 'partner'
                    ? t.emptyPartnerIdleDesc
                    : t.emptyHostIdleDesc}
              </p>
            </div>
          ) : (
            <ol className="feed">
              {visibleMessages.map(({ message, text }) => {
                const isHostSpeaker = message.speaker === 'host'
                const isLinked = hoveredTurnId === message.id
                const isHighlighted = highlightedTurnId === message.id
                const isPinned = pinnedTurnId === message.id
                return (
                  <li
                    key={message.id}
                    id={isScribeTranscriptPane ? `scribe-turn-${message.id}` : undefined}
                    data-start-ms={message.start_ms}
                    tabIndex={isScribeTranscriptPane ? -1 : undefined}
                    className={`msg ${isHostSpeaker ? 'msg--m' : ''} ${message.is_final ? '' : 'is-interim'} ${isLinked ? 'is-linked' : ''} ${isHighlighted ? 'is-highlighted' : ''} ${isPinned ? 'is-pinned' : ''}`.trim()}
                    onMouseEnter={() => onHoverTurn(message.id)}
                    onMouseLeave={() => onHoverTurn(null)}
                    onClick={
                      isScribeTranscriptPane && onPinTurn
                        ? () => onPinTurn(pinnedTurnId === message.id ? null : message.id)
                        : undefined
                    }
                  >
                    <div className="msg__meta">
                      <span className="msg__dot" aria-hidden="true" />
                      <span className="msg__who">{formatSpeakerWho(message)}</span>
                      <time className="msg__time">
                        {formatTimeline(Math.max(0, message.start_ms - firstMessageStart))}
                      </time>
                      {isScribeTranscriptPane && (
                        <span className="msg__pin-hint">
                          {isPinned
                            ? language === 'en'
                              ? 'Pinned'
                              : language === 'zh'
                                ? '已固定'
                                : 'Đã ghim'
                            : language === 'en'
                              ? '+ Note'
                              : language === 'zh'
                                ? '+ 笔记'
                                : '+ Ghi chú'}
                        </span>
                      )}
                    </div>
                    <p className="msg__text">{text}</p>
                  </li>
                )
              })}
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
          <button type="button" className="jump" onClick={scrollToLatest}>
            <ArrowDown className="i" aria-hidden="true" />
            <span>{t.jumpLatest}</span>
          </button>
        )}
      </div>
    </section>
  )
})

export default function SessionPage() {
  const router = useRouter()
  const { theme, changeTheme } = useTheme()
  const { language, t } = useLanguage()
  const { layoutMode, fontSize, setLayoutMode, setFontSize } = useDisplayPreferences()

  const [recordingMode, setRecordingMode] = useState<RecordingMode>('two_way')
  const [partnerLang, setPartnerLang] = useState('any')
  const [langSearchQuery, setLangSearchQuery] = useState('')
  const [isLoadingAuth, setIsLoadingAuth] = useState(true)
  const [operationError, setOperationError] = useState('')
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [isDragging, setIsDragging] = useState(false)
  const [syncScroll, setSyncScroll] = useState(true)
  const [hoveredTurnId, setHoveredTurnId] = useState<string | null>(null)
  const [pinnedTurnId, setPinnedTurnId] = useState<string | null>(null)
  const [highlightedTurnId, setHighlightedTurnId] = useState<string | null>(null)
  const [manualNotes, setManualNotes] = useState<ManualTimelineNote[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [mobileChromeVisible, setMobileChromeVisible] = useState(true)
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false)
  const [langMenuPos, setLangMenuPos] = useState<{ top: number; left: number }>({ top: 60, left: 240 })
  const lastSessionIdRef = useRef<string | null>(null)
  const scrollOpIdRef = useRef(0)
  const highlightTimeoutRef = useRef<number | null>(null)
  const lastScrollTopRef = useRef<Record<ConversationSide, number>>({ partner: 0, host: 0 })
  const programmaticScrollUntilRef = useRef(0)
  const touchStartYRef = useRef<number | null>(null)

  const markProgrammaticScroll = useCallback(() => {
    programmaticScrollUntilRef.current = performance.now() + 180
  }, [])

  const stageRef = useRef<HTMLElement>(null)
  const partnerScrollRef = useRef<HTMLDivElement>(null)
  const hostScrollRef = useRef<HTMLDivElement>(null)
  const langMenuRef = useRef<HTMLDivElement>(null)
  const scrollingSideRef = useRef<ConversationSide | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 760) {
      savePreference('paylingo_layout_mode', 'mobile:stacked')
    }
  }, [])

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
        const {
          data: { user },
          error: userError,
        } = await authClient.getUser()
        if (userError || !user) {
          router.replace('/')
          return
        }

        if (!user.email) {
          router.replace('/?error=unauthorized')
          return
        }

        const email = user.email
        const isAllowed = isAllowedEmail(email)
        if (!isAllowed) {
          router.replace('/?error=domain_restricted')
          return
        }

        setIsLoadingAuth(false)
      } catch (err) {
        console.error('Error checking auth in SessionPage:', err)
        router.replace('/')
      }
    }
    void checkAuth()
  }, [router])

  const errorInitServiceRef = useRef(t.errorInitService)
  useEffect(() => {
    errorInitServiceRef.current = t.errorInitService
  }, [t.errorInitService])

  const getSonioxConfig = useCallback(async () => {
    let lastError: Error | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
      }
      let response: Response
      try {
        response = await fetch('/api/auth/soniox-key', { method: 'POST' })
      } catch {
        lastError = new Error(errorInitServiceRef.current)
        continue
      }
      let data: { api_key?: string; stt_ws_url?: string; error?: string } = {}
      try {
        data = await response.json()
      } catch {
        lastError = new Error(errorInitServiceRef.current)
        if (response.status >= 500 || response.status === 429) continue
        throw lastError
      }
      if (response.ok && data.api_key) {
        return {
          api_key: data.api_key,
          ...(data.stt_ws_url ? { stt_ws_url: data.stt_ws_url } : {}),
        }
      }
      lastError = new Error(data.error || errorInitServiceRef.current)
      if (response.status >= 500 || response.status === 429) continue
      throw lastError
    }
    throw lastError ?? new Error(errorInitServiceRef.current)
  }, [])

  const recordingConfig = useMemo(() => {
    if (recordingMode === 'scribe') {
      const scribeLang = partnerLang === 'any' ? 'vi' : partnerLang
      return {
        language_hints: [scribeLang],
        language_hints_strict: true,
        translation: undefined,
      }
    }

    if (partnerLang === 'any') {
      return {
        language_hints: undefined,
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

  const sonioxContext = useMemo(
    () => authClient.buildSonioxTranscriptionContext(),
    []
  )

  const {
    isActive,
    isPaused,
    isReconnecting,
    state,
    error: recordingError,
    finalTokens,
    partialTokens,
    start,
    stop,
    cancel,
    pause,
    resume,
    clearTranscript,
  } = useRecording({
    config: getSonioxConfig,
    model: 'stt-rt-v6',
    enable_language_identification: true,
    enable_speaker_diarization: true,
    enable_endpoint_detection: true,
    max_endpoint_delay_ms: 1200,
    context: sonioxContext,
    language_hints: recordingConfig.language_hints,
    language_hints_strict: recordingConfig.language_hints_strict,
    translation: recordingConfig.translation,
    auto_reconnect: true,
    max_reconnect_attempts: 5,
    reconnect_base_delay_ms: 1000,
    reset_transcript_on_reconnect: false,
  })

  const messages = useMemo(
    () => parseTokensToMessages(finalTokens, partialTokens),
    [finalTokens, partialTokens]
  )

  const firstMessageStart = messages[0]?.start_ms ?? 0
  const effectiveActive = isActive
  const stateStr = String(state)
  const canStart =
    stateStr === 'idle' ||
    stateStr === 'init' ||
    stateStr === 'finished' ||
    stateStr === 'stopped' ||
    stateStr === 'error' ||
    stateStr === 'canceled'

  const [hasEnteredRecording, setHasEnteredRecording] = useState(false)
  if (stateStr === 'recording' && !hasEnteredRecording) {
    setHasEnteredRecording(true)
    setMobileChromeVisible(false)
  } else if (canStart && hasEnteredRecording) {
    setHasEnteredRecording(false)
    setMobileChromeVisible(true)
  }

  const effectiveReconnecting =
    isReconnecting ||
    stateStr === 'reconnecting' ||
    (stateStr === 'connecting' && hasEnteredRecording)

  useEffect(() => {
    if (state !== 'recording' || isPaused) return
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [state, isPaused])

  useEffect(() => {
    if (!isActive) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isActive])

  const isActiveRef = useRef(isActive)
  const isRecordingOrStartingRef = useRef(isActive)
  const stopRef = useRef(stop)
  useEffect(() => {
    isActiveRef.current = isActive
    isRecordingOrStartingRef.current = isActive || state === 'starting' || state === 'connecting'
  }, [isActive, state])
  useEffect(() => {
    stopRef.current = stop
  }, [stop])

  useEffect(() => {
    return () => {
      if (isActiveRef.current || isRecordingOrStartingRef.current) {
        void stopRef.current().catch(() => {})
      }
    }
  }, [])

  const {
    sessionId,
    silenceWarning,
    wakeLockError,
    offlineIndicator,
    startSession,
    stopSession,
    abortSession,
  } = useSessionLifecycle({
    partnerLang,
    isActive,
    isPaused,
    elapsedSeconds,
    messages,
    stopRecording: stop,
    silenceAlertMessage: t.silenceTimeoutAlert,
  })

  useEffect(() => {
    if (sessionId) {
      lastSessionIdRef.current = sessionId
    }
  }, [sessionId])

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  const selectedPartner = getPartnerLanguage(partnerLang, language) ?? PARTNER_LANGUAGES[0]
  const isStarting = (state === 'starting' || state === 'connecting') && !effectiveReconnecting
  const isBusyRef = useRef(false)

  useEffect(() => {
    if (state === 'error' && messages.length === 0 && elapsedSeconds === 0) {
      void abortSession()
    }
  }, [state, messages.length, elapsedSeconds, abortSession])

  const currentNoteTimelineMs = useMemo(() => {
    const latestTurnMs =
      messages.length > 0 ? Math.max(0, (messages.at(-1)?.start_ms ?? 0) - firstMessageStart) : 0
    if (effectiveActive) {
      return Math.max(elapsedSeconds * 1000, latestTurnMs)
    }
    return messages.length > 0 ? latestTurnMs : elapsedSeconds * 1000
  }, [effectiveActive, elapsedSeconds, firstMessageStart, messages])

  const handleAddManualNote = useCallback(
    (text: string, targetTurnId?: string) => {
      const targetMsg = targetTurnId
        ? messages.find((m) => m.id === targetTurnId)
        : messages.at(-1)
      const relativeStartMs =
        targetTurnId && targetMsg
          ? Math.max(0, targetMsg.start_ms - firstMessageStart)
          : currentNoteTimelineMs
      const rawStartMs = firstMessageStart + relativeStartMs
      const noteId = crypto.randomUUID()
      const contextSnippet = (targetMsg?.original_text || '').trim().slice(0, 140)
      const createdAt = new Date().toISOString()

      const newNote: ManualTimelineNote = {
        id: noteId,
        text,
        start_ms: relativeStartMs,
        targetTurnId: targetMsg?.id,
        contextSnippet,
        created_at: createdAt,
      }

      setManualNotes((prev) =>
        [...prev, newNote].sort((a, b) => a.start_ms - b.start_ms)
      )

      const activeSid = sessionId || lastSessionIdRef.current
      if (activeSid) {
        void db.transcriptEntries
          .put({
            id: noteId,
            session_id: activeSid,
            speaker: 'host',
            speaker_label: 'NOTE',
            original_text: text,
            translated_text: contextSnippet,
            start_ms: rawStartMs,
            end_ms: rawStartMs,
            created_at: createdAt,
            updated_at: createdAt,
            sync_status: 'pending',
          })
          .catch((err) => console.error('Failed to persist manual note:', err))
      }
    },
    [currentNoteTimelineMs, firstMessageStart, messages, sessionId]
  )

  const handleDeleteManualNote = useCallback((noteId: string) => {
    setManualNotes((prev) => prev.filter((n) => n.id !== noteId))
    void db.transcriptEntries.delete(noteId).catch(() => {})
  }, [])

  const handleJumpToManualNote = useCallback(
    async (note: ManualTimelineNote) => {
      if (messages.length === 0) return

      let targetMsg = note.targetTurnId
        ? messages.find((m) => m.id === note.targetTurnId)
        : undefined

      if (!targetMsg) {
        let bestDiff = Number.POSITIVE_INFINITY
        for (const msg of messages) {
          const relMs = Math.max(0, msg.start_ms - firstMessageStart)
          const diff = Math.abs(relMs - note.start_ms)
          if (diff < bestDiff) {
            bestDiff = diff
            targetMsg = msg
          }
        }
      }

      if (!targetMsg) return
      const el = document.getElementById(`scribe-turn-${targetMsg.id}`)
      if (!el) return

      const opId = ++scrollOpIdRef.current
      await scrollIntoViewAsync(
        el,
        { behavior: 'smooth', block: 'center' },
        partnerScrollRef.current
      )
      if (opId !== scrollOpIdRef.current) return

      setHighlightedTurnId(targetMsg.id)
      el.focus({ preventScroll: true })
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current)
      }
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedTurnId((curr) => (curr === targetMsg?.id ? null : curr))
      }, 2600)
    },
    [firstMessageStart, messages]
  )

  const handleStart = async () => {
    if (isBusyRef.current || !canStart) return
    isBusyRef.current = true
    setOperationError('')
    setElapsedSeconds(0)
    setPinnedTurnId(null)
    setHighlightedTurnId(null)
    setMobileChromeVisible(false)
    if (typeof window !== 'undefined' && window.innerWidth <= 760) {
      setLayoutMode(recordingMode === 'scribe' ? 'stacked' : 'flipped')
    }
    lastScrollTopRef.current = { partner: 0, host: 0 }
    const hadPreviousTranscript = messages.length > 0
    if (hadPreviousTranscript) {
      setManualNotes([])
    }
    clearTranscript()
    const sessionPrefix =
      language === 'en' ? 'Session' : language === 'zh' ? '会话' : 'Hội thoại'
    try {
      const newSid = await startSession(selectedPartner.name, sessionPrefix)
      lastSessionIdRef.current = newSid
      if (!hadPreviousTranscript && manualNotes.length > 0) {
        for (const preNote of manualNotes) {
          void db.transcriptEntries
            .put({
              id: preNote.id,
              session_id: newSid,
              speaker: 'host',
              speaker_label: 'NOTE',
              original_text: preNote.text,
              translated_text: preNote.contextSnippet || '',
              start_ms: preNote.start_ms,
              end_ms: preNote.start_ms,
              created_at: preNote.created_at,
              updated_at: preNote.created_at,
              sync_status: 'pending',
            })
            .catch(() => {})
        }
      }
      await start()
    } catch (error) {
      console.error('Failed to start session:', error)
      try {
        await stop()
      } catch {}
      await abortSession()
      setOperationError(
        error instanceof Error ? error.message : t.errorStartSession
      )
    } finally {
      isBusyRef.current = false
    }
  }

  const handleStop = async () => {
    if (isBusyRef.current) return
    isBusyRef.current = true
    setOperationError('')
    const finalElapsed = elapsedSeconds
    try {
      if (effectiveReconnecting || state === 'starting' || state === 'connecting') {
        cancel()
      } else {
        await stop()
      }
    } catch (error) {
      console.error('Failed to stop recording:', error)
      setOperationError(t.errorStopSession)
    } finally {
      setElapsedSeconds(0)
      if (typeof window !== 'undefined' && window.innerWidth <= 760) {
        setLayoutMode('stacked')
      }
      await stopSession(finalElapsed)
      isBusyRef.current = false
    }
  }

  const handleModeChange = (mode: RecordingMode) => {
    if (effectiveActive || isStarting) return
    setRecordingMode(mode)
    if (mode === 'scribe') {
      setPartnerLang('vi')
      const isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 760
      setLayoutMode(isMobileViewport ? 'stacked' : 'split')
    } else if (mode === 'two_way' && (partnerLang === 'any' || partnerLang === 'vi')) {
      setPartnerLang('en')
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handlePointerMove = (event: PointerEvent) => {
      const container = stageRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const rawRatio =
        layoutMode === 'split'
          ? (event.clientX - rect.left) / rect.width
          : (event.clientY - rect.top) / rect.height
      setSplitRatio(Math.max(0.25, Math.min(0.75, rawRatio)))
    }
    const stopDragging = () => setIsDragging(false)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)
    window.addEventListener('blur', stopDragging)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
      window.removeEventListener('blur', stopDragging)
    }
  }, [isDragging, layoutMode])

  const handleDividerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const handlePaneScroll = useCallback(
    (sourceSide: ConversationSide) => {
      const src = sourceSide === 'partner' ? partnerScrollRef.current : hostScrollRef.current
      if (src) {
        const maxSrcScroll = Math.max(0, src.scrollHeight - src.clientHeight)
        const clampedTop = Math.max(0, Math.min(src.scrollTop, maxSrcScroll))
        const prevTop = lastScrollTopRef.current[sourceSide]
        const isProgrammatic =
          performance.now() < programmaticScrollUntilRef.current ||
          (scrollingSideRef.current !== null && scrollingSideRef.current !== sourceSide)

        if (!isProgrammatic && maxSrcScroll > 4) {
          const delta = clampedTop - prevTop
          if (delta < -6) {
            setMobileChromeVisible(true)
            lastScrollTopRef.current[sourceSide] = clampedTop
          } else if (delta > 6) {
            setMobileChromeVisible(false)
            lastScrollTopRef.current[sourceSide] = clampedTop
          }
        } else {
          lastScrollTopRef.current[sourceSide] = clampedTop
        }
      }

      if (!syncScroll || recordingMode === 'scribe') return
      if (scrollingSideRef.current && scrollingSideRef.current !== sourceSide) return
      const dstSide: ConversationSide = sourceSide === 'partner' ? 'host' : 'partner'
      const dst = sourceSide === 'partner' ? hostScrollRef.current : partnerScrollRef.current
      if (!src || !dst) return

      const maxSrc = src.scrollHeight - src.clientHeight
      const maxDst = dst.scrollHeight - dst.clientHeight
      if (maxSrc <= 0 || maxDst <= 0) return

      scrollingSideRef.current = sourceSide
      programmaticScrollUntilRef.current = performance.now() + 180
      const targetDstTop = (src.scrollTop / maxSrc) * maxDst
      lastScrollTopRef.current[dstSide] = targetDstTop
      dst.scrollTop = targetDstTop
      window.requestAnimationFrame(() => {
        scrollingSideRef.current = null
      })
    },
    [recordingMode, syncScroll]
  )

  const handleStageTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('.seam, input, textarea, button')) {
      touchStartYRef.current = null
      return
    }
    if (event.touches.length === 1) {
      touchStartYRef.current = event.touches[0].clientY
    }
  }, [])

  const handleStageTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      if (isDragging || touchStartYRef.current === null || event.touches.length !== 1) return
      const currentY = event.touches[0].clientY
      const deltaY = currentY - touchStartYRef.current
      if (deltaY > 18) {
        // Finger swiping down = scrolling up toward top -> reveal toolbars
        setMobileChromeVisible(true)
        touchStartYRef.current = currentY
      } else if (deltaY < -18) {
        // Finger swiping up = scrolling down toward bottom -> hide toolbars
        setMobileChromeVisible(false)
        touchStartYRef.current = currentY
      }
    },
    [isDragging]
  )

  const handleStageWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('.seam')) return
    if (event.deltaY < -8) {
      setMobileChromeVisible(true)
    } else if (event.deltaY > 8) {
      setMobileChromeVisible(false)
    }
  }, [])

  const openLanguageMenu = useCallback(
    (anchor: HTMLElement) => {
      if (effectiveActive || isStarting) return
      const rect = anchor.getBoundingClientRect()
      const top = Math.max(8, Math.min(window.innerHeight - 472, rect.bottom + 8))
      const left = Math.max(8, Math.min(window.innerWidth - 316, rect.left))
      setLangMenuPos({ top, left })
      setIsLangMenuOpen((prev) => !prev)
    },
    [effectiveActive, isStarting]
  )

  useEffect(() => {
    if (!isLangMenuOpen) return
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setIsLangMenuOpen(false)
      }
    }
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsLangMenuOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isLangMenuOpen])

  const stepFont = (delta: number) => {
    const idx = FONT_SIZES.indexOf(fontSize)
    const nextIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, idx + delta))
    setFontSize(FONT_SIZES[nextIdx])
  }

  if (isLoadingAuth) {
    return (
      <div className="app-loading" role="status">
        <Loader2 className="animate-spin" aria-hidden="true" />
        <span>{t.openingWorkspace}</span>
      </div>
    )
  }

  const availablePartnerLanguages = getLocalizedPartnerLanguages(language)

  const isLiveRecording = state === 'recording' || state === 'paused' || effectiveReconnecting
  const stateLabel = effectiveReconnecting
    ? language === 'en'
      ? 'Reconnecting...'
      : language === 'zh'
        ? '正在重连...'
        : 'Đang kết nối lại...'
    : isPaused
      ? language === 'en'
        ? 'Paused'
        : language === 'zh'
          ? '已暂停'
          : 'Đã tạm dừng'
      : isLiveRecording
        ? t.statusRecording
        : isStarting
          ? t.statusConnectingMic
          : state === 'stopping'
            ? t.statusSaving
            : state === 'error'
              ? t.statusError
              : t.statusReady

  const computedFontPx = Math.round((18 * fontSize) / 100)
  const stageStyle = {
    '--r': splitRatio,
    '--fa': `${splitRatio}fr`,
    '--fb': `${1 - splitRatio}fr`,
    '--fs': `${computedFontPx}px`,
  } as CSSProperties

  const lastSpeaker = messages.at(-1)?.speaker
  const vuWho = !isLiveRecording ? 'idle' : lastSpeaker === 'host' ? 'm' : 'p'

  const isSessionActiveForMobile = isLiveRecording || isStarting

  return (
    <div
      className={`app ${isDragging ? 'is-resizing' : ''}`}
      data-mode={recordingMode}
      data-layout={layoutMode}
      data-session={isSessionActiveForMobile ? 'recording' : 'idle'}
      data-paused={isPaused ? 'true' : 'false'}
      data-mobile-chrome={
        isSessionActiveForMobile && !mobileChromeVisible ? 'hidden' : 'visible'
      }
      data-chrome="full"
      data-compact="0"
      style={{ '--fs': `${computedFontPx}px` } as CSSProperties}
    >
      {/* Accessibility-preserving select for partner language state */}
      <select
        aria-label={t.partnerLangLabel}
        className="sr-only"
        tabIndex={-1}
        value={partnerLang}
        disabled={isActive || isStarting}
        onChange={(event) => setPartnerLang(event.target.value)}
      >
        {availablePartnerLanguages.map((langItem) => (
          <option key={langItem.code} value={langItem.code}>
            {langItem.name}
          </option>
        ))}
      </select>

      <div className="chrome chrome--top">
        <div className="chrome__inner">
          <header className="topbar">
            <div className="topbar__grid">
              <Link href="/session" className="brand" aria-label="PayLingo Live Interpreter">
                <div className="brand__mark" aria-hidden="true">
                  <MessageSquare className="i" />
                </div>
                <span className="brand__name">PayLingo</span>
              </Link>

              <div className="seg seg--modes" role="radiogroup" aria-label={t.heroEyebrow}>
                <button
                  type="button"
                  role="radio"
                  className="seg__btn"
                  aria-checked={recordingMode === 'two_way'}
                  disabled={effectiveActive || isStarting}
                  onClick={() => handleModeChange('two_way')}
                  title={t.modeTwoWayDesc}
                >
                  <ArrowLeftRight className="i" aria-hidden="true" />
                  <span className="seg__label seg__label--long">
                    {language === 'en' ? 'Translate' : language === 'zh' ? '翻译' : 'Dịch'}
                  </span>
                  <span className="seg__label seg__label--short">
                    {language === 'en' ? 'Translate' : language === 'zh' ? '翻译' : 'Dịch'}
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  className="seg__btn"
                  aria-checked={recordingMode === 'scribe'}
                  disabled={effectiveActive || isStarting}
                  onClick={() => handleModeChange('scribe')}
                  title={t.modeScribeDesc}
                >
                  <FileText className="i" aria-hidden="true" />
                  <span className="seg__label seg__label--long">
                    {language === 'en' ? 'Notes' : language === 'zh' ? '笔记' : 'Ghi chú'}
                  </span>
                  <span className="seg__label seg__label--short">
                    {language === 'en' ? 'Notes' : language === 'zh' ? '笔记' : 'Ghi chú'}
                  </span>
                </button>
              </div>

              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (effectiveActive) {
                      void handleStop().then(() => router.push('/history'))
                    } else {
                      router.push('/history')
                    }
                  }}
                  disabled={effectiveActive && !isPaused}
                  aria-label={t.navHistory}
                  title={t.navHistory}
                >
                  <History className="i" aria-hidden="true" />
                  <span className="scr-hide-sm">{t.navHistory}</span>
                </button>
                <LanguageSwitcher />
                <button
                  type="button"
                  className="btn btn--icon scr-hide-mobile"
                  onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}
                  aria-label={theme === 'dark' ? t.themeLight : t.themeDark}
                  title={theme === 'dark' ? t.themeLight : t.themeDark}
                >
                  {theme === 'dark' ? (
                    <Sun className="i" aria-hidden="true" />
                  ) : (
                    <Moon className="i" aria-hidden="true" />
                  )}
                </button>
                <ProfileMenu disabled={effectiveActive && !isPaused} />
              </div>
            </div>
          </header>

          {(offlineIndicator ||
            (wakeLockError && isActive) ||
            operationError ||
            (state === 'error' && recordingError)) && (
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
              {(operationError || (state === 'error' && recordingError)) && (
                <div className="session-alert session-alert--danger" role="alert">
                  <AlertTriangle aria-hidden="true" />
                  <p>{operationError || recordingError?.message || t.statusError}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <main
        ref={stageRef}
        className="stage"
        style={stageStyle}
        onTouchStart={handleStageTouchStart}
        onTouchMove={handleStageTouchMove}
        onWheel={handleStageWheel}
      >
        <TranscriptPane
          side="partner"
          title={selectedPartner.name}
          subtitle={
            recordingMode === 'scribe'
              ? language === 'en'
                ? 'Scribe Transcript'
                : language === 'zh'
                  ? '语音速记 (Scribe)'
                  : 'Bản ghi Scribe'
              : t.partnerPanelTitle
          }
          languageCode={selectedPartner.shortName}
          flagCode={selectedPartner.code}
          messages={messages}
          firstMessageStart={firstMessageStart}
          recordingMode={recordingMode}
          partnerLang={partnerLang}
          isActive={effectiveActive}
          hoveredTurnId={hoveredTurnId}
          highlightedTurnId={highlightedTurnId}
          pinnedTurnId={pinnedTurnId}
          onHoverTurn={setHoveredTurnId}
          onPinTurn={(turnId) =>
            setPinnedTurnId((prev) => (prev === turnId ? null : turnId))
          }
          onOpenLangMenu={openLanguageMenu}
          canChangeLang={!effectiveActive && !isStarting}
          scrollRef={partnerScrollRef}
          onPaneScroll={handlePaneScroll}
          onProgrammaticScroll={markProgrammaticScroll}
        />

        <div
          className={`seam ${isDragging ? 'is-active' : ''}`}
          role="separator"
          tabIndex={0}
          aria-valuenow={Math.round(splitRatio * 100)}
          aria-valuemin={25}
          aria-valuemax={75}
          aria-label={t.dividerAria}
          title="Kéo để chia tỷ lệ · Nhấp đúp để đặt lại 50/50"
          onPointerDown={handleDividerPointerDown}
          onDoubleClick={() => setSplitRatio(0.5)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault()
              setSplitRatio((prev) => Math.max(0.25, Number((prev - 0.05).toFixed(2))))
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault()
              setSplitRatio((prev) => Math.min(0.75, Number((prev + 0.05).toFixed(2))))
            } else if (event.key === 'Home') {
              event.preventDefault()
              setSplitRatio(0.5)
            }
          }}
        >
          <span className="seam__grip" aria-hidden="true">
            <GripVertical className="seam__icon" />
          </span>
        </div>

        <TranscriptPane
          side="host"
          title={
            recordingMode === 'scribe'
              ? language === 'en'
                ? 'Timeline Notes'
                : language === 'zh'
                  ? '时间轴笔记'
                  : 'Ghi chú theo mốc thời gian'
              : t.vietnameseLabel
          }
          subtitle={
            recordingMode === 'scribe'
              ? language === 'en'
                ? 'Click a note to scroll to that exact moment in Scribe'
                : language === 'zh'
                  ? '点击笔记即可滚动定位至对应语音段落'
                  : 'Nhấp vào ghi chú để tự cuộn tới đoạn hội thoại đã ghi'
              : t.hostPanelTitle
          }
          languageCode="VI"
          flagCode="vi"
          messages={messages}
          firstMessageStart={firstMessageStart}
          recordingMode={recordingMode}
          partnerLang={partnerLang}
          isActive={effectiveActive}
          silenceWarning={silenceWarning}
          hoveredTurnId={hoveredTurnId}
          pinnedTurnId={pinnedTurnId}
          onHoverTurn={setHoveredTurnId}
          onPinTurn={setPinnedTurnId}
          manualNotes={manualNotes}
          currentNoteTimelineMs={currentNoteTimelineMs}
          onAddManualNote={handleAddManualNote}
          onDeleteManualNote={handleDeleteManualNote}
          onJumpToManualNote={(note) => void handleJumpToManualNote(note)}
          scrollRef={hostScrollRef}
          onPaneScroll={handlePaneScroll}
          onProgrammaticScroll={markProgrammaticScroll}
        />
      </main>

      <div className="chrome chrome--bottom">
        <div className="chrome__inner">
          <footer className="dock">
            <div className="dock__grid">
              <div className="dock__left">
                <div className="vu" data-who={vuWho} aria-hidden="true">
                  <div className="vu__ch vu__ch--p">
                    <span className="vu__lbl">{selectedPartner.shortName}</span>
                    <div className="vu__bars">
                      <i style={{ '--s': isLiveRecording ? 0.55 : 0.2 } as CSSProperties} />
                      <i style={{ '--s': isLiveRecording ? 0.85 : 0.2 } as CSSProperties} />
                      <i style={{ '--s': isLiveRecording ? 0.45 : 0.2 } as CSSProperties} />
                      <i style={{ '--s': isLiveRecording ? 0.75 : 0.2 } as CSSProperties} />
                      <i style={{ '--s': isLiveRecording ? 0.35 : 0.2 } as CSSProperties} />
                      <i style={{ '--s': isLiveRecording ? 0.65 : 0.2 } as CSSProperties} />
                    </div>
                  </div>
                  <div className="vu__ch vu__ch--m">
                    <span className="vu__lbl">VI</span>
                    <div className="vu__bars">
                      <i style={{ '--s': isLiveRecording ? 0.45 : 0.2 } as CSSProperties} />
                      <i style={{ '--s': isLiveRecording ? 0.7 : 0.2 } as CSSProperties} />
                      <i style={{ '--s': isLiveRecording ? 0.9 : 0.2 } as CSSProperties} />
                      <i style={{ '--s': isLiveRecording ? 0.5 : 0.2 } as CSSProperties} />
                      <i style={{ '--s': isLiveRecording ? 0.6 : 0.2 } as CSSProperties} />
                      <i style={{ '--s': isLiveRecording ? 0.35 : 0.2 } as CSSProperties} />
                    </div>
                  </div>
                </div>
                <div className="dock__info">
                  <div className="dock__status" role="status" aria-live="polite">
                    <strong>{stateLabel}</strong>
                  </div>
                </div>
              </div>

              <div className="dock__center">
                {canStart ? (
                  <button type="button" className="rec rec--start" onClick={handleStart}>
                    <Mic className="i" aria-hidden="true" />
                    <span>{t.startBtn}</span>
                  </button>
                ) : isStarting ? (
                  <button type="button" className="rec rec--start" disabled>
                    <Loader2 className="i animate-spin" aria-hidden="true" />
                    <span>{t.connectingBtn}</span>
                  </button>
                ) : (
                  <>
                    <div className="timer" aria-label="Thời lượng phiên">
                      <span className="rec-dot" aria-hidden="true" />
                      <span>{formatTimeline(elapsedSeconds * 1000)}</span>
                    </div>
                    <button
                      type="button"
                      className="rec rec--pause"
                      onClick={() => {
                        if (isPaused) {
                          resume()
                        } else {
                          pause()
                        }
                      }}
                      disabled={state === 'stopping'}
                      aria-label={
                        isPaused
                          ? language === 'en'
                            ? 'Resume'
                            : language === 'zh'
                              ? '继续'
                              : 'Tiếp tục'
                          : language === 'en'
                            ? 'Pause'
                            : language === 'zh'
                              ? '暂停'
                              : 'Tạm dừng'
                      }
                      title={
                        isPaused
                          ? language === 'en'
                            ? 'Resume session'
                            : language === 'zh'
                              ? '继续会话'
                              : 'Tiếp tục phiên dịch'
                          : language === 'en'
                            ? 'Pause session'
                            : language === 'zh'
                              ? '暂停会话'
                              : 'Tạm dừng phiên dịch'
                      }
                    >
                      {isPaused ? (
                        <Play className="i" aria-hidden="true" />
                      ) : (
                        <Pause className="i" aria-hidden="true" />
                      )}
                      <span className="scr-hide-xs">
                        {isPaused
                          ? language === 'en'
                            ? 'Resume'
                            : language === 'zh'
                              ? '继续'
                              : 'Tiếp tục'
                          : language === 'en'
                            ? 'Pause'
                            : language === 'zh'
                              ? '暂停'
                              : 'Tạm dừng'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="rec rec--stop"
                      onClick={handleStop}
                      disabled={state === 'stopping'}
                    >
                      {state === 'stopping' ? (
                        <Loader2 className="i animate-spin" aria-hidden="true" />
                      ) : (
                        <Square className="i" aria-hidden="true" />
                      )}
                      <span className="seg__label seg__label--long">
                        {state === 'stopping' ? t.savingBtn : t.stopBtn}
                      </span>
                      <span className="seg__label seg__label--short">
                        {state === 'stopping'
                          ? t.savingBtn
                          : language === 'en'
                            ? 'Stop'
                            : language === 'zh'
                              ? '停止'
                              : 'Dừng'}
                      </span>
                    </button>
                  </>
                )}
              </div>

              <div className="dock__right">
                <div className="tools" aria-label={t.displayControlsAria}>
                  <div className="seg" role="radiogroup" aria-label={t.layoutGroupAria}>
                    <button
                      type="button"
                      role="radio"
                      className="seg__btn seg__btn--icon"
                      aria-checked={layoutMode === 'split'}
                      onClick={() => setLayoutMode('split')}
                      aria-label={t.layoutSplitAria}
                      title={t.layoutSplitTitle}
                    >
                      <Columns2 className="i" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      role="radio"
                      className="seg__btn seg__btn--icon"
                      aria-checked={layoutMode === 'stacked'}
                      onClick={() => setLayoutMode('stacked')}
                      aria-label={t.layoutStackedAria}
                      title={t.layoutStackedTitle}
                    >
                      <PanelTop className="i" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      role="radio"
                      className="seg__btn seg__btn--icon"
                      aria-checked={layoutMode === 'flipped'}
                      onClick={() => setLayoutMode('flipped')}
                      aria-label={t.layoutFlippedAria}
                      title={t.layoutFlippedTitle}
                    >
                      <RotateCcw className="i" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="stepper" role="group" aria-label={t.fontSizeLabel}>
                    <button
                      type="button"
                      className="stepper__btn"
                      disabled={fontSize === FONT_SIZES[0]}
                      onClick={() => stepFont(-1)}
                      aria-label="Giảm cỡ chữ"
                      title="Giảm cỡ chữ"
                    >
                      A−
                    </button>
                    <span className="stepper__val" aria-live="polite">
                      {computedFontPx}
                    </span>
                    <button
                      type="button"
                      className="stepper__btn stepper__btn--inc"
                      disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]}
                      onClick={() => stepFont(1)}
                      aria-label="Tăng cỡ chữ"
                      title="Tăng cỡ chữ"
                    >
                      A+
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={syncScroll}
                  className="toggle"
                  onClick={() => setSyncScroll((prev) => !prev)}
                  title={
                    language === 'en'
                      ? 'Lock or unlock synchronized dual-pane scrolling'
                      : language === 'zh'
                        ? '锁定或解锁双栏同步滚动'
                        : 'Khóa hoặc mở khóa cuộn đồng bộ 2 khung'
                  }
                >
                  <Link2 className="i" aria-hidden="true" />
                  <span className="toggle__label">
                    {language === 'en'
                      ? 'Sync scroll'
                      : language === 'zh'
                        ? '同步滚动'
                        : 'Cuộn đồng bộ'}
                  </span>
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Prominent Partner Language Popover Menu */}
      {isLangMenuOpen && (
        <>
          <div
            className="menu-backdrop"
            aria-hidden="true"
            onClick={() => {
              setIsLangMenuOpen(false)
              setLangSearchQuery('')
            }}
          />
          <div
            ref={langMenuRef}
            className="menu menu--partner-lang is-open"
            role="listbox"
            aria-label="Chọn ngôn ngữ đối tác"
            style={{ top: `${langMenuPos.top}px`, left: `${langMenuPos.left}px` }}
          >
            <div className="menu__search-wrap">
              <input
                type="search"
                className="menu__search-input"
                value={langSearchQuery}
                onChange={(e) => setLangSearchQuery(e.target.value)}
                placeholder={
                  language === 'en'
                    ? 'Search 60 languages...'
                    : language === 'zh'
                      ? '搜索 60 种语言...'
                      : 'Tìm trong 60 ngôn ngữ...'
                }
                aria-label={
                  language === 'en'
                    ? 'Search partner language'
                    : language === 'zh'
                      ? '搜索对方语言'
                      : 'Tìm ngôn ngữ đối tác'
                }
              />
            </div>

            {(() => {
              const query = langSearchQuery.trim().toLowerCase()
              const filtered = query
                ? availablePartnerLanguages.filter(
                    (l) =>
                      l.name.toLowerCase().includes(query) ||
                      l.code.toLowerCase().includes(query) ||
                      l.shortName.toLowerCase().includes(query)
                  )
                : availablePartnerLanguages

              if (filtered.length === 0) {
                return (
                  <div className="menu__empty">
                    {language === 'en'
                      ? 'No matching language'
                      : language === 'zh'
                        ? '未找到匹配的语言'
                        : 'Không tìm thấy ngôn ngữ phù hợp'}
                  </div>
                )
              }

              const autoList = filtered.filter((l) => l.code === 'any')
              const popularList = filtered.filter((l) => l.popular)
              const otherList = filtered.filter((l) => l.code !== 'any' && !l.popular)

              const renderOpt = (langItem: (typeof availablePartnerLanguages)[number]) => {
                const isSelected = langItem.code === partnerLang
                return (
                  <button
                    key={langItem.code}
                    type="button"
                    role="option"
                    data-lang={langItem.code}
                    aria-selected={isSelected}
                    className="menu__opt"
                    onClick={() => {
                      setPartnerLang(langItem.code)
                      setIsLangMenuOpen(false)
                      setLangSearchQuery('')
                    }}
                  >
                    <LanguageFlag code={langItem.code} className="lang-flag lang-flag--md" />
                    <span className="menu__name">{langItem.name}</span>
                    <span className="menu__code">{langItem.shortName}</span>
                    <Check className="i menu__check" aria-hidden="true" />
                  </button>
                )
              }

              return (
                <div className="menu__scroll">
                  {autoList.map(renderOpt)}

                  {popularList.length > 0 && (
                    <>
                      <div className="menu__label">
                        {language === 'en'
                          ? 'Popular Languages'
                          : language === 'zh'
                            ? '常用语言'
                            : 'Ngôn ngữ phổ biến'}
                      </div>
                      {popularList.map(renderOpt)}
                    </>
                  )}

                  {otherList.length > 0 && (
                    <>
                      <div className="menu__label">
                        {language === 'en'
                          ? 'All Soniox Languages (A–Z)'
                          : language === 'zh'
                            ? '所有支持语言 (A–Z)'
                            : 'Tất cả ngôn ngữ hỗ trợ (A–Z)'}
                      </div>
                      {otherList.map(renderOpt)}
                    </>
                  )}
                </div>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}
