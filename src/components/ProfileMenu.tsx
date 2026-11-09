'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  LogOut,
  User,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useLanguage } from '@/hooks/useLanguage'

function decodeLabel(raw: string): string {
  let out = raw.trim()
  for (let i = 0; i < 3; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(out)) break
    try {
      const next = decodeURIComponent(out)
      if (next === out) break
      out = next
    } catch {
      break
    }
  }
  return out.trim()
}

export default function ProfileMenu({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter()
  const { language, t } = useLanguage()
  const [userLabel, setUserLabel] = useState('Khách')
  const [userEmail, setUserEmail] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let isMounted = true
    const fetchUser = async () => {
      try {
        const res = await authClient.getUser()
        const user = res?.data?.user
        if (user && isMounted) {
          const email = user.email || ''
          const username = decodeLabel(
            user.user_metadata?.username ||
              user.user_metadata?.full_name ||
              user.user_metadata?.name ||
              email.split('@')[0] ||
              'Khách'
          )
          setUserLabel(username)
          setUserEmail(email)
        }
      } catch (err) {
        console.warn('Failed to fetch user in ProfileMenu:', err)
      }
    }
    void fetchUser()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMenuOpen])

  const handleLogout = async () => {
    try {
      await authClient.signOut()
    } catch (err) {
      console.warn('Failed to sign out:', err)
    } finally {
      router.replace('/')
    }
  }

  const avatarInitials = userLabel
    ? userLabel
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('')
    : ''

  return (
    <div className="profile-menu-container" ref={menuRef}>
      <button
        type="button"
        className="user-btn"
        onClick={() => {
          setIsMenuOpen((prev) => !prev)
        }}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-label="Cài đặt người dùng"
      >
        <span className="user-btn__avatar" aria-hidden="true">
          {avatarInitials || <User size={13} />}
          <span className="user-btn__dot" />
        </span>
        <span className="user-btn__name">{userLabel === 'Khách' ? t.profileGuest : userLabel}</span>
        <ChevronDown className="user-btn__chev" aria-hidden="true" />
      </button>

      {isMenuOpen && (
        <div className="user-menu" role="menu" aria-label="Cài đặt người dùng">
          <div className="f-box">
            <span className="f-box__h">
              {language === 'en' ? 'Google Account' : language === 'zh' ? 'Google 账号' : 'Tài khoản Google'}
            </span>
            <strong className="user-btn__name">{userLabel}</strong>
            {userEmail && <span className="pane__sub">{userEmail}</span>}
          </div>

          <div className="menu__sep" />

          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false)
              void handleLogout()
            }}
            className="u-item"
            role="menuitem"
          >
            <LogOut className="i" aria-hidden="true" />
            <span>
              {language === 'en'
                ? 'Sign out'
                : language === 'zh'
                  ? '退出登录'
                  : 'Đăng xuất'}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
