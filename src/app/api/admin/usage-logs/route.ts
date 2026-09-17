import { NextResponse } from 'next/server'
import { getD1 } from '@/lib/d1-client'
import { checkAdminSession } from '@/lib/admin-auth'

export const runtime = 'edge'


export async function GET(request: Request) {
  const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }
  try {
    const isAuthorized = await checkAdminSession()
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403, headers: noStoreHeader })
    }

    const { searchParams } = new URL(request.url)
    const limitParam = parseInt(searchParams.get('limit') || '200', 10)
    const safeLimit = Math.min(Math.max(1, isNaN(limitParam) ? 200 : limitParam), 500)

    const db = getD1()
    const logs = await db.prepare('SELECT * FROM usage_logs ORDER BY created_at DESC LIMIT ?')
      .bind(safeLimit)
      .all()

    return NextResponse.json(logs.results || [], {
      headers: noStoreHeader,
    })
  } catch (error: unknown) {
    console.error('Unable to load AI usage logs:', error)
    return NextResponse.json(
      { error: 'Lỗi hệ thống' },
      {
        status: 500,
        headers: noStoreHeader,
      }
    )
  }
}
