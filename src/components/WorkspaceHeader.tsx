'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { History, Mic2, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import PayPayLogo from '@/components/PayPayLogo'

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

  return (
    <header className="workspace-header">
      <div className="workspace-brand">
        <Link href="/session" aria-label="Về bàn phiên dịch">
          <PayPayLogo width={76} height={29} />
        </Link>
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>

      <nav className="workspace-nav" aria-label="Điều hướng chính">
        <Link href="/session" className={pathname === '/session' ? 'is-active' : ''}>
          <Mic2 aria-hidden="true" />
          Phiên dịch
        </Link>
        <Link href="/history" className={pathname.startsWith('/history') ? 'is-active' : ''}>
          <History aria-hidden="true" />
          Lịch sử
        </Link>
      </nav>

      <div className="workspace-actions">
        <div className="text-right mr-2 hidden xs:block">
          <p className="text-[10px] font-bold text-slate-400 leading-none">v3.1.1</p>
          <p className="text-[9px] text-slate-500 mt-0.5 font-semibold">14/07/2026 14:13 (GMT+7)</p>
        </div>
        {actions}
        <button
          type="button"
          onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          title={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
        >
          {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
      </div>
    </header>
  )
}
