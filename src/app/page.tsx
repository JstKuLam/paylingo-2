'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Check,
  KeyRound,
  Languages,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export default function Home() {
  const router = useRouter()
  const { theme, changeTheme } = useTheme()
  const { language, t } = useLanguage()
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
    const urlError =
      errParam === 'invalid_or_expired_token' || errParam === 'invalid_token'
        ? t.errorExpiredToken
        : errParam === 'domain_restricted' || errParam === 'unauthorized'
          ? t.errorAccessDenied
          : errParam
            ? t.errorGeneric
            : null

    if (urlError) {
      const timer = window.setTimeout(() => setError(urlError), 0)
      return () => window.clearTimeout(timer)
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
    <main className="entry-shell">
      {/* Liquid Glass Background Blobs */}
      <div className="liquid-bg-container" aria-hidden="true">
        <div className="liquid-blob liquid-blob-primary" />
        <div className="liquid-blob liquid-blob-partner" />
        <div className="liquid-blob liquid-blob-warning" />
      </div>

      <section className="entry-context" aria-label={t.appTagline}>
        <div className="entry-brand-row">
          <PayPayLogo width={178} height={56} />
          <span className="entry-product-name">{t.appTagline}</span>
        </div>

        <div className="entry-intro">
          <p className="eyebrow">{t.heroEyebrow}</p>
          <h1>{t.heroTitle}</h1>
        </div>

        <div className="entry-proof" aria-label={t.heroEyebrow}>
          <div><Languages aria-hidden="true" /><span>{t.featureRealtime}</span></div>
          <div><LockKeyhole aria-hidden="true" /><span>{t.featureNoAudio}</span></div>
          <div><Check aria-hidden="true" /><span>{t.featureLocalBackup}</span></div>
        </div>
      </section>

      <section className="entry-action" aria-label={t.formTitle}>
        <div className="entry-action-top">
          <span className="entry-mobile-brand">{t.appName}</span>

          <div className="entry-preferences">
            <LanguageSwitcher size="touch" />
            <ToggleGroup
              variant="outline"
              size="touch"
              spacing={0}
              value={[theme]}
              onValueChange={(values) => {
                const nextTheme = values[0]
                if (nextTheme === 'dark' || nextTheme === 'light') changeTheme(nextTheme)
              }}
              aria-label={`${t.themeDark} / ${t.themeLight}`}
            >
              <ToggleGroupItem value="dark" aria-label={t.themeDark} title={t.themeDark}>
                <Moon aria-hidden="true" />
              </ToggleGroupItem>
              <ToggleGroupItem value="light" aria-label={t.themeLight} title={t.themeLight}>
                <Sun aria-hidden="true" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="entry-form-wrap">
          <Card>
            <CardHeader>
              <CardTitle>{t.formTitle}</CardTitle>
              <CardDescription>{t.formSubtitle}</CardDescription>
            </CardHeader>

            <CardContent>
              <div className="flex flex-col gap-5">
            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!isLinkSent ? (
              <form onSubmit={handleSendLink} noValidate>
                <FieldGroup>
                  <Field data-invalid={Boolean(error)} data-disabled={isLoading}>
                    <FieldLabel htmlFor="email">{t.emailLabel}</FieldLabel>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      density="comfortable"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value)
                        setError(null)
                      }}
                      placeholder={t.emailPlaceholder}
                      autoComplete="email"
                      spellCheck={false}
                      disabled={isLoading}
                      aria-invalid={Boolean(error)}
                    />
                  </Field>

                  <Button type="submit" size="touch" className="w-full" disabled={isLoading || !email.trim()}>
                    {isLoading ? <Spinner data-icon="inline-start" /> : null}
                    {isLoading ? t.gettingOtpBtn : t.getOtpBtn}
                  </Button>
                </FieldGroup>
              </form>
            ) : (
              <div className="flex flex-col gap-5">
                <Alert>
                  <Mail aria-hidden="true" />
                  <AlertTitle>{t.otpSentTitle}</AlertTitle>
                  <AlertDescription>{t.otpSentDesc.replace('{email}', email)}</AlertDescription>
                </Alert>

                <form onSubmit={handleVerifyOtp}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="otp"><KeyRound aria-hidden="true" />{t.otpInputLabel}</FieldLabel>
                      <Input
                        id="otp"
                        name="otp"
                        type="text"
                        density="comfortable"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otpCode}
                        onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ''))}
                        placeholder={t.otpPlaceholder}
                      />
                    </Field>

                    <Button type="submit" size="touch" className="w-full" disabled={isVerifyingOtp || otpCode.trim().length !== 6}>
                      {isVerifyingOtp ? <Spinner data-icon="inline-start" /> : null}
                      {isVerifyingOtp ? t.verifyingBtn : t.verifyBtn}
                    </Button>
                  </FieldGroup>
                </form>

                <div className="flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => {
                      setIsLinkSent(false)
                      setError(null)
                    }}
                    disabled={isLoading}
                  >
                    {t.changeEmailBtn}
                  </Button>

                  <Button
                    type="button"
                    variant="link"
                    onClick={() => handleSendLink()}
                    disabled={isLoading || resendCountdown > 0}
                  >
                    {resendCountdown > 0 ? t.resendCountdown.replace('{seconds}', String(resendCountdown)) : t.resendOtpBtn}
                  </Button>
                </div>
              </div>
            )}
              </div>
            </CardContent>

            <CardFooter>
              <div className="flex w-full items-center justify-between">
                <span>v3.3.0</span>
                <Link href="/kulam">{t.adminLink}</Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      </section>
    </main>
  )
}
