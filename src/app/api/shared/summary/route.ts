import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/session'
import { getD1 } from '@/lib/d1-client'
import { z } from 'zod'
import {
  hashSharedPassword,
  isLegacySharedPasswordHash,
  verifySharedPassword,
} from '@/lib/shared-password'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'edge'


const shareRequestSchema = z.object({
  action: z.enum(['verify']).optional(),
  id: z.string().uuid().optional(),
  password: z.string().max(200).optional().default(''),
  sessionId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  summaryContent: z.string().min(1).max(500_000).optional(),
})

/**
 * GET handler: Fetch info about a shared summary.
 */
export async function GET(req: Request) {
  try {
    const getLimit = checkRateLimit({
      key: `shared-summary-get:${getRequestIp(req)}`,
      limit: 60,
      windowMs: 60_000,
    })
    if (!getLimit.allowed) return rateLimitResponse(getLimit.retryAfterSeconds)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }

    if (!id || typeof id !== 'string' || id.length > 64) {
      return NextResponse.json({ error: 'Thiếu hoặc ID chia sẻ không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }

    const db = getD1()
    const summary = await db.prepare('SELECT * FROM shared_summaries WHERE id = ?')
      .bind(id)
      .first<{ id: string; title: string; summary_content: string; password_hash?: string; created_at: string }>()

    if (!summary) {
      return NextResponse.json({ error: 'Không tìm thấy liên kết chia sẻ' }, { status: 404, headers: noStoreHeader })
    }

    const hasPassword = !!summary.password_hash

    if (hasPassword) {
      return NextResponse.json({ id: summary.id, hasPassword: true, isLocked: true }, {
        headers: noStoreHeader,
      })
    }

    // Return full content if no password
    return NextResponse.json({
      id: summary.id,
      title: summary.title,
      summary_content: summary.summary_content,
      hasPassword,
      isLocked: false,
      created_at: summary.created_at
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (error: unknown) {
    console.error('Error fetching shared summary:', error)
    return NextResponse.json(
      { error: 'Lỗi hệ thống khi tải chia sẻ' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    )
  }
}

/**
 * POST handler:
 * - Case 1: Create a new shared summary (if authenticated user)
 * - Case 2: Verify password and fetch content
 */
export async function POST(req: Request) {
  const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }
  try {
    const parsedBody = shareRequestSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Dữ liệu chia sẻ không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }
    const { action, id, password, sessionId, folderId, title, summaryContent } = parsedBody.data
    const db = getD1()

    // Case 2: Verify password of existing shared summary
    if (action === 'verify') {
      if (!id) {
        return NextResponse.json({ error: 'Thiếu ID chia sẻ' }, { status: 400, headers: noStoreHeader })
      }

      const verifyLimit = checkRateLimit({
        key: `shared-summary:${getRequestIp(req)}:${id}`,
        limit: 5,
        windowMs: 15 * 60_000,
      })
      if (!verifyLimit.allowed) return rateLimitResponse(verifyLimit.retryAfterSeconds)

      const summary = await db.prepare('SELECT * FROM shared_summaries WHERE id = ?')
        .bind(id)
        .first<{ id: string; title: string; summary_content: string; password_hash?: string; created_at: string }>()

      if (!summary) {
        return NextResponse.json({ error: 'Không tìm thấy liên kết chia sẻ' }, { status: 404, headers: noStoreHeader })
      }

      const hasPassword = !!summary.password_hash
      if (hasPassword && summary.password_hash) {
        const isValid = await verifySharedPassword(password, summary.password_hash)
        if (!isValid) {
          return NextResponse.json({ error: 'Mật khẩu không chính xác', isLocked: true }, { status: 401, headers: noStoreHeader })
        }

        if (isLegacySharedPasswordHash(summary.password_hash)) {
          const upgradedHash = await hashSharedPassword(password)
          await db.prepare('UPDATE shared_summaries SET password_hash = ? WHERE id = ?')
            .bind(upgradedHash, summary.id)
            .run()
        }
      }

      return NextResponse.json({
        id: summary.id,
        title: summary.title,
        summary_content: summary.summary_content,
        hasPassword,
        isLocked: false,
        created_at: summary.created_at
      }, {
        headers: noStoreHeader,
      })
    }

    // Case 1: Create a new shared summary
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401, headers: noStoreHeader })
    }

    if (!title || !summaryContent) {
      return NextResponse.json({ error: 'Thiếu tiêu đề hoặc nội dung tóm tắt' }, { status: 400, headers: noStoreHeader })
    }

    if (!sessionId && !folderId) {
      return NextResponse.json({ error: 'Cần cung cấp sessionId hoặc folderId' }, { status: 400, headers: noStoreHeader })
    }

    if (Boolean(sessionId) === Boolean(folderId)) {
      return NextResponse.json({ error: 'Chỉ được chia sẻ một cuộc hội thoại hoặc một thư mục' }, { status: 400, headers: noStoreHeader })
    }

    // Verify ownership
    if (sessionId) {
      const owned = await db.prepare('SELECT id FROM sessions WHERE id = ? AND owner_id = ?').bind(sessionId, user.id).first()
      if (!owned) return NextResponse.json({ error: 'Bạn không có quyền chia sẻ nội dung này' }, { status: 403, headers: noStoreHeader })
    } else {
      const owned = await db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ?').bind(folderId, user.id).first()
      if (!owned) return NextResponse.json({ error: 'Bạn không có quyền chia sẻ nội dung này' }, { status: 403, headers: noStoreHeader })
    }

    const passHash = await hashSharedPassword(password)
    
    // Check if summary already exists for this session or folder
    const existing = sessionId
      ? await db.prepare('SELECT id FROM shared_summaries WHERE session_id = ?').bind(sessionId).first<{ id: string }>()
      : await db.prepare('SELECT id FROM shared_summaries WHERE folder_id = ?').bind(folderId).first<{ id: string }>()

    let resultId = ''
    if (existing) {
      await db.prepare(`
        UPDATE shared_summaries
        SET title = ?, summary_content = ?, password_hash = ?
        WHERE id = ?
      `)
        .bind(title, summaryContent, passHash, existing.id)
        .run()
      resultId = existing.id
    } else {
      resultId = crypto.randomUUID()
      await db.prepare(`
        INSERT INTO shared_summaries (id, session_id, folder_id, title, summary_content, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `)
        .bind(resultId, sessionId || null, folderId || null, title, summaryContent, passHash)
        .run()
    }

    return NextResponse.json({ success: true, id: resultId }, {
      headers: noStoreHeader,
    })
  } catch (error: unknown) {
    console.error('Error creating/verifying shared summary:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500, headers: noStoreHeader })
  }
}
