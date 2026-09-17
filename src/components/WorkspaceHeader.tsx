'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { History, Mic2, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { useLanguage } from '@/hooks/useLanguage'
import PayPayLogo from '@/components/PayPayLogo'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import ProfileMenu from '@/components/ProfileMenu'

export default function WorkspaceHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  const pathname = usePathname()
  const { theme, changeTheme } = useTheme()
  const { t } = useLanguage()

  return (
    <header className="workspace-header">
      <div className="workspace-brand">
        <Link href="/session" aria-label="Về bàn phiên dịch">
          <PayPayLogo width={102} height={32} />
        </Link>
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>

      <nav className="workspace-nav" aria-label="Main Navigation">
        <Link href="/session" className={pathname === '/session' ? 'is-active' : ''}>
          <Mic2 aria-hidden="true" />
          {t.navSession}
        </Link>
        <Link href="/history" className={pathname.startsWith('/history') ? 'is-active' : ''}>
          <History aria-hidden="true" />
          {t.navHistory}
        </Link>
      </nav>

      <div className="workspace-actions">
        <div className="text-right mr-2 hidden sm:block">
          <p className="text-xs font-bold text-muted-foreground leading-none">v3.2.0</p>
          <p className="text-xs text-muted-foreground/80 mt-0.5 font-medium">17/07/2026 15:20 (GMT+7)</p>
        </div>
        {actions}
        <LanguageSwitcher />
        <button
          type="button"
          onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? t.themeLight : t.themeDark}
          title={theme === 'dark' ? t.themeLight : t.themeDark}
        >
          {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
        <ProfileMenu />
      </div>
    </header>
  )
}
