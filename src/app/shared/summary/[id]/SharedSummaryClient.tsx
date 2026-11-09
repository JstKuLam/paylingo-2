'use client'

import type { FormEvent, ReactNode } from 'react'
import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  Copy,
  CornerDownRight,
  Download,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Sparkles,
} from 'lucide-react'
import { getPartnerLanguage } from '@/lib/languages'
import { formatTimeline } from '@/lib/utils'

interface PageProps {
  params: Promise<{ id?: string | string[] }>
}

interface SharedTranscriptEntry {
  id: string
  speaker: 'host' | 'partner'
  speaker_label?: string | null
  original_text: string
  translated_text: string
  start_ms: number
  end_ms: number
}

interface SharedSessionMeta {
  name: string
  partner_language: string
  started_at: string
  duration_seconds: number
}

interface SharedSummary {
  id?: string
  title: string
  summary_content?: string
  session?: SharedSessionMeta | null
  entries?: SharedTranscriptEntry[]
  hasPassword?: boolean
  created_at: string
}

function renderInline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={index}>{part.slice(2, -2)}</strong>
      if (part.startsWith('*') && part.endsWith('*'))
        return <em key={index}>{part.slice(1, -1)}</em>
      return <span key={index}>{part}</span>
    })
}

function SummaryDocument({ content }: { content: string }) {
  const lines = content.split('\n')
  const blocks: { type: 'tree' | 'line'; lines: string[]; originalIndex: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const isTree = /^[├└│┌┐┘┴┬┼─]/.test(trimmed)
    const prev = blocks[blocks.length - 1]

    if (isTree && prev && prev.type === 'tree') {
      prev.lines.push(line)
    } else if (isTree) {
      blocks.push({ type: 'tree', lines: [line], originalIndex: i })
    } else {
      blocks.push({ type: 'line', lines: [line], originalIndex: i })
    }
  }

  return (
    <div className="shared-document__content">
      {blocks.map((block) => {
        if (block.type === 'tree') {
          return (
            <pre className="doc-tree" key={block.originalIndex}>
              {block.lines.join('\n')}
            </pre>
          )
        }
        const line = block.lines[0]
        const trimmed = line.trim()
        const index = block.originalIndex
        if (!trimmed) return <div className="document-space" key={index} aria-hidden="true" />
        if (trimmed.startsWith('### ')) return <h3 key={index}>{renderInline(trimmed.slice(4))}</h3>
        if (trimmed.startsWith('## ')) return <h2 key={index}>{renderInline(trimmed.slice(3))}</h2>
        if (trimmed.startsWith('# '))
          return (
            <h2 className="document-heading-large" key={index}>
              {renderInline(trimmed.slice(2))}
            </h2>
          )
        if (trimmed.startsWith('> '))
          return <blockquote key={index}>{renderInline(trimmed.slice(2))}</blockquote>
        if (/^[-*]\s/.test(trimmed))
          return (
            <div className="document-list-item" key={index}>
              <span aria-hidden="true" /> <p>{renderInline(trimmed.slice(2))}</p>
            </div>
          )
        if (/^\d+\.\s/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s(.*)$/)
          return (
            <div className="document-list-item document-list-item--ordered" key={index}>
              <b>{match?.[1]}</b>
              <p>{renderInline(match?.[2] || '')}</p>
            </div>
          )
        }
        return <p key={index}>{renderInline(trimmed)}</p>
      })}
    </div>
  )
}

