import { NextResponse } from 'next/server'
import { getD1 } from '@/lib/d1-client'
import { checkAdminSession } from '@/lib/admin-auth'

export const runtime = 'edge'


export async function GET(request: Request) {
  try {
    const isAuthorized = await checkAdminSession()
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('id')
    const db = getD1()

    if (sessionId) {
      const entries = await db.prepare('SELECT * FROM transcript_entries WHERE session_id = ? ORDER BY start_ms ASC')
        .bind(sessionId)
        .all()
      return NextResponse.json({ entries: entries.results || [] })
    }

    const sessions = await db.prepare(`
      SELECT s.*, 
        (SELECT count(*) FROM transcript_entries t WHERE t.session_id = s.id) as transcript_count
      FROM sessions s
      ORDER BY s.started_at DESC
      LIMIT 500
    `).all()

    const formatted = (sessions.results || []).map((s: any) => ({
      ...s,
      transcript_entries: [{ count: Number(s.transcript_count || 0) }]
    }))

    return NextResponse.json(formatted)
  } catch (error: unknown) {
    console.error('Unable to load admin sessions:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const isAuthorized = await checkAdminSession()
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID phiên' }, { status: 400 })
    }

    const db = getD1()
    await db.prepare('DELETE FROM transcript_entries WHERE session_id = ?').bind(id).run()
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run()

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Unable to delete admin session:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}
