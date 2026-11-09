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


const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

function generateEncodedShareId(length = 22): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = 's_'
  for (let i = 0; i < length; i++) {
    out += BASE62_ALPHABET[bytes[i] % BASE62_ALPHABET.length]
  }
  return out
}

const shareRequestSchema = z.object({
  action: z.enum(['verify', 'init']).optional(),
  id: z.string().trim().min(4).max(64).optional(),
  password: z.string().max(200).optional().default(''),
  visibility: z.enum(['public', 'private']).optional(),
  sessionId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  title: z.string().trim().max(200).optional(),
  summaryContent: z.string().max(500_000).optional(),
})

const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }

interface SharedSummaryRow {
  id: string
  session_id?: string | null
  folder_id?: string | null
  title: string
  summary_content: string
  password_hash?: string | null
  created_at: string
}

async function buildUnlockedSharePayload(
  db: ReturnType<typeof getD1>,
  summary: SharedSummaryRow
) {
  let resolvedSummaryContent = summary.summary_content || ''
  let sessionMeta: {
    name: string
    partner_language: string
    started_at: string
    duration_seconds: number
  } | null = null
  let entries: Array<{
    id: string
    speaker: 'host' | 'partner'
    speaker_label?: string | null
    original_text: string
    translated_text: string
    start_ms: number
    end_ms: number
  }> = []

  if (summary.session_id) {
    const [sessRow, entriesRes, latestAiRow] = await Promise.all([
      db
        .prepare(
          'SELECT name, partner_language, started_at, duration_seconds FROM sessions WHERE id = ?'
        )
        .bind(summary.session_id)
        .first<{
          name: string
          partner_language: string
          started_at: string
          duration_seconds: number
        }>()
        .catch(() => null),
      db
        .prepare(
          'SELECT id, speaker, speaker_label, original_text, translated_text, start_ms, end_ms FROM transcript_entries WHERE session_id = ? ORDER BY start_ms ASC LIMIT 2000'
        )
        .bind(summary.session_id)
        .all<{
          id: string
          speaker: 'host' | 'partner'
          speaker_label?: string | null
          original_text: string
          translated_text: string
          start_ms: number
          end_ms: number
        }>()
        .catch(() => ({ results: [] })),
      !resolvedSummaryContent.trim()
        ? db
            .prepare(
              'SELECT summary_text FROM session_summaries WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
            )
            .bind(summary.session_id)
            .first<{ summary_text: string }>()
            .catch(() => null)
        : Promise.resolve(null),
    ])

    if (sessRow) {
      sessionMeta = sessRow
    }
    if (Array.isArray(entriesRes?.results)) {
      entries = entriesRes.results
    }
    if (!resolvedSummaryContent.trim() && latestAiRow?.summary_text) {
      resolvedSummaryContent = latestAiRow.summary_text
    }
  }

  return {
    id: summary.id,
    title: sessionMeta?.name || summary.title,
    summary_content: resolvedSummaryContent,
    session: sessionMeta,
    entries,
    hasPassword: Boolean(summary.password_hash),
    isLocked: false,
    created_at: summary.created_at,
  }
}

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

    if (!id || typeof id !== 'string' || id.length > 64) {
      return NextResponse.json({ error: 'Thiếu hoặc ID chia sẻ không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }

    const db = getD1()
    const summary = await db.prepare('SELECT * FROM shared_summaries WHERE id = ?')
      .bind(id)
      .first<SharedSummaryRow>()

    if (!summary) {
      return NextResponse.json({ error: 'Không tìm thấy liên kết chia sẻ' }, { status: 404, headers: noStoreHeader })
    }

    const hasPassword = !!summary.password_hash

    if (hasPassword) {
      return NextResponse.json({ id: summary.id, title: summary.title, hasPassword: true, isLocked: true }, {
        headers: noStoreHeader,
      })
    }

    // Return full conversation & summary content if public (no password)
    const unlockedPayload = await buildUnlockedSharePayload(db, summary)
    return NextResponse.json(unlockedPayload, {
      headers: noStoreHeader,
    })
  } catch (error: unknown) {
    console.error('Error fetching shared summary:', error)
    return NextResponse.json(
      { error: 'Lỗi hệ thống khi tải chia sẻ' },
      {
        status: 500,
        headers: noStoreHeader,
      }
    )
  }
}

/**
 * POST handler:
 * - Case 1: Create or update a shared conversation/summary link (if authenticated user)
 * - Case 2: Verify password and fetch content
 */
export async function POST(req: Request) {
  try {
    let rawJson: unknown
    try {
      rawJson = await req.json()
    } catch {
      return NextResponse.json({ error: 'Dữ liệu JSON không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }

    const parsedBody = shareRequestSchema.safeParse(rawJson)
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Dữ liệu chia sẻ không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }
    const { action, id, password, visibility, sessionId, folderId, title, summaryContent } = parsedBody.data
    const db = getD1()

    // Case 2: Verify password of existing shared summary
    if (action === 'verify') {
      if (!id) {
        return NextResponse.json({ error: 'Thiếu ID chia sẻ' }, { status: 400, headers: noStoreHeader })
      }

      const requestIp = getRequestIp(req)
      const verifyLimit = checkRateLimit({
        key: `shared-summary:${requestIp}:${id}`,
        limit: 5,
        windowMs: 15 * 60_000,
      })
      if (!verifyLimit.allowed) return rateLimitResponse(verifyLimit.retryAfterSeconds)

      const summary = await db.prepare('SELECT * FROM shared_summaries WHERE id = ?')
        .bind(id)
        .first<SharedSummaryRow>()

      if (!summary) {
        return NextResponse.json({ error: 'Không tìm thấy liên kết chia sẻ' }, { status: 404, headers: noStoreHeader })
      }

      const hasPassword = !!summary.password_hash
      if (hasPassword && summary.password_hash) {
        const shareRateUserKey = `share_pwd:${id}`
        const attemptId = crypto.randomUUID()
        const attemptRes = await db
          .prepare(`
            INSERT INTO ai_rate_limits (id, ip, user_id, created_at)
            SELECT ?1, ?2, ?3, datetime('now')
            WHERE (SELECT COUNT(*) FROM ai_rate_limits WHERE user_id = ?3 AND ip = ?2 AND created_at >= datetime('now', '-15 minutes')) < 5
              AND (SELECT COUNT(*) FROM ai_rate_limits WHERE user_id = ?3 AND created_at >= datetime('now', '-15 minutes')) < 20
          `)
          .bind(attemptId, requestIp, shareRateUserKey)
          .run()
        if (!attemptRes.meta || attemptRes.meta.changes === 0) {
          return rateLimitResponse(900)
        }

        const isValid = await verifySharedPassword(password, summary.password_hash)
        if (!isValid) {
          return NextResponse.json({ error: 'Mật khẩu không chính xác', isLocked: true }, { status: 401, headers: noStoreHeader })
        }

        await db
          .prepare('DELETE FROM ai_rate_limits WHERE id = ?')
          .bind(attemptId)
          .run()
          .catch(() => {})

        if (isLegacySharedPasswordHash(summary.password_hash)) {
          const upgradedHash = await hashSharedPassword(password)
          await db.prepare('UPDATE shared_summaries SET password_hash = ? WHERE id = ?')
            .bind(upgradedHash, summary.id)
            .run()
        }
      }

      const unlockedPayload = await buildUnlockedSharePayload(db, summary)
      return NextResponse.json(unlockedPayload, {
        headers: noStoreHeader,
      })
    }

    // Case 1: Create or update a shared link
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401, headers: noStoreHeader })
    }

    if (!sessionId && !folderId) {
      return NextResponse.json({ error: 'Cần cung cấp sessionId hoặc folderId' }, { status: 400, headers: noStoreHeader })
    }

    if (Boolean(sessionId) === Boolean(folderId)) {
      return NextResponse.json({ error: 'Chỉ được chia sẻ một cuộc hội thoại hoặc một thư mục' }, { status: 400, headers: noStoreHeader })
    }

    let resolvedTitle = (title || '').trim()
    let resolvedSummary = summaryContent ?? ''

    // Verify ownership & fallback title/summary from session if omitted
    if (sessionId) {
      const owned = await db
        .prepare('SELECT id, name FROM sessions WHERE id = ? AND owner_id = ?')
        .bind(sessionId, user.id)
        .first<{ id: string; name: string }>()
      if (!owned) return NextResponse.json({ error: 'Bạn không có quyền chia sẻ nội dung này' }, { status: 403, headers: noStoreHeader })
      if (!resolvedTitle) resolvedTitle = owned.name || 'Hội thoại PayLingo'
      if (!resolvedSummary.trim()) {
        const latestSaved = await db
          .prepare('SELECT summary_text FROM session_summaries WHERE session_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 1')
          .bind(sessionId, user.id)
          .first<{ summary_text: string }>()
          .catch(() => null)
        if (latestSaved?.summary_text) {
          resolvedSummary = latestSaved.summary_text
        }
      }
    } else {
      const owned = await db
        .prepare('SELECT id, name FROM folders WHERE id = ? AND owner_id = ?')
        .bind(folderId, user.id)
        .first<{ id: string; name: string }>()
      if (!owned) return NextResponse.json({ error: 'Bạn không có quyền chia sẻ nội dung này' }, { status: 403, headers: noStoreHeader })
      if (!resolvedTitle) resolvedTitle = owned.name || 'Thư mục PayLingo'
    }

    // Check if share record already exists for this session or folder
    const existing = sessionId
      ? await db
          .prepare('SELECT id, summary_content, password_hash FROM shared_summaries WHERE session_id = ?')
          .bind(sessionId)
          .first<{ id: string; summary_content: string; password_hash?: string | null }>()
      : await db
          .prepare('SELECT id, summary_content, password_hash FROM shared_summaries WHERE folder_id = ?')
          .bind(folderId)
          .first<{ id: string; summary_content: string; password_hash?: string | null }>()

    const finalSummaryContent = resolvedSummary.trim() || existing?.summary_content || ''

    let passHash: string | null = null
    if (action === 'init') {
      passHash = existing?.password_hash ?? null
    } else if (visibility === 'public') {
      passHash = null
    } else if (visibility === 'private') {
      const cleanPass = (password || '').trim()
      if (cleanPass) {
        if (cleanPass.length < 6) {
          return NextResponse.json(
            { error: 'Mật khẩu chia sẻ phải có ít nhất 6 ký tự' },
            { status: 400, headers: noStoreHeader }
          )
        }
        passHash = await hashSharedPassword(cleanPass)
      } else if (existing?.password_hash) {
        passHash = existing.password_hash
      } else {
        return NextResponse.json(
          { error: 'Vui lòng nhập mật khẩu (tối thiểu 6 ký tự) để đặt chế độ Riêng tư' },
          { status: 400, headers: noStoreHeader }
        )
      }
    } else {
      const cleanPass = (password || '').trim()
      if (cleanPass && cleanPass.length < 6) {
        return NextResponse.json(
          { error: 'Mật khẩu chia sẻ phải có ít nhất 6 ký tự' },
          { status: 400, headers: noStoreHeader }
        )
      }
      passHash = await hashSharedPassword(cleanPass)
    }

    let resultId = ''
    if (existing) {
      // Upgrade legacy UUIDs (with hyphens) to encoded share IDs
      resultId = existing.id.includes('-') ? generateEncodedShareId() : existing.id
      await db.prepare(`
        UPDATE shared_summaries
        SET id = ?, title = ?, summary_content = ?, password_hash = ?
        WHERE id = ?
      `)
        .bind(resultId, resolvedTitle, finalSummaryContent, passHash, existing.id)
        .run()
    } else {
      resultId = generateEncodedShareId()
      await db.prepare(`
        INSERT INTO shared_summaries (id, session_id, folder_id, title, summary_content, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `)
        .bind(resultId, sessionId || null, folderId || null, resolvedTitle, finalSummaryContent, passHash)
        .run()
    }

    return NextResponse.json(
      {
        success: true,
        id: resultId,
        hasPassword: Boolean(passHash),
        visibility: passHash ? 'private' : 'public',
      },
      {
        headers: noStoreHeader,
      }
    )
  } catch (error: unknown) {
    console.error('Error creating/verifying shared summary:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500, headers: noStoreHeader })
  }
}

/**
 * DELETE handler: Revoke/delete a shared summary (requires ownership).
 */
export async function DELETE(req: Request) {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401, headers: noStoreHeader })
    }

    const { searchParams } = new URL(req.url)
    const rawId = searchParams.get('id')
    const rawSessionId = searchParams.get('sessionId')
    const rawFolderId = searchParams.get('folderId')

    const cleanId = typeof rawId === 'string' && rawId.trim().length <= 64 ? rawId.trim() : null
    const cleanSessionId = typeof rawSessionId === 'string' && rawSessionId.trim().length <= 64 ? rawSessionId.trim() : null
    const cleanFolderId = typeof rawFolderId === 'string' && rawFolderId.trim().length <= 64 ? rawFolderId.trim() : null

    if (!cleanId && !cleanSessionId && !cleanFolderId) {
      return NextResponse.json({ error: 'Thiếu ID chia sẻ hoặc ID cuộc hội thoại/thư mục hợp lệ' }, { status: 400, headers: noStoreHeader })
    }

    const db = getD1()

    let targetSummary: { id: string; session_id?: string | null; folder_id?: string | null } | null = null

    if (cleanId) {
      targetSummary = await db.prepare('SELECT id, session_id, folder_id FROM shared_summaries WHERE id = ?')
        .bind(cleanId)
        .first<{ id: string; session_id?: string | null; folder_id?: string | null }>()
    } else if (cleanSessionId) {
      targetSummary = await db.prepare('SELECT id, session_id, folder_id FROM shared_summaries WHERE session_id = ?')
        .bind(cleanSessionId)
        .first<{ id: string; session_id?: string | null; folder_id?: string | null }>()
    } else if (cleanFolderId) {
      targetSummary = await db.prepare('SELECT id, session_id, folder_id FROM shared_summaries WHERE folder_id = ?')
        .bind(cleanFolderId)
        .first<{ id: string; session_id?: string | null; folder_id?: string | null }>()
    }

    if (!targetSummary) {
      return NextResponse.json({ error: 'Không tìm thấy liên kết chia sẻ' }, { status: 404, headers: noStoreHeader })
    }

    // Check ownership of the underlying session or folder
    if (targetSummary.session_id) {
      const owned = await db.prepare('SELECT id FROM sessions WHERE id = ? AND owner_id = ?')
        .bind(targetSummary.session_id, user.id)
        .first()
      if (!owned) return NextResponse.json({ error: 'Bạn không có quyền xoá liên kết chia sẻ này' }, { status: 403, headers: noStoreHeader })
    } else if (targetSummary.folder_id) {
      const owned = await db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ?')
        .bind(targetSummary.folder_id, user.id)
        .first()
      if (!owned) return NextResponse.json({ error: 'Bạn không có quyền xoá liên kết chia sẻ này' }, { status: 403, headers: noStoreHeader })
    }

    await db.prepare('DELETE FROM shared_summaries WHERE id = ?').bind(targetSummary.id).run()

    return NextResponse.json({ success: true }, { headers: noStoreHeader })
  } catch (error: unknown) {
    console.error('Error deleting shared summary:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống khi xoá liên kết chia sẻ' }, { status: 500, headers: noStoreHeader })
  }
}
