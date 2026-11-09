'use client'

import type { FormEvent, ReactNode } from 'react'
import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
  MessageSquare,
} from 'lucide-react'

interface PageProps {
  params: Promise<{ id?: string | string[] }>
}

interface SharedSummary {
  title: string
  summary_content?: string
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
  const [copied, setCopied] = useState(false)

  const fetchSummary = useCallback(async () => {
    if (!id || id === 'fallback') return
    try {
      const response = await fetch(`/api/shared/summary?id=${encodeURIComponent(id)}`)
      const data: SharedSummary & { error?: string; isLocked?: boolean } = await response
        .json()
        .catch(() => ({}))
      if (!response.ok || data.error)
        throw new Error(data.error || 'Không thể tải bản tóm tắt.')
      if (data.isLocked) {
        setLocked(true)
        setSummary({ title: 'Bản tóm tắt được bảo vệ bằng mật khẩu', created_at: '' })
      } else {
        setLocked(false)
        setSummary(data)
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể kết nối đến máy chủ.'
      )
    } finally {
      setLoading(false)
    }
  }, [id])

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
      const data: SharedSummary & { error?: string } = await response.json().catch(() => ({}))
      if (!response.ok || data.error) throw new Error(data.error || 'Mật khẩu không đúng.')
      setLocked(false)
      setSummary(data)
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
        <span>Đang tải bản tóm tắt</span>
      </div>
    )
  }

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
            <strong>Tài liệu Tóm tắt được chia sẻ</strong>
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
              <h2>Không thể mở bản tóm tắt</h2>
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
              <h2>{summary?.title}</h2>
              <p>Nhập mật khẩu do người chia sẻ cung cấp để mở khóa biên bản họp.</p>
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
                    placeholder="Nhập mật khẩu truy cập..."
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
                  <span>{loading ? 'Đang xác thực...' : 'Mở khóa tài liệu'}</span>
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
                      <i />
                      <span>Đã xác thực quyền xem</span>
                    </span>
                    {summary?.created_at &&
                      Number.isFinite(new Date(summary.created_at).getTime()) && (
                        <span className="meta-pill">
                          Ngày tạo: {new Date(summary.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--sm btn--outline"
                  onClick={async () => {
                    const { downloadSummaryHTML } = await import('@/lib/html-generator')
                    downloadSummaryHTML(
                      summary?.title || 'Tóm tắt Hội thoại PayLingo',
                      summary?.summary_content || '',
                      summary?.created_at || new Date().toISOString(),
                      'Song ngữ'
                    )
                  }}
                >
                  <Download className="i" aria-hidden="true" />
                  <span>Tải báo cáo HTML</span>
                </button>
              </div>
              <SummaryDocument content={summary?.summary_content || ''} />
            </article>
          )}
        </div>
      </main>
    </div>
  )
}
