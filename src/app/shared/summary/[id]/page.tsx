'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Lock, 
  Eye, 
  EyeOff, 
  Calendar, 
  ArrowLeft, 
  Loader2, 
  Check, 
  Copy, 
  Share2, 
  Sparkles,
  ChevronRight
} from 'lucide-react'

// Simple robust markdown parser to convert Gemini's markdown summary into premium responsive HTML
function renderMarkdown(md: string) {
  if (!md) return ''
  
  let html = md
    // Escape HTML entities to prevent XSS
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Headers (###, ##, #)
  html = html.replace(/^### (.*?)$/gm, '<h3 class="text-sm font-bold text-host mt-6 mb-2 tracking-wide uppercase flex items-center gap-1.5 border-b border-white/5 pb-1">$1</h3>')
  html = html.replace(/^## (.*?)$/gm, '<h2 class="text-base font-black text-white mt-8 mb-3 border-b border-white/10 pb-1.5 flex items-center gap-2">$1</h2>')
  html = html.replace(/^# (.*?)$/gm, '<h1 class="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-host to-partner mt-10 mb-4">$1</h1>')

  // Bold (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-100 font-extrabold">$1</strong>')
  
  // Italic (*text*)
  html = html.replace(/\*(.*?)\*/g, '<em class="text-slate-400">$1</em>')

  // Blockquotes (> text)
  html = html.replace(/^&gt; (.*?)$/gm, '<blockquote class="border-l-2 border-host/50 bg-host/5 px-4 py-2 my-3 rounded-r-lg text-slate-300 text-xs italic">$1</blockquote>')

  // Tree diagram / Mind map lines (├─, └─, │)
  html = html.replace(/([├└│─\s]*[├└][─]+)(.*?)$/gm, (match, prefix, text) => {
    return `<div class="font-mono text-xs text-partner flex items-start gap-1 py-0.5 leading-relaxed"><span class="text-partner/60 select-none">${prefix}</span><span class="text-slate-200">${text}</span></div>`
  })

  // Unordered list items with markdown bullet point (- or *)
  // Must avoid matching mind map prefix
  html = html.replace(/^[\s]*[\-\*] (.*?)$/gm, (match, text) => {
    // If it's a sub-item
    if (match.startsWith('  ') || match.startsWith('\t')) {
      return '<li class="text-xs text-slate-300 ml-6 list-disc py-1 font-medium">' + text + '</li>'
    }
    return '<li class="text-xs text-slate-200 ml-4 list-disc py-1 font-semibold">' + text + '</li>'
  })

  // Ordered list items
  html = html.replace(/^[\s]*(\d+)\. (.*?)$/gm, '<li class="text-xs text-slate-200 ml-4 list-decimal py-1 font-semibold">$2</li>')

  // Line breaks
  html = html.replace(/\n/g, '<br />')

  return html
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function SharedSummaryPage({ params }: PageProps) {
  const router = useRouter()
  const { id } = use(params)

  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  
  const [summary, setSummary] = useState<{
    title: string
    summary_content?: string
    created_at: string
  } | null>(null)
  
  const [copied, setCopied] = useState(false)

  // 1. Initial Load: Fetch shared summary info
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch(`/api/shared/summary?id=${id}`)
        const data = await res.json()

        if (data.error) {
          setError(data.error)
          setLoading(false)
          return
        }

        if (data.isLocked) {
          setLocked(true)
          setSummary({
            title: data.title,
            created_at: data.created_at
          })
        } else {
          setLocked(false)
          setSummary(data)
        }
      } catch (err) {
        setError('Không thể kết nối đến máy chủ')
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [id])

  // 2. Submit Password
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/shared/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          id,
          password
        })
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error || 'Sai mật khẩu truy cập')
        setLoading(false)
        return
      }

      setLocked(false)
      setSummary(data)
    } catch (err) {
      setError('Lỗi hệ thống khi xác thực mật khẩu')
    } finally {
      setLoading(false)
    }
  }

  // 3. Copy Link
  const handleCopyLink = () => {
    if (typeof window === 'undefined') return
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading && !summary) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#03000a] text-white">
        <Loader2 className="w-8 h-8 animate-spin text-host" />
        <span className="text-slate-400 mt-4 text-xs font-semibold">Đang tải bản tóm tắt cuộc họp...</span>
      </div>
    )
  }

  if (error && !locked) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#03000a] px-4 text-center">
        <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-base font-black text-white">Không thể hiển thị bản tóm tắt</h2>
        <p className="text-xs text-slate-400 mt-2 max-w-xs">{error}</p>
        <button
          onClick={() => router.push('/')}
          className="mt-6 py-2 px-5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10 transition-all cursor-pointer"
        >
          Quay lại trang chủ
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full flex flex-col p-4 md:p-6 bg-[#03000a] text-foreground relative overflow-y-auto">
      {/* Decorative Blob */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-host/5 rounded-full blur-3xl pointer-events-none z-0"></div>
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-partner/5 rounded-full blur-3xl pointer-events-none z-0"></div>

      {/* Main Glassmorphic Wrapper */}
      <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 relative z-10 my-auto justify-center">
        
        {/* Case 1: Locked Screen */}
        {locked ? (
          <div className="w-full glass-panel rounded-3xl p-6 md:p-8 flex flex-col shadow-2xl relative overflow-hidden border border-white/5 animate-fadeIn">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mx-auto mb-4 shadow-lg shadow-amber-500/5 animate-pulse-glowing">
                <Lock className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-black text-white leading-tight">Nội dung được bảo vệ</h1>
              <p className="text-[11px] text-slate-400 mt-2 font-bold max-w-xs mx-auto">
                Bản tóm tắt &ldquo;{summary?.title}&rdquo; đã được khóa bằng mật khẩu bảo mật.
              </p>
            </div>

            {/* Password input form */}
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nhập mật khẩu truy cập..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full py-3.5 pl-4 pr-12 rounded-xl glass-input text-xs font-bold text-center tracking-wider focus:placeholder-transparent"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-all"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && (
                <p className="text-[10px] text-red-400 font-extrabold text-center tracking-wide">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-host to-partner text-white font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 hover:opacity-90 shadow-xl shadow-host/10 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Xác nhận mật khẩu
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Case 2: Unlocked Content Viewer */
          <div className="w-full flex flex-col gap-4 py-6 animate-fadeIn">
            {/* Header toolbar */}
            <div className="w-full flex items-center justify-between glass-panel rounded-2xl py-3 px-4 shrink-0 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-host shadow-inner">
                  <Sparkles className="w-4 h-4 text-host" />
                </div>
                <div>
                  <h2 className="text-[10px] font-extrabold text-host uppercase tracking-wider leading-none">PayLingo AI summary</h2>
                  <p className="text-[9px] text-slate-400 mt-1 font-bold">
                    Khởi tạo: {new Date(summary?.created_at || '').toLocaleDateString('vi-VN')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopyLink}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1 text-[10px] font-extrabold cursor-pointer"
                  title="Copy link chia sẻ"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-400" />
                      <span className="hidden sm:inline text-green-400">Đã copy!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5 text-partner" />
                      <span className="hidden sm:inline">Chia sẻ</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Document display */}
            <article className="w-full glass-panel rounded-3xl p-6 md:p-8 flex flex-col shadow-2xl border border-white/5">
              {/* Document Title */}
              <header className="border-b border-white/5 pb-4 mb-6">
                <h1 className="text-lg md:text-xl font-black text-white leading-tight">
                  {summary?.title}
                </h1>
              </header>

              {/* Rendered AI Markdown Content */}
              <div 
                className="prose prose-invert prose-xs max-w-none text-slate-300 leading-relaxed font-medium space-y-4"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(summary?.summary_content || '') }}
              />
            </article>

            {/* Footer branded tag */}
            <div className="text-center opacity-30 select-none mt-2">
              <p className="text-[9px] font-extrabold tracking-widest uppercase text-slate-400">
                Powered by PayLingo Smart AI Translator
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
