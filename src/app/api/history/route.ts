import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/session'
import { getD1 } from '@/lib/d1-client'

export const runtime = 'edge'


export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const table = searchParams.get('table') || 'sessions'
    const single = searchParams.get('single') === '1'
    const id = searchParams.get('id')
    const db = getD1()

    if (table === 'folders') {
      if (single && id) {
        const folder = await db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ?')
          .bind(id, user.id)
          .first()
        const sessions = await db.prepare('SELECT * FROM sessions WHERE folder_id = ? AND owner_id = ? ORDER BY started_at DESC')
          .bind(id, user.id)
          .all()
        return NextResponse.json({ item: folder, sessions: sessions.results || [] })
      }

      const res = await db.prepare('SELECT * FROM folders WHERE owner_id = ? ORDER BY created_at DESC')
        .bind(user.id)
        .all()
      return NextResponse.json({ items: res.results || [] })
    }

    if (table === 'sessions') {
      if (single && id) {
        const session = await db.prepare('SELECT * FROM sessions WHERE id = ? AND owner_id = ?')
          .bind(id, user.id)
          .first()
        const entries = await db.prepare('SELECT * FROM transcript_entries WHERE session_id = ? ORDER BY start_ms ASC')
          .bind(id)
          .all()
        return NextResponse.json({ item: session, entries: entries.results || [] })
      }

      const res = await db.prepare('SELECT * FROM sessions WHERE owner_id = ? ORDER BY started_at DESC')
        .bind(user.id)
        .all()
      return NextResponse.json({ items: res.results || [] })
    }

    return NextResponse.json({ items: [] })
  } catch (err: unknown) {
    console.error('Error in history GET API:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi lấy dữ liệu lịch sử' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { table, field, value, payload } = await request.json()
    const db = getD1()

    if (field !== 'id') {
      return NextResponse.json({ success: false, error: 'Trường không hợp lệ' }, { status: 400 })
    }

    if (table === 'sessions' && value && payload) {
      if ('folder_id' in payload) {
        await db.prepare('UPDATE sessions SET folder_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND owner_id = ?')
          .bind(payload.folder_id, value, user.id)
          .run()
      }
      if ('name' in payload) {
        await db.prepare('UPDATE sessions SET name = ?, updated_at = datetime(\'now\') WHERE id = ? AND owner_id = ?')
          .bind(payload.name, value, user.id)
          .run()
      }
      return NextResponse.json({ success: true })
    }

    if (table === 'folders' && value && payload) {
      if ('name' in payload) {
        await db.prepare('UPDATE folders SET name = ?, updated_at = datetime(\'now\') WHERE id = ? AND owner_id = ?')
          .bind(payload.name, value, user.id)
          .run()
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: 'Thao tác không hợp lệ' }, { status: 400 })
  } catch (err: unknown) {
    console.error('Error in history PATCH API:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi cập nhật' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { table, field, value } = await request.json()
    const db = getD1()

    if (table === 'sessions' && field === 'id' && value) {
      await db.prepare('DELETE FROM transcript_entries WHERE session_id = ?').bind(value).run()
      await db.prepare('DELETE FROM sessions WHERE id = ? AND owner_id = ?').bind(value, user.id).run()
      return NextResponse.json({ success: true })
    }

    if (table === 'folders' && field === 'id' && value) {
      await db.prepare('UPDATE sessions SET folder_id = NULL WHERE folder_id = ? AND owner_id = ?').bind(value, user.id).run()
      await db.prepare('DELETE FROM folders WHERE id = ? AND owner_id = ?').bind(value, user.id).run()
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: 'Thao tác không hợp lệ' }, { status: 400 })
  } catch (err: unknown) {
    console.error('Error in history DELETE API:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi xóa dữ liệu' }, { status: 500 })
  }
}