export default function SharedSummaryPage({ params }: PageProps) {
  const router = useRouter()
  const rawParams = use(params)
  const id =
    typeof rawParams.id === 'string' && rawParams.id !== 'fallback' && rawParams.id !== ''
      ? rawParams.id
      : typeof window !== 'undefined'
        ? window.location.pathname.split('/').filter(Boolean).pop() || ''
        : ''
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<SharedSummary | null>(null)
  const [activeTab, setActiveTab] = useState<'transcript' | 'ai'>('transcript')
  const [copied, setCopied] = useState(false)

  const applyUnlockedData = useCallback((data: SharedSummary) => {
    setLocked(false)
    setSummary(data)
    const hasEntries = Array.isArray(data.entries) && data.entries.length > 0
    const hasAi = Boolean(data.summary_content && data.summary_content.trim())
    if (hasEntries) {
      setActiveTab('transcript')
    } else if (hasAi) {
      setActiveTab('ai')
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    if (!id || id === 'fallback') return
    try {
      const response = await fetch(`/api/shared/summary?id=${encodeURIComponent(id)}`)
      const data: SharedSummary & { error?: string; isLocked?: boolean } = await response
        .json()
        .catch(() => ({ title: '', created_at: '' }))
      if (!response.ok || data.error)
        throw new Error(data.error || 'Không thể tải cuộc hội thoại được chia sẻ.')
      if (data.isLocked) {
        setLocked(true)
        setSummary({
          title: data.title || 'Hội thoại được bảo vệ bằng mật khẩu',
          created_at: '',
        })
      } else {
        applyUnlockedData(data)
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể kết nối đến máy chủ.'
      )
    } finally {
      setLoading(false)
    }
  }, [applyUnlockedData, id])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void fetchSummary(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [fetchSummary])

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password.trim()) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/shared/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', id, password }),
      })
      const data: SharedSummary & { error?: string } = await response
        .json()
        .catch(() => ({ title: '', created_at: '' }))
      if (!response.ok || data.error) throw new Error(data.error || 'Mật khẩu không đúng.')
      applyUnlockedData(data)
      setPassword('')
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể xác thực mật khẩu.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      // Ignore clipboard write restrictions
    }
  }

  if (loading && !summary) {
    return (
      <div className="app-loading" role="status">
        <Loader2 className="animate-spin" aria-hidden="true" />
        <span>Đang tải hội thoại được chia sẻ</span>
      </div>
    )
  }

  const entries = summary?.entries ?? []
  const manualNotes = entries.filter((e) => e.speaker_label === 'NOTE')
  const speechEntries = entries.filter((e) => e.speaker_label !== 'NOTE')
  const firstEntryStart = speechEntries[0]?.start_ms ?? entries[0]?.start_ms ?? 0
  const partnerInfo = summary?.session?.partner_language
    ? getPartnerLanguage(summary.session.partner_language, 'vi')
    : undefined
  const partnerLabel =
    partnerInfo?.name || summary?.session?.partner_language?.toUpperCase() || 'Đối tác'
  const hasAiSummary = Boolean(summary?.summary_content && summary.summary_content.trim())
  const displayDate = summary?.session?.started_at || summary?.created_at || ''

  return (
    <div className="scr-view">
      <header className="scr-top">
        <div className="scr-top__left">
          <div className="brand">
            <div className="brand__mark" aria-hidden="true">
              <MessageSquare className="i" />
            </div>
            <span className="brand__name">PayLingo</span>
          </div>
          <span className="scr-hide-sm">
            <strong>Hội thoại được chia sẻ</strong>
          </span>
        </div>

        <div className="scr-top__right">
          <button type="button" className="btn btn--sm btn--outline" onClick={() => router.push('/')}>
            <ArrowLeft className="i" aria-hidden="true" />
            <span>Mở ứng dụng</span>
          </button>
          <button type="button" className="btn btn--sm btn--primary" onClick={handleCopyLink}>
            {copied ? (
              <Check className="i" aria-hidden="true" />
            ) : (
              <Copy className="i" aria-hidden="true" />
            )}
            <span>{copied ? 'Đã sao chép' : 'Sao chép Link'}</span>
          </button>
        </div>
      </header>

      <main className="scr-body">
        <div className="scr-wrap">
          {error && !locked ? (
            <div className="gate-card">
              <div className="gate-icon">
                <FileText className="i" aria-hidden="true" />
              </div>
              <h2>Không thể mở liên kết chia sẻ</h2>
              <p>{error}</p>
              <button type="button" className="btn btn--primary" onClick={() => router.push('/')}>
                <ArrowLeft className="i" aria-hidden="true" />
                <span>Trở về ứng dụng</span>
              </button>
            </div>
          ) : locked ? (
            <section className="gate-card">
              <div className="gate-icon">
                <LockKeyhole className="i" aria-hidden="true" />
              </div>
              <h2>{summary?.title || 'Hội thoại riêng tư'}</h2>
              <p>Nhập mật khẩu do người chia sẻ cung cấp để vào xem nội dung cuộc hội thoại.</p>
              <form className="entry-form" onSubmit={handlePasswordSubmit}>
                <label htmlFor="summary-password" className="sr-only">
                  Mật khẩu truy cập
                </label>
                <div className="h-feed__search-row">
                  <input
                    id="summary-password"
                    type={showPassword ? 'text' : 'password'}
                    className="auth-input"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Nhập mật khẩu để vào xem..."
                    maxLength={128}
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    className="btn btn--icon btn--outline"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? (
                      <EyeOff className="i" aria-hidden="true" />
                    ) : (
                      <Eye className="i" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {error && (
                  <div className="session-alert session-alert--danger" role="alert">
                    <p>{error}</p>
                  </div>
                )}
                <button type="submit" className="btn btn--primary" disabled={loading}>
                  {loading ? (
                    <Loader2 className="i animate-spin" aria-hidden="true" />
                  ) : (
                    <LockKeyhole className="i" aria-hidden="true" />
                  )}
                  <span>{loading ? 'Đang xác thực...' : 'Mở khóa hội thoại'}</span>
                </button>
              </form>
            </section>
          ) : (
            <article className="doc-paper">
              <div className="g-head">
                <div>
                  <h2>{summary?.title}</h2>
                  <div className="g-meta">
                    <span className="meta-pill meta-pill--sync">
                      {summary?.hasPassword ? (
                        <LockKeyhole className="i" aria-hidden="true" />
                      ) : (
                        <Globe className="i" aria-hidden="true" />
                      )}
                      <span>{summary?.hasPassword ? 'Chia sẻ riêng tư' : 'Chia sẻ công khai'}</span>
                    </span>
                    {displayDate && Number.isFinite(new Date(displayDate).getTime()) && (
                      <span className="meta-pill">
                        {new Date(displayDate).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                </div>
                {hasAiSummary && (
                  <button
                    type="button"
                    className="btn btn--sm btn--outline"
                    onClick={async () => {
                      const { downloadSummaryHTML } = await import('@/lib/html-generator')
                      downloadSummaryHTML(
                        summary?.title || 'Hội thoại PayLingo',
                        summary?.summary_content || '',
                        displayDate || new Date().toISOString(),
                        partnerLabel
                      )
                    }}
                  >
                    <Download className="i" aria-hidden="true" />
                    <span>Tải báo cáo HTML</span>
                  </button>
                )}
              </div>

              {(entries.length > 0 || hasAiSummary) && (
                <div className="h-detail__tabs-bar">
                  <div className="seg" role="tablist" aria-label="Chế độ xem hội thoại chia sẻ">
                    {entries.length > 0 && (
                      <button
                        type="button"
                        role="tab"
                        className="seg__btn"
                        aria-selected={activeTab === 'transcript'}
                        onClick={() => setActiveTab('transcript')}
                      >
                        <FileText className="i" aria-hidden="true" />
                        <span>Nội dung ({speechEntries.length})</span>
                      </button>
                    )}
                    {hasAiSummary && (
                      <button
                        type="button"
                        role="tab"
                        className="seg__btn"
                        aria-selected={activeTab === 'ai'}
                        onClick={() => setActiveTab('ai')}
                      >
                        <Sparkles className="i" aria-hidden="true" />
                        <span>Tóm tắt AI</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'transcript' && entries.length > 0 ? (
                <div className="shared-transcript-wrap">
                  {manualNotes.length > 0 && (
                    <div className="tx-notes-panel">
                      <div className="tx-notes-panel__head">
                        <strong>Ghi chú theo mốc thời gian ({manualNotes.length})</strong>
                      </div>
                      <div className="note-list">
                        {manualNotes.map((note) => (
                          <article key={note.id} className="note">
                            <div className="note__head">
                              <span className="cite" aria-label="Timestamp">
                                <span>
                                  {formatTimeline(Math.max(0, note.start_ms - firstEntryStart))}
                                </span>
                                <CornerDownRight className="i" aria-hidden="true" />
                              </span>
                            </div>
                            <div className="note__body">{note.original_text}</div>
                            {note.translated_text && (
                              <div className="note__sub">
                                <em>“{note.translated_text}”</em>
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    </div>
                  )}

                  <ol className="tx-list">
                    {speechEntries.map((entry) => {
                      const isHost = entry.speaker === 'host'
                      const origText = (entry.original_text || '').trim()
                      const transText = (entry.translated_text || '').trim()
                      const primaryText = origText || transText
                      const secondaryText =
                        transText && transText !== origText ? transText : ''

                      return (
                        <li
                          key={entry.id}
                          className={`tx-item ${isHost ? 'tx-item--m' : ''}`.trim()}
                        >
                          <div className="tx-item__head">
                            <span className="tx-item__role">
                              {isHost ? 'Bạn (Tiếng Việt)' : partnerLabel}
                              {entry.speaker_label ? ` · #${entry.speaker_label}` : ''}
                            </span>
                            <time className="tx-item__time">
                              {formatTimeline(Math.max(0, entry.start_ms - firstEntryStart))}
                            </time>
                          </div>
                          <div className="tx-item__body">
                            <p className="tx-item__orig">{primaryText || '—'}</p>
                            {secondaryText && (
                              <p className="tx-item__trans">{secondaryText}</p>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ) : (
                <SummaryDocument content={summary?.summary_content || ''} />
              )}
            </article>
          )}
        </div>
      </main>
    </div>
  )
}
