'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Check,
  KeyRound,
  Languages,
  Loader2,
  LockKeyhole,
  Mail,
  Moon,
  Sun,
} from 'lucide-react'
import PayPayLogo from '@/components/PayPayLogo'
import { useTheme } from '@/hooks/useTheme'
import { useLanguage } from '@/hooks/useLanguage'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { authClient } from '@/lib/auth-client'
import { isAllowedEmail } from '@/lib/auth-utils'

export default function Home() {
  const router = useRouter()
  const { theme, changeTheme } = useTheme()
  const { language, changeLanguage, t } = useLanguage()
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [isLinkSent, setIsLinkSent] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown(prev => prev - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [resendCountdown])

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await authClient.getUser()
        if (user) {
          const userEmail = user.email
          if (!isAllowedEmail(userEmail)) {
            await authClient.signOut()
            setError(t.errorInvalidEmail)
            return
          }
          setError(null)
          router.replace('/session')
        }
      } catch (err) {
        console.error('Error checking user session:', err)
      }
    }
    void checkUser()

    const errParam = new URLSearchParams(window.location.search).get('error')
    if (errParam) {
      if (errParam === 'invalid_or_expired_token' || errParam === 'invalid_token') {
        setError(t.errorExpiredToken)
      } else if (errParam === 'domain_restricted' || errParam === 'unauthorized') {
        setError(t.errorAccessDenied)
      } else {
        setError(t.errorGeneric)
      }
    }
  }, [router, t])

  const handleSendLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!email) return

    const sanitizedEmail = email.trim().toLowerCase()
    const isAllowed = isAllowedEmail(sanitizedEmail)
    if (!isAllowed) {
      setError(t.errorInvalidEmail)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { error: sendErr } = await authClient.signInWithOtp({
        email: sanitizedEmail,
        lang: language,
      })
      if (sendErr) {
        throw sendErr
      }

      setIsLinkSent(true)
      setResendCountdown(60)
    } catch (err) {
      console.error('Failed to send OTP code:', err)
      const rawMsg = err instanceof Error ? err.message : ''
      if (rawMsg.toLowerCase().includes('rate limit') || rawMsg.toLowerCase().includes('seconds')) {
        setError(t.errorRateLimit)
      } else {
        setError(rawMsg || t.errorSendOtp)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otpCode.trim()) return

    setIsVerifyingOtp(true)
    setError(null)

    try {
      const { data, error: verifyErr } = await authClient.verifyOtp({ token: otpCode.trim() })
      if (verifyErr || !data.user) {
        throw verifyErr || new Error(t.errorInvalidOtp)
      }

      router.replace('/session')
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorInvalidOtp)
    } finally {
      setIsVerifyingOtp(false)
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
          <span className="entry-product-name tracking-wider uppercase text-xs opacity-80">{t.appTagline}</span>
        </div>

        <div className="entry-intro">
          <p className="eyebrow text-primary font-bold tracking-widest text-xs">{t.heroEyebrow}</p>
          <h1 className="text-white font-semibold leading-tight tracking-tight">{t.heroTitle}</h1>
        </div>

        <div className="entry-proof opacity-90" aria-label="Khả năng chính">
          <div className="flex items-center gap-3 text-sm text-gray-300"><Languages className="text-primary w-5 h-5" aria-hidden="true" /><span>{t.featureRealtime}</span></div>
          <div className="flex items-center gap-3 text-sm text-gray-300"><LockKeyhole className="text-primary w-5 h-5" aria-hidden="true" /><span>{t.featureNoAudio}</span></div>
          <div className="flex items-center gap-3 text-sm text-gray-300"><Check className="text-primary w-5 h-5" aria-hidden="true" /><span>{t.featureLocalBackup}</span></div>
        </div>
      </section>

      <section className="entry-action relative z-10 flex flex-col justify-between min-h-dvh">
        <div className="entry-action-top flex items-center justify-between sm:justify-end gap-3 w-full">
          <span className="entry-mobile-brand font-bold text-lg text-primary tracking-tight block sm:hidden">{t.appName}</span>
          
          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <LanguageSwitcher />

            {/* Theme switcher */}
            <div className="theme-switch glass-button-modern rounded-lg p-1" aria-label="Giao diện">
              <button
                type="button"
                className={`p-2 rounded-md transition-all ${theme === 'dark' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-foreground'}`}
                onClick={() => changeTheme('dark')}
                aria-label={t.themeDark}
                title={t.themeDark}
              >
                <Moon className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`p-2 rounded-md transition-all ${theme === 'light' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-foreground'}`}
                onClick={() => changeTheme('light')}
                aria-label={t.themeLight}
                title={t.themeLight}
              >
                <Sun className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="entry-form-wrap glass-panel-modern squircle-3xl p-8 sm:p-10 shadow-2xl border border-white/10 dark:border-white/5 relative z-10 max-w-[480px] w-full mx-auto my-auto transition-all">
          <div className="entry-heading">
            <h2 className="text-2xl font-bold tracking-tight">{t.formTitle}</h2>
            <p className="text-text-muted text-sm mt-2">{t.formSubtitle}</p>
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
                  <label htmlFor="email" className="block text-sm font-semibold mb-2">{t.emailLabel}</label>
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
                      placeholder={t.emailPlaceholder}
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
                  className="primary-command glass-button-modern squircle-xl w-full h-[52px] font-bold text-sm tracking-wide bg-primary hover:bg-primary-hover text-white transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  disabled={isLoading || !email.trim()}
                >
                  {isLoading ? (
                    <Loader2 className="animate-spin w-4 h-4" aria-hidden="true" />
                  ) : null}
                  <span>{isLoading ? t.gettingOtpBtn : t.getOtpBtn}</span>
                </button>
              </form>
            ) : (
              <div className="entry-form text-left space-y-4">
                <div className="field-group">
                  <div className="flex gap-4 items-start bg-primary/10 dark:bg-primary/20 p-5 rounded-xl border border-primary/20 backdrop-blur-sm">
                    <Mail className="text-primary w-6 h-6 flex-shrink-0 mt-1" aria-hidden="true" />
                    <div>
                      <h4 className="font-semibold text-base text-foreground">{t.otpSentTitle}</h4>
                      <p className="text-sm text-text-muted mt-2 leading-relaxed">
                        {t.otpSentDesc.replace('{email}', email)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* OTP Input Form */}
                <form onSubmit={handleVerifyOtp} className="space-y-3">
                  <div className="field-group">
                    <label htmlFor="otp" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{t.otpInputLabel}</label>
                    <div className="input-with-icon relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" aria-hidden="true" />
                      <input
                        id="otp"
                        name="otp"
                        type="text"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        placeholder={t.otpPlaceholder}
                        autoFocus
                        className="w-full h-[52px] pl-12 pr-4 rounded-xl border border-border-strong bg-surface/50 backdrop-blur-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-mono text-lg tracking-widest text-center"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isVerifyingOtp || otpCode.trim().length !== 6}
                    className="primary-command glass-button-modern squircle-xl w-full h-[48px] font-bold text-sm tracking-wide bg-primary hover:bg-primary-hover text-white transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isVerifyingOtp ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                    <span>{isVerifyingOtp ? t.verifyingBtn : t.verifyBtn}</span>
                  </button>
                </form>

                <div className="flex justify-between items-center text-sm pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLinkSent(false)
                      setError(null)
                    }}
                    disabled={isLoading}
                    className="text-primary hover:text-primary-hover font-semibold transition-all hover:underline cursor-pointer"
                  >
                    {t.changeEmailBtn}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendLink()}
                    disabled={isLoading || resendCountdown > 0}
                    className={`font-semibold transition-all ${resendCountdown > 0 ? 'text-text-soft cursor-not-allowed' : 'text-primary hover:text-primary-hover hover:underline cursor-pointer'}`}
                  >
                    {resendCountdown > 0 ? t.resendCountdown.replace('{seconds}', String(resendCountdown)) : t.resendOtpBtn}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="entry-footnote flex justify-between items-center border-t border-border/40 mt-8 pt-4 text-xs text-text-soft">
            <span>v3.3.0</span>
            <Link href="/kulam" className="hover:text-primary transition-colors font-medium">{t.adminLink}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
