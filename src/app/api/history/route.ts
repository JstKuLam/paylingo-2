import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/session'
import { getD1 } from '@/lib/d1-client'

export const runtime = 'edge'

export async function GET(request: Request) {
  const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401, headers: noStoreHeader })
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
        if (!folder) {
          return NextResponse.json({ item: null, sessions: [] }, { status: 404, headers: noStoreHeader })
        }
        const sessions = await db.prepare('SELECT * FROM sessions WHERE folder_id = ? AND owner_id = ? ORDER BY started_at DESC LIMIT 1000')
          .bind(id, user.id)
          .all()
        const summaries = await db.prepare('SELECT id, folder_id, style, summary_text, created_at FROM session_summaries WHERE folder_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 20')
          .bind(id, user.id)
          .all()
          .catch(() => ({ results: [] }))
        return NextResponse.json({ item: folder, sessions: sessions.results || [], summaries: summaries.results || [] }, { headers: noStoreHeader })
      }

      const res = await db.prepare('SELECT * FROM folders WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1000')
        .bind(user.id)
        .all()
      return NextResponse.json({ items: res.results || [] }, { headers: noStoreHeader })
    }

    if (table === 'sessions') {
      if (single && id) {
        const session = await db.prepare('SELECT * FROM sessions WHERE id = ? AND owner_id = ?')
          .bind(id, user.id)
          .first()
        if (!session) {
          return NextResponse.json({ item: null, entries: [] }, { status: 404, headers: noStoreHeader })
        }
        const entries = await db.prepare('SELECT * FROM transcript_entries WHERE session_id = ? ORDER BY start_ms ASC LIMIT 2000')
          .bind(id)
          .all()
        const summaries = await db.prepare('SELECT id, session_id, style, summary_text, created_at FROM session_summaries WHERE session_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 20')
          .bind(id, user.id)
          .all()
          .catch(() => ({ results: [] }))
        return NextResponse.json({ item: session, entries: entries.results || [], summaries: summaries.results || [] }, { headers: noStoreHeader })
      }

      const res = await db.prepare('SELECT * FROM sessions WHERE owner_id = ? ORDER BY started_at DESC LIMIT 1000')
        .bind(user.id)
        .all()
      return NextResponse.json({ items: res.results || [] }, { headers: noStoreHeader })
    }

    if (table === 'session_summaries') {
      const sessionIdParam = searchParams.get('sessionId')?.trim()
      const folderIdParam = searchParams.get('folderId')?.trim()
      if (sessionIdParam) {
        const res = await db.prepare('SELECT id, session_id, folder_id, style, summary_text, created_at FROM session_summaries WHERE session_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 20')
          .bind(sessionIdParam, user.id)
          .all()
        return NextResponse.json({ items: res.results || [] }, { headers: noStoreHeader })
      }
      if (folderIdParam) {
        const res = await db.prepare('SELECT id, session_id, folder_id, style, summary_text, created_at FROM session_summaries WHERE folder_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 20')
          .bind(folderIdParam, user.id)
          .all()
        return NextResponse.json({ items: res.results || [] }, { headers: noStoreHeader })
      }
      const res = await db.prepare('SELECT id, session_id, folder_id, style, summary_text, created_at FROM session_summaries WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200')
        .bind(user.id)
        .all()
      return NextResponse.json({ items: res.results || [] }, { headers: noStoreHeader })
    }

    return NextResponse.json({ items: [] }, { headers: noStoreHeader })
  } catch (err: unknown) {
    console.error('Error in history GET API:', err)
    return NextResponse.json({ error: 'Lỗi lấy dữ liệu lịch sử' }, { status: 500, headers: noStoreHeader })
  }
}

