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
      const supabase = createClient()
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: sanitizedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        }
      })

      if (otpError) {
        throw otpError
      }

      setIsLinkSent(true)
      setResendCountdown(60)
    } catch (err) {
      console.error('Failed to send magic link:', err)
      setError(err instanceof Error ? err.message : 'Không thể gửi liên kết đăng nhập. Vui lòng thử lại.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="entry-shell">
      <section className="entry-context" aria-label="Giới thiệu ứng dụng">
        <div className="entry-brand-row">
          <PayPayLogo className="h-14 w-auto" width={178} height={56} />
          <span className="entry-product-name">Live Interpreter</span>
        </div>

        <div className="entry-intro">
          <p className="eyebrow">Phiên dịch hội thoại trực tiếp</p>
          <h1>Phiên dịch hội thoại song ngữ tức thì.</h1>
        </div>

        <div className="entry-proof" aria-label="Khả năng chính">
          <div><Languages aria-hidden="true" /><span>Dịch hai chiều theo thời gian thực</span></div>
          <div><LockKeyhole aria-hidden="true" /><span>Không lưu âm thanh gốc</span></div>
          <div><Check aria-hidden="true" /><span>Lưu transcript cục bộ khi mất mạng</span></div>
        </div>
      </section>

      <section className="entry-action">
        <div className="entry-action-top">
          <span className="entry-mobile-brand">Pay2Pay Live Interpreter</span>
          <div className="theme-switch" aria-label="Giao diện">
            <button
              type="button"
              className={theme === 'dark' ? 'is-active' : ''}
              onClick={() => changeTheme('dark')}
              aria-label="Dùng giao diện tối"
              title="Giao diện tối"
            >
              <Moon aria-hidden="true" />
            </button>
            <button
              type="button"
              className={theme === 'light' ? 'is-active' : ''}
              onClick={() => changeTheme('light')}
              aria-label="Dùng giao diện sáng"
              title="Giao diện sáng"
            >
              <Sun aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="entry-form-wrap">
          <div className="entry-heading">
            <h2>Bắt đầu phiên dịch</h2>
            <p>Vui lòng xác thực bằng tài khoản email công ty để truy cập ứng dụng.</p>
          </div>

          <div style={{ marginTop: '36px' }}>
            {error && (
              <p className="field-error" role="alert" style={{ marginBottom: '20px' }}>
                <AlertCircle aria-hidden="true" />{error}
              </p>
            )}

            {!isLinkSent ? (
              <form onSubmit={handleSendLink} className="entry-form" noValidate>
                <div className="field-group">
                  <label htmlFor="email">Email công ty</label>
                  <div className="input-with-icon">
                    <Mail aria-hidden="true" />
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
                    />
                  </div>
                </div>

                <button type="submit" className="primary-command" disabled={isLoading || !email.trim()}>
                  {isLoading ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : null}
                  <span>{isLoading ? 'Đang gửi liên kết...' : 'Gửi liên kết đăng nhập'}</span>
                </button>
              </form>
            ) : (
              <div className="entry-form" style={{ textAlign: 'left' }}>
                <div className="field-group" style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', background: 'rgba(59, 130, 246, 0.1)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <Mail aria-hidden="true" style={{ color: 'var(--color-primary-text)', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--color-primary-text)' }}>Đã gửi link đăng nhập</h4>
                      <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: 'var(--color-secondary-text)', lineHeight: '1.5' }}>
                        Chúng tôi đã gửi một liên kết đăng nhập đến email <strong>{email}</strong>. Vui lòng mở hộp thư Outlook và click vào liên kết để đăng nhập.
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '16px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLinkSent(false)
                      setError(null)
                    }}
                    disabled={isLoading}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary-text)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  >
                    Thay đổi email
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendLink()}
                    disabled={isLoading || resendCountdown > 0}
                    style={{ background: 'none', border: 'none', color: resendCountdown > 0 ? 'var(--color-muted)' : 'var(--color-primary-text)', cursor: 'pointer', textDecoration: resendCountdown > 0 ? 'none' : 'underline', padding: 0 }}
                  >
                    {resendCountdown > 0 ? `Gửi lại sau (${resendCountdown}s)` : 'Gửi lại email'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="entry-footnote">
            <span>v3.1.1</span>
            <Link href="/kulam">Quản trị</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
