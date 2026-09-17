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
      if (typeof sessionId !== 'string' || sessionId.length > 64 || !sessionId.trim()) {
        return NextResponse.json({ error: 'ID phiên không hợp lệ' }, { status: 400, headers: noStoreHeader })
      }
      const cleanSessionId = sessionId.trim()
      const entries = await db.prepare('SELECT * FROM transcript_entries WHERE session_id = ? ORDER BY start_ms ASC LIMIT 2000')
        .bind(cleanSessionId)
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

    let id: unknown
    try {
      const body = await request.json()
      id = body?.id
    } catch {
      return NextResponse.json({ error: 'Payload JSON không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }

    if (!id || typeof id !== 'string' || id.length > 64 || !id.trim()) {
      return NextResponse.json({ error: 'Thiếu hoặc ID phiên không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }
    const cleanId = id.trim()

    const db = getD1()
    await db.batch([
      db.prepare('DELETE FROM transcript_entries WHERE session_id = ?').bind(cleanId),
      db.prepare('DELETE FROM session_summaries WHERE session_id = ?').bind(cleanId),
      db.prepare('DELETE FROM shared_summaries WHERE session_id = ?').bind(cleanId),
      db.prepare('DELETE FROM sessions WHERE id = ?').bind(cleanId),
    ])

    return NextResponse.json({ success: true }, {
      headers: noStoreHeader,
    })
  } catch (error: unknown) {
    console.error('Unable to delete admin session:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500, headers: noStoreHeader })
  }
}
