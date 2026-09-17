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
    const sessionId = searchParams.get('id')
    const db = getD1()

    if (sessionId) {
      const entries = await db.prepare('SELECT * FROM transcript_entries WHERE session_id = ? ORDER BY start_ms ASC')
        .bind(sessionId)
        .all()
      return NextResponse.json({ entries: entries.results || [] }, {
        headers: noStoreHeader,
      })
    }

    const sessions = await db.prepare(`
      SELECT s.*, 
        (SELECT count(*) FROM transcript_entries t WHERE t.session_id = s.id) as transcript_count
      FROM sessions s
      ORDER BY s.started_at DESC
      LIMIT 500
    `).all<Record<string, unknown>>()

    const formatted = (sessions.results || []).map((s: Record<string, unknown>) => ({
      ...s,
      transcript_entries: [{ count: Number(s.transcript_count || 0) }]
    }))

    return NextResponse.json(formatted, {
      headers: noStoreHeader,
    })
  } catch (error: unknown) {
    console.error('Unable to load admin sessions:', error)
    return NextResponse.json(
      { error: 'Lỗi hệ thống' },
      {
        status: 500,
        headers: noStoreHeader,
      }
    )
  }
}

export async function DELETE(request: Request) {
  const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }
  try {
    const isAuthorized = await checkAdminSession()
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403, headers: noStoreHeader })
    }

    const { id } = await request.json()
    if (!id || typeof id !== 'string' || id.length > 64) {
      return NextResponse.json({ error: 'Thiếu hoặc ID phiên không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }

    const db = getD1()
    await db.batch([
      db.prepare('DELETE FROM transcript_entries WHERE session_id = ?').bind(id),
      db.prepare('DELETE FROM session_summaries WHERE session_id = ?').bind(id),
      db.prepare('DELETE FROM shared_summaries WHERE session_id = ?').bind(id),
      db.prepare('DELETE FROM sessions WHERE id = ?').bind(id),
    ])

    return NextResponse.json({ success: true }, {
      headers: noStoreHeader,
    })
  } catch (error: unknown) {
    console.error('Unable to delete admin session:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500, headers: noStoreHeader })
  }
}
