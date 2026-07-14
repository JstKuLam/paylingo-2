'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  Check,
  Languages,
  Loader2,
  LockKeyhole,
  Moon,
  Sun,
  UserRound,
} from 'lucide-react'
import PayPayLogo from '@/components/PayPayLogo'
import { useTheme } from '@/hooks/useTheme'
import { createClient } from '@/lib/supabase/client'

const USERNAME_PATTERN = /^[\p{L}\p{N}_ ]+$/u

export default function Home() {
  const router = useRouter()
  const { theme, changeTheme } = useTheme()
  const [username, setUsername] = useState('')
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
      if (session?.user?.user_metadata?.username) router.replace('/session')
    }
    void checkUser()
  }, [router])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedUsername = username.trim().replace(/\s+/g, ' ').toLowerCase()

    if (normalizedUsername.length < 2) {
      setError('Tên hiển thị cần ít nhất 2 ký tự.')
      return
    }
    if (normalizedUsername.length > 40) {
      setError('Tên hiển thị không được dài quá 40 ký tự.')
      return
    }
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setError('Chỉ dùng chữ, số, dấu cách hoặc dấu gạch dưới.')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInAnonymously({
        options: { data: { username: normalizedUsername } },
      })

      if (authError) {
        setError('Chưa thể tạo phiên truy cập. Vui lòng thử lại.')
        return
      }
      router.push('/session')
    } catch (caughtError) {
      console.error('Anonymous sign-in failed:', caughtError)
      setError('Mất kết nối tới máy chủ. Vui lòng thử lại.')
    } finally {
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
            <span className="step-label">Bước 1 / 2</span>
            <h2>Bắt đầu phiên dịch</h2>
            <p>Nhập tên để nhận biết lịch sử hội thoại trên thiết bị này.</p>
          </div>

          <form onSubmit={handleSubmit} className="entry-form" noValidate>
            <div className="field-group">
              <label htmlFor="username">Tên hoặc biệt danh</label>
              <div className="input-with-icon">
                <UserRound aria-hidden="true" />
                <input
                  id="username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value)
                    setError(null)
                  }}
                  placeholder="Ví dụ: Minh Anh"
                  autoComplete="nickname"
                  maxLength={40}
                  disabled={isLoading}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'username-error' : 'username-help'}
                  autoFocus
                />
              </div>
              {error ? (
                <p id="username-error" className="field-error" role="alert">
                  <AlertCircle aria-hidden="true" />{error}
                </p>
              ) : (
                <p id="username-help" className="field-help">Không cần email hoặc mật khẩu.</p>
              )}
            </div>

            <button type="submit" className="primary-command" disabled={isLoading || username.trim().length < 2}>
              {isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              <span>{isLoading ? 'Đang chuẩn bị...' : 'Tiếp tục chọn ngôn ngữ'}</span>
            </button>
          </form>

          <div className="entry-footnote">
            <span>v3.0.3</span>
            <Link href="/admin">Quản trị</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
