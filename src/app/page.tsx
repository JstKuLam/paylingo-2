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
  Moon,
  Sun,
} from 'lucide-react'
import PayPayLogo from '@/components/PayPayLogo'
import { useTheme } from '@/hooks/useTheme'
import { createClient } from '@/lib/supabase/client'

const MicrosoftIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 21 21" width="21" height="21" {...props}>
    <rect x="0" y="0" width="9.8" height="9.8" fill="#f25022" />
    <rect x="11.2" y="0" width="9.8" height="9.8" fill="#7fba00" />
    <rect x="0" y="11.2" width="9.8" height="9.8" fill="#00a4ef" />
    <rect x="11.2" y="11.2" width="9.8" height="9.8" fill="#ffb900" />
  </svg>
)

export default function Home() {
  const router = useRouter()
  const { theme, changeTheme } = useTheme()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

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
        const email = session.user.email
        const isAzure = session.user.app_metadata?.provider === 'azure' ||
                        session.user.identities?.some(id => id.provider === 'azure')
        if (isAzure) {
          const isAllowedDomain = email?.toLowerCase().endsWith('@pay2pay.vn') || process.env.NODE_ENV === 'development'
          if (!isAllowedDomain) {
            await supabase.auth.signOut()
            setError('Đăng nhập thất bại. Chỉ chấp nhận tài khoản email công ty (@pay2pay.vn).')
            return
          }
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
          setError('Đăng nhập SSO thất bại. Vui lòng thử lại.')
        } else if (errParam === 'unauthorized') {
          setError('Bạn chưa được cấp quyền truy cập. Vui lòng đăng nhập qua Microsoft SSO.')
        }
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [router])

  const handleSSOLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          scopes: 'email openid profile',
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (authError) {
        setError('Không thể khởi động đăng nhập SSO: ' + authError.message)
        setIsLoading(false)
      }
    } catch (caughtError) {
      console.error('SSO sign-in failed:', caughtError)
      setError('Mất kết nối tới máy chủ SSO. Vui lòng thử lại.')
      setIsLoading(false)
    }
  }

  return (
    <main className="entry-shell">
      <section className="entry-context" aria-label="Giới thiệu ứng dụng">
        <div className="entry-brand-row">
          <PayPayLogo className="h-10 w-auto" width={118} height={45} />
          <span className="entry-product-name">Live Interpreter</span>
        </div>

        <div className="entry-intro">
          <p className="eyebrow">Phiên dịch hội thoại trực tiếp</p>
          <h1>Hai người. Hai ngôn ngữ. Một cuộc trò chuyện liền mạch.</h1>
          <p>
            Đặt thiết bị giữa bàn, chọn ngôn ngữ của đối tác và bắt đầu nói. Mỗi phía chỉ nhìn thấy
            phần nội dung dành cho mình.
          </p>
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
            <p>Vui lòng đăng nhập bằng tài khoản email công ty để truy cập ứng dụng.</p>
          </div>

          <div style={{ marginTop: '36px' }}>
            {error && (
              <p className="field-error" role="alert" style={{ marginBottom: '20px' }}>
                <AlertCircle aria-hidden="true" />{error}
              </p>
            )}

            <button
              type="button"
              onClick={handleSSOLogin}
              className="primary-command"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <MicrosoftIcon aria-hidden="true" style={{ marginRight: '8px' }} />
              )}
              <span>Đăng nhập với Microsoft SSO</span>
            </button>
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
