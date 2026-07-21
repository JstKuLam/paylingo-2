'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Check,
  Languages,
  Loader2,
  LockKeyhole,
  Mail,
  Moon,
  Sun,
} from 'lucide-react'
import PayPayLogo from '@/components/PayPayLogo'
import { useTheme } from '@/hooks/useTheme'
import { createClient } from '@/lib/supabase/client'

export default function Home() {
  const router = useRouter()
  const { theme, changeTheme } = useTheme()
  const [email, setEmail] = useState('')
  const [isLinkSent, setIsLinkSent] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown(prev => prev - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [resendCountdown])

  useEffect(() => {
    const checkUser = async () => {
      if (!navigator.onLine) return
      try {
        const originCheck = await fetch('/api/app-version', { cache: 'no-store' })
        if (!originCheck.ok) return
      } catch {
        return
      }
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        const userEmail = session.user.email
        const isAllowedDomain = userEmail?.toLowerCase().endsWith('@pay2pay.vn') || process.env.NODE_ENV === 'development'
        if (!isAllowedDomain) {
          await supabase.auth.signOut()
          setError('Đăng nhập thất bại. Chỉ chấp nhận tài khoản email công ty (@pay2pay.vn).')
          return
        }
        router.replace('/session')
      }
    }
    void checkUser()

    // Handle query params errors in next tick to avoid eslint set-state-in-effect error
    const errParam = new URLSearchParams(window.location.search).get('error')
    if (errParam) {
      const timer = setTimeout(() => {
        if (errParam === 'domain_restricted') {
          setError('Đăng nhập thất bại. Chỉ chấp nhận tài khoản email công ty (@pay2pay.vn).')
        } else if (errParam === 'auth_failed') {
          setError('Xác thực thất bại. Vui lòng thử lại.')
        } else if (errParam === 'unauthorized') {
          setError('Bạn chưa được cấp quyền truy cập. Vui lòng đăng nhập bằng email công ty.')
        }
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [router])

  const handleSendLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!email) return

    const sanitizedEmail = email.trim().toLowerCase()
    const isAllowedDomain = sanitizedEmail.endsWith('@pay2pay.vn') || process.env.NODE_ENV === 'development'
    if (!isAllowedDomain) {
      setError('Chỉ chấp nhận email thuộc domain công ty (@pay2pay.vn).')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sanitizedEmail }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Không thể gửi liên kết đăng nhập. Vui lòng thử lại.')
      }

      setIsLinkSent(true)
      setResendCountdown(60)
    } catch (err) {
      console.error('Failed to send magic link:', err)
      const rawMsg = err instanceof Error ? err.message : ''
      if (rawMsg.toLowerCase().includes('rate limit')) {
        setError('Đã vượt quá giới hạn gửi email đăng nhập trong thời gian ngắn (Rate limit). Vui lòng đợi từ vài phút đến 1 giờ trước khi thử lại, hoặc liên hệ Admin.')
      } else {
        setError(rawMsg || 'Không thể gửi liên kết đăng nhập. Vui lòng thử lại.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="entry-shell relative overflow-hidden">
      {/* Liquid Glass Background Blobs */}
      <div className="liquid-bg-container" aria-hidden="true">
        <div className="liquid-blob liquid-blob-primary" />
        <div className="liquid-blob liquid-blob-partner" />
        <div className="liquid-blob liquid-blob-warning" />
      </div>

      <section className="entry-context z-10 bg-[#121417]/80 backdrop-blur-2xl border-r border-[#3a444e]/30 shadow-2xl" aria-label="Giới thiệu ứng dụng">
        <div className="entry-brand-row">
          <PayPayLogo className="h-14 w-auto" width={178} height={56} />
          <span className="entry-product-name tracking-wider uppercase text-xs opacity-80">Live Interpreter</span>
        </div>

        <div className="entry-intro">
          <p className="eyebrow text-primary font-bold tracking-widest text-xs">Phiên dịch hội thoại trực tiếp</p>
          <h1 className="text-white font-semibold leading-tight tracking-tight">Phiên dịch hội thoại song ngữ tức thì.</h1>
        </div>

        <div className="entry-proof opacity-90" aria-label="Khả năng chính">
          <div className="flex items-center gap-3 text-sm text-gray-300"><Languages className="text-primary w-5 h-5" aria-hidden="true" /><span>Dịch hai chiều theo thời gian thực</span></div>
          <div className="flex items-center gap-3 text-sm text-gray-300"><LockKeyhole className="text-primary w-5 h-5" aria-hidden="true" /><span>Không lưu âm thanh gốc</span></div>
          <div className="flex items-center gap-3 text-sm text-gray-300"><Check className="text-primary w-5 h-5" aria-hidden="true" /><span>Lưu transcript cục bộ khi mất mạng</span></div>
        </div>
      </section>

      <section className="entry-action relative z-10 flex flex-col justify-between min-h-dvh">
        <div className="entry-action-top flex items-center justify-between sm:justify-end gap-4 w-full">
          <span className="entry-mobile-brand font-bold text-lg text-primary tracking-tight block sm:hidden">Pay2Pay Interpreter</span>
          <div className="theme-switch glass-button-modern rounded-lg p-1" aria-label="Giao diện">
            <button
              type="button"
              className={`p-2 rounded-md transition-all ${theme === 'dark' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-foreground'}`}
              onClick={() => changeTheme('dark')}
              aria-label="Dùng giao diện tối"
              title="Giao diện tối"
            >
              <Moon className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`p-2 rounded-md transition-all ${theme === 'light' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-foreground'}`}
              onClick={() => changeTheme('light')}
              aria-label="Dùng giao diện sáng"
              title="Giao diện sáng"
            >
              <Sun className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="entry-form-wrap glass-panel-modern squircle-3xl p-8 sm:p-10 shadow-2xl border border-white/10 dark:border-white/5 relative z-10 max-w-[480px] w-full mx-auto my-auto transition-all">
          <div className="entry-heading">
            <h2 className="text-2xl font-bold tracking-tight">Bắt đầu phiên dịch</h2>
            <p className="text-text-muted text-sm mt-2">Vui lòng xác thực bằng tài khoản email công ty để truy cập ứng dụng.</p>
          </div>

          <div style={{ marginTop: '30px' }}>
            {error && (
              <p className="field-error text-danger text-sm flex items-center gap-2 mb-4 bg-danger/10 p-3 rounded-lg border border-danger/25" role="alert">
                <AlertCircle className="w-4 h-4" aria-hidden="true" />{error}
              </p>
            )}

            {!isLinkSent ? (
              <form onSubmit={handleSendLink} className="entry-form space-y-4" noValidate>
                <div className="field-group">
                  <label htmlFor="email" className="block text-sm font-semibold mb-2">Email công ty</label>
                  <div className="input-with-icon relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" aria-hidden="true" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value)
                        setError(null)
                      }}
                      placeholder="Ví dụ: nguyenvan-a@pay2pay.vn"
                      autoComplete="email"
                      disabled={isLoading}
                      aria-invalid={Boolean(error)}
                      autoFocus
                      className="w-full h-[52px] pl-12 pr-4 rounded-xl border border-border-strong bg-surface/50 backdrop-blur-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="primary-command glass-button-modern squircle-xl w-full h-[52px] font-bold text-sm tracking-wide bg-primary hover:bg-primary-hover text-white transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30 flex items-center justify-center gap-2 active:scale-[0.98]"
                  disabled={isLoading || !email.trim()}
                >
                  {isLoading ? (
                    <Loader2 className="animate-spin w-4 h-4" aria-hidden="true" />
                  ) : null}
                  <span>{isLoading ? 'Đang gửi liên kết...' : 'Gửi liên kết đăng nhập'}</span>
                </button>
              </form>
            ) : (
              <div className="entry-form text-left">
                <div className="field-group mb-6">
                  <div className="flex gap-4 items-start bg-primary/10 dark:bg-primary/20 p-5 rounded-xl border border-primary/20 backdrop-blur-sm">
                    <Mail className="text-primary w-6 h-6 flex-shrink-0 mt-1" aria-hidden="true" />
                    <div>
                      <h4 className="font-semibold text-base text-foreground">Đã gửi link đăng nhập</h4>
                      <p className="text-sm text-text-muted mt-2 leading-relaxed">
                        Chúng tôi đã gửi một liên kết đăng nhập đến email <strong className="text-foreground">{email}</strong>. Vui lòng mở hộp thư Outlook và click vào liên kết để đăng nhập.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLinkSent(false)
                      setError(null)
                    }}
                    disabled={isLoading}
                    className="text-primary hover:text-primary-hover font-semibold transition-all hover:underline"
                  >
                    Thay đổi email
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendLink()}
                    disabled={isLoading || resendCountdown > 0}
                    className={`font-semibold transition-all ${resendCountdown > 0 ? 'text-text-soft cursor-not-allowed' : 'text-primary hover:text-primary-hover hover:underline'}`}
                  >
                    {resendCountdown > 0 ? `Gửi lại sau (${resendCountdown}s)` : 'Gửi lại email'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="entry-footnote flex justify-between items-center border-t border-border/40 mt-8 pt-4 text-xs text-text-soft">
            <span>v3.2.0</span>
            <Link href="/kulam" className="hover:text-primary transition-colors font-medium">Quản trị</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
