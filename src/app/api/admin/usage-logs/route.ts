import { NextResponse } from 'next/server'
import { getD1 } from '@/lib/d1-client'
import { checkAdminSession } from '@/lib/admin-auth'

export const runtime = 'edge'


export async function GET() {
  try {
    const isAuthorized = await checkAdminSession()
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const db = getD1()
    const logs = await db.prepare('SELECT * FROM usage_logs ORDER BY created_at DESC LIMIT 200').all()

    return NextResponse.json(logs.results || [], {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (error: unknown) {
    console.error('Unable to load AI usage logs:', error)
    return NextResponse.json(
      { error: 'Lỗi hệ thống' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    )
  }
}
