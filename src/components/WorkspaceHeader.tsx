'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { History, MessageSquare, Mic2, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { useLanguage } from '@/hooks/useLanguage'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import ProfileMenu from '@/components/ProfileMenu'

export default function WorkspaceHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  routeBadge?: string
  actions?: ReactNode
}) {
  const pathname = usePathname()
  const { theme, changeTheme } = useTheme()
  const { t } = useLanguage()

  return (
    <header className="scr-top">
      <div className="scr-top__left">
        <Link href="/session" className="brand" aria-label="Về bàn phiên dịch">
          <div className="brand__mark" aria-hidden="true">
            <MessageSquare className="i" />
          </div>
          <span className="brand__name">PayLingo</span>
        </Link>
        <span className="scr-hide-sm" title={subtitle || title}>
          <strong>{title}</strong>
        </span>
      </div>

      <div className="scr-top__right">
        <nav className="seg" aria-label="Main Navigation">
          <Link
            href="/session"
            className={`seg__btn ${pathname === '/session' ? 'is-active' : ''}`}
            aria-current={pathname === '/session' ? 'page' : undefined}
          >
            <Mic2 className="i" aria-hidden="true" />
            <span className="seg__label scr-hide-sm">{t.navSession}</span>
          </Link>
          <Link
            href="/history"
            className={`seg__btn ${pathname.startsWith('/history') ? 'is-active' : ''}`}
            aria-current={pathname.startsWith('/history') ? 'page' : undefined}
          >
            <History className="i" aria-hidden="true" />
            <span className="seg__label scr-hide-sm">{t.navHistory}</span>
          </Link>
        </nav>

        {actions}
        <LanguageSwitcher />
        <button
          type="button"
          className="btn btn--icon scr-hide-mobile"
          onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? t.themeLight : t.themeDark}
          title={theme === 'dark' ? t.themeLight : t.themeDark}
        >
          {theme === 'dark' ? <Sun className="i" aria-hidden="true" /> : <Moon className="i" aria-hidden="true" />}
        </button>
        <ProfileMenu />
      </div>
    </header>
  )
}
