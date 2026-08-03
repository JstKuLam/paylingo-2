'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SessionDetailClient } from './history/sessions/[id]/ClientWrapper'
import { FolderDetailClient } from './history/folders/[id]/ClientWrapper'
import { SharedSummaryClient } from './shared/summary/[id]/ClientWrapper'

export default function NotFoundClient() {
  const path = usePathname()
  const routeType = path.startsWith('/history/sessions/')
    ? 'session'
    : path.startsWith('/history/folders/')
      ? 'folder'
      : path.startsWith('/shared/summary/')
        ? 'shared'
        : '404'

  if (routeType === 'session') {
    return <SessionDetailClient params={Promise.resolve({ id: '' })} />
  }

  if (routeType === 'folder') {
    return <FolderDetailClient params={Promise.resolve({ id: '' })} />
  }

  if (routeType === 'shared') {
    return <SharedSummaryClient params={Promise.resolve({ id: '' })} />
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-4 text-center text-slate-200">
      <h1 className="text-4xl font-bold text-slate-100 mb-2">404</h1>
      <p className="text-slate-400 mb-6">Trang bạn tìm kiếm không tồn tại hoặc đã bị di chuyển.</p>
      <Link
        href="/"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
      >
        Trở về trang chủ
      </Link>
    </div>
  )
}
