'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, LogOut, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ProfileMenu({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter()
  const [userLabel, setUserLabel] = useState('Khách')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const email = session.user.email
        const username =
          session.user.user_metadata?.username ||
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          email?.split('@')[0] ||
          'Khách'
        setUserLabel(username)
        setUserEmail(email || null)
      }
    }
    void fetchUser()
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
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/')
  }

  return (
    <div className="profile-menu-container" ref={menuRef}>
      <button
        type="button"
        className="profile-trigger"
        onClick={() => setIsMenuOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={isMenuOpen}
        aria-label="Menu tài khoản"
      >
        <div className="profile-avatar">
          {userLabel ? userLabel.charAt(0).toUpperCase() : <User size={14} />}
        </div>
        <span className="profile-username">{userLabel}</span>
        <ChevronDown className={`profile-chevron ${isMenuOpen ? 'is-active' : ''}`} aria-hidden="true" />
      </button>

      {isMenuOpen && (
        <div className="profile-dropdown" role="menu">
          <div className="dropdown-user-info">
            <div className="dropdown-username">{userLabel}</div>
            <div className="dropdown-email">{userEmail || 'Tài khoản khách'}</div>
          </div>
          <div className="dropdown-divider" />
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false)
              void handleLogout()
            }}
            className="dropdown-item logout-item"
            role="menuitem"
          >
            <LogOut aria-hidden="true" />
            <span>Đăng xuất</span>
          </button>
        </div>
      )}
    </div>
  )
}
