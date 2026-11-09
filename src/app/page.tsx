'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Loader2,
  MessageSquare,
  Moon,
  Sun,
} from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { useLanguage } from '@/hooks/useLanguage'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { authClient } from '@/lib/auth-client'

export default function Home() {
  const router = useRouter()
  const { theme, changeTheme } = useTheme()
  const { language, t } = useLanguage()
  const [error, setError] = useState<string | null>(null)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const errCode = params.get('error')
    if (!errCode) return

    let msg: string | null = null
    if (errCode === 'google_not_configured') {
      msg =
        language === 'en'
          ? 'Google SSO is not configured yet. Please add GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in Admin Settings (/kulam).'
          : language === 'zh'
            ? '尚未配置 Google SSO。请在管理后台 (/kulam) 中配置 GOOGLE_CLIENT_ID 与 GOOGLE_CLIENT_SECRET。'
            : 'Chưa cấu hình Google SSO (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Vui lòng cấu hình trong trang Quản trị (/kulam).'
    } else if (errCode === 'google_cancelled') {
      msg =
        language === 'en'
          ? 'Google sign-in was cancelled.'
          : language === 'zh'
            ? '已取消 Google 登录。'
            : 'Đã hủy đăng nhập bằng Google.'
    } else if (errCode === 'google_auth_failed') {
      msg =
        language === 'en'
          ? 'Google authentication failed. Please try again.'
          : language === 'zh'
            ? 'Google 身份验证失败，请重试。'
            : 'Xác thực Google không thành công. Vui lòng thử lại.'
    }
    if (msg) {
      window.history.replaceState({}, '', window.location.pathname)
      const timer = window.setTimeout(() => {
        setError(msg)
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [language])

  useEffect(() => {
    const checkUser = async () => {
      try {
        const {
          data: { user },
        } = await authClient.getUser()
        if (user) {
          router.replace('/session')
        }
      } catch (err) {
        console.error('Error checking user session:', err)
      }
    }
    void checkUser()
  }, [router])

  const handleGoogleAuth = () => {
    setError(null)
    setIsGoogleLoading(true)
    try {
      authClient.signInWithGoogle({
        mode: 'signin',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGeneric)
      setIsGoogleLoading(false)
    }
  }

  const googleBtnLabel =
    language === 'en'
      ? 'Sign in with Google'
      : language === 'zh'
        ? '使用 Google 登录'
        : 'Đăng nhập bằng Google'
  const subtitleText =
    language === 'en'
      ? 'Sign in with your Google (Gmail) account to open the interpreter workspace.'
      : language === 'zh'
        ? '使用 Google (Gmail) 账号登录以进入同传工作区。'
        : 'Đăng nhập bằng tài khoản Google (Gmail) để vào bàn phiên dịch.'

  return (
    <main className="scr-view">
      <header className="scr-top">
        <div className="scr-top__left">
          <div className="brand">
            <div className="brand__mark" aria-hidden="true">
              <MessageSquare className="i" />
            </div>
            <span className="brand__name">PayLingo</span>
          </div>
        </div>

        <div className="scr-top__right">
          <LanguageSwitcher />
          <button
            type="button"
            className="btn btn--icon"
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
        </div>
      </header>

      <div className="scr-body">
        <section className="gate-card" aria-label={t.formTitle}>
          <div className="gate-icon">
            <MessageSquare className="i" aria-hidden="true" />
          </div>
          <h2>{t.formTitle}</h2>
          <p>{subtitleText}</p>

          {error && (
            <div className="field-error" role="alert">
              <AlertCircle aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            className="btn-google"
            onClick={handleGoogleAuth}
            disabled={isGoogleLoading}
          >
            {isGoogleLoading ? (
              <Loader2 className="i animate-spin" aria-hidden="true" />
            ) : (
              <svg
                className="btn-google__icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  className="google-fill-blue"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  className="google-fill-green"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  className="google-fill-yellow"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  className="google-fill-red"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            <span>{googleBtnLabel}</span>
          </button>
        </section>
      </div>
    </main>
  )
}
