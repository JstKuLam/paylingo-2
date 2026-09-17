'use client'

import type { FormEvent, ReactNode } from 'react'
import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Copy, Eye, EyeOff, FileText, Loader2, LockKeyhole } from 'lucide-react'
import PayPayLogo from '@/components/PayPayLogo'

interface PageProps {
  params: Promise<{ id?: string | string[] }>
}

interface SharedSummary {
  title: string
  summary_content?: string
  created_at: string
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    return <span key={index}>{part}</span>
  })
}

function SummaryDocument({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="shared-document__content">
      {lines.map((line, index) => {
        const trimmed = line.trim()
        if (!trimmed) return <div className="document-space" key={index} aria-hidden="true" />
        if (trimmed.startsWith('### ')) return <h3 key={index}>{renderInline(trimmed.slice(4))}</h3>
        if (trimmed.startsWith('## ')) return <h2 key={index}>{renderInline(trimmed.slice(3))}</h2>
        if (trimmed.startsWith('# ')) return <h2 className="document-heading-large" key={index}>{renderInline(trimmed.slice(2))}</h2>
        if (trimmed.startsWith('> ')) return <blockquote key={index}>{renderInline(trimmed.slice(2))}</blockquote>
        if (/^[-*]\s/.test(trimmed)) return <div className="document-list-item" key={index}><span aria-hidden="true" /> <p>{renderInline(trimmed.slice(2))}</p></div>
        if (/^\d+\.\s/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s(.*)$/)
          return <div className="document-list-item document-list-item--ordered" key={index}><b>{match?.[1]}</b><p>{renderInline(match?.[2] || '')}</p></div>
        }
        if (/^[├└│]/.test(trimmed)) return <pre className="document-tree" key={index}>{line}</pre>
        return <p key={index}>{renderInline(trimmed)}</p>
      })}
    </div>
  )
}

export default function SharedSummaryPage({ params }: PageProps) {
  const router = useRouter()
  const rawParams = use(params)
  const id = (typeof rawParams.id === 'string' && rawParams.id !== 'fallback' && rawParams.id !== '')
    ? rawParams.id
    : (typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean).pop() || '' : '')
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<SharedSummary | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchSummary = useCallback(async () => {
    try {
      const response = await fetch(`/api/shared/summary?id=${encodeURIComponent(id)}`)
      const data: SharedSummary & { error?: string; isLocked?: boolean } = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'Không thể tải bản tóm tắt.')
      if (data.isLocked) {
        setLocked(true)
        setSummary({ title: 'Bản tóm tắt được bảo vệ', created_at: '' })
      } else {
        setLocked(false)
        setSummary(data)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể kết nối đến máy chủ.')
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
      const data: SharedSummary & { error?: string } = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'Mật khẩu không đúng.')
      setLocked(false)
      setSummary(data)
      setPassword('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể xác thực mật khẩu.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (loading && !summary) {
    return <div className="app-loading" role="status"><Loader2 className="animate-spin" aria-hidden="true" /><span>Đang tải bản tóm tắt</span></div>
  }

  if (error && !locked) {
    return (
      <div className="detail-not-found">
        <FileText aria-hidden="true" />
        <h1>Không thể mở bản tóm tắt</h1>
        <p>{error}</p>
        <button type="button" onClick={() => router.push('/')}><ArrowLeft aria-hidden="true" /> Trở về ứng dụng</button>
      </div>
    )
  }

  if (locked) {
    return (
      <main className="shared-lock-shell">
        <section className="shared-lock-panel">
          <span className="shared-lock-icon"><LockKeyhole aria-hidden="true" /></span>
          <p className="eyebrow">Tài liệu được bảo vệ</p>
          <h1>{summary?.title}</h1>
          <p>Nhập mật khẩu do người chia sẻ cung cấp để xem nội dung.</p>
          <form onSubmit={handlePasswordSubmit}>
            <label htmlFor="summary-password">Mật khẩu truy cập</label>
            <div className="password-control">
              <input id="summary-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} maxLength={128} autoFocus required />
              <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </div>
            {error && <div className="session-alert session-alert--danger" role="alert"><p>{error}</p></div>}
            <button type="submit" className="primary-command" disabled={loading}>{loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}{loading ? 'Đang xác thực' : 'Mở tài liệu'}</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <div className="shared-summary-shell">
      <header className="shared-summary-header">
        <div><PayPayLogo width={102} height={32} /><span>Tài liệu được chia sẻ</span></div>
        <div>
          <button type="button" onClick={() => router.push('/')}><ArrowLeft aria-hidden="true" /><span>Ứng dụng</span></button>
          <button type="button" onClick={handleCopyLink}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? 'Đã sao chép' : 'Sao chép link'}</button>
        </div>
      </header>
      <main className="shared-document">
        <header>
          <p className="eyebrow">Bản tóm tắt AI</p>
          <h1>{summary?.title}</h1>
          {summary?.created_at && <p>Tạo ngày {new Date(summary.created_at).toLocaleDateString('vi-VN')}</p>}
        </header>
        <SummaryDocument content={summary?.summary_content || ''} />
        <footer>PayLingo Live Interpreter</footer>
      </main>
    </div>
  )
}