export async function PATCH(request: Request) {
  const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401, headers: noStoreHeader })
    }

    let body: { table?: unknown; field?: unknown; value?: unknown; payload?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Dữ liệu JSON không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }

    const { table, field, value, payload } = body
    const db = getD1()

    if (field !== 'id' || typeof value !== 'string' || !value.trim() || !payload || typeof payload !== 'object') {
      return NextResponse.json({ success: false, error: 'Trường không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }

    const cleanValue = value.trim()
    const payloadObj = payload as Record<string, unknown>
    const nowIso = new Date().toISOString()

    if (table === 'sessions' && cleanValue) {
      if ('folder_id' in payloadObj) {
        const rawFolderId = payloadObj.folder_id
        const cleanFolderId = typeof rawFolderId === 'string' && rawFolderId.trim() ? rawFolderId.trim() : null
        if (cleanFolderId !== null) {
          const folder = await db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ?')
            .bind(cleanFolderId, user.id)
            .first()
          if (!folder) {
            return NextResponse.json({ success: false, error: 'Thư mục không tồn tại hoặc không có quyền' }, { status: 400, headers: noStoreHeader })
          }
        }
        await db.prepare('UPDATE sessions SET folder_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
          .bind(cleanFolderId, nowIso, cleanValue, user.id)
          .run()
      }
      if ('name' in payloadObj) {
        const rawName = payloadObj.name
        const cleanName = typeof rawName === 'string' ? rawName.trim().slice(0, 200) : ''
        if (!cleanName) {
          return NextResponse.json({ success: false, error: 'Tên không được để trống' }, { status: 400, headers: noStoreHeader })
        }
        await db.prepare('UPDATE sessions SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
          .bind(cleanName, nowIso, cleanValue, user.id)
          .run()
      }
      return NextResponse.json({ success: true }, { headers: noStoreHeader })
    }

    if (table === 'folders' && cleanValue) {
      if ('name' in payloadObj) {
        const rawName = payloadObj.name
        const cleanName = typeof rawName === 'string' ? rawName.trim().slice(0, 200) : ''
        if (!cleanName) {
          return NextResponse.json({ success: false, error: 'Tên thư mục không được để trống' }, { status: 400, headers: noStoreHeader })
        }
        await db.prepare('UPDATE folders SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
          .bind(cleanName, nowIso, cleanValue, user.id)
          .run()
      }
      return NextResponse.json({ success: true }, { headers: noStoreHeader })
    }

    return NextResponse.json({ success: false, error: 'Thao tác không hợp lệ' }, { status: 400, headers: noStoreHeader })
  } catch (err: unknown) {
    console.error('Error in history PATCH API:', err)
    return NextResponse.json({ error: 'Lỗi cập nhật dữ liệu' }, { status: 500, headers: noStoreHeader })
  }
}

export async function DELETE(request: Request) {
  const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401, headers: noStoreHeader })
    }

    let body: { table?: unknown; field?: unknown; value?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Dữ liệu JSON không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }

    const { table, field, value } = body
    const db = getD1()

    if (typeof value !== 'string' || !value.trim()) {
      return NextResponse.json({ success: false, error: 'ID không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }
    const cleanValue = value.trim()

    if (table === 'sessions' && field === 'id' && cleanValue) {
      const session = await db.prepare('SELECT id FROM sessions WHERE id = ? AND owner_id = ?')
        .bind(cleanValue, user.id)
        .first()
      if (!session) {
        const existingOtherOwner = await db.prepare('SELECT id FROM sessions WHERE id = ?')
          .bind(cleanValue)
          .first()
        if (existingOtherOwner) {
          return NextResponse.json({ success: false, error: 'Không tìm thấy phiên hoặc không có quyền' }, { status: 404, headers: noStoreHeader })
        }
        // Idempotent success when deleting a local-only session that has not yet been synced to D1
        return NextResponse.json({ success: true }, { headers: noStoreHeader })
      }
      await db.batch([
        db.prepare('DELETE FROM transcript_entries WHERE session_id = ?').bind(cleanValue),
        db.prepare('DELETE FROM session_summaries WHERE session_id = ?').bind(cleanValue),
        db.prepare('DELETE FROM shared_summaries WHERE session_id = ?').bind(cleanValue),
        db.prepare('DELETE FROM sessions WHERE id = ? AND owner_id = ?').bind(cleanValue, user.id),
      ])
      return NextResponse.json({ success: true }, { headers: noStoreHeader })
    }

    if (table === 'folders' && field === 'id' && cleanValue) {
      const folder = await db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ?')
        .bind(cleanValue, user.id)
        .first()
      if (!folder) {
        const existingOtherOwner = await db.prepare('SELECT id FROM folders WHERE id = ?')
          .bind(cleanValue)
          .first()
        if (existingOtherOwner) {
          return NextResponse.json({ success: false, error: 'Không tìm thấy thư mục hoặc không có quyền' }, { status: 404, headers: noStoreHeader })
        }
        // Idempotent success when deleting a local-only folder that has not yet been synced to D1
        return NextResponse.json({ success: true }, { headers: noStoreHeader })
      }
      await db.batch([
        db.prepare('UPDATE sessions SET folder_id = NULL WHERE folder_id = ? AND owner_id = ?').bind(cleanValue, user.id),
        db.prepare('DELETE FROM session_summaries WHERE folder_id = ?').bind(cleanValue),
        db.prepare('DELETE FROM shared_summaries WHERE folder_id = ?').bind(cleanValue),
        db.prepare('DELETE FROM folders WHERE id = ? AND owner_id = ?').bind(cleanValue, user.id),
      ])
      return NextResponse.json({ success: true }, { headers: noStoreHeader })
    }

    return NextResponse.json({ success: false, error: 'Thao tác không hợp lệ' }, { status: 400, headers: noStoreHeader })
  } catch (err: unknown) {
    console.error('Error in history DELETE API:', err)
    return NextResponse.json({ error: 'Lỗi xóa dữ liệu' }, { status: 500, headers: noStoreHeader })
  }
}
