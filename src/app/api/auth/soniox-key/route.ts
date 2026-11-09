import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, AUTH_COOKIE_NAME } from '@/lib/auth/session'
import { isAllowedEmail } from '@/lib/auth-utils'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'
import { getD1 } from '@/lib/d1-client'
import { decryptAiKey, mintSonioxWsTicket } from '@/lib/ai-security'

export const runtime = 'edge'


const noStoreHeader = {
  'Cache-Control': 'no-store, max-age=0',
  'Vary': 'Authorization',
}

function errorKind(error: unknown) {
  return error instanceof Error ? error.name : 'UnknownError'
}

export async function POST(request: NextRequest) {
  let releaseReservation: () => Promise<void> = async () => {}
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') {
      return NextResponse.json(
        { error: 'Yêu cầu cross-site bị từ chối' },
        { status: 403, headers: noStoreHeader }
      )
    }

    const user = await getAuthenticatedUser(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập không hợp lệ' },
        { status: 401, headers: noStoreHeader }
      )
    }

    const email = user.email?.trim().toLowerCase()

    if (!email || !isAllowedEmail(email) || !user.email_confirmed_at) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập không hợp lệ' },
        { status: 401, headers: noStoreHeader }
      )
    }

    const requestIp = getRequestIp(request)
    const userKeyLimit = checkRateLimit({
      key: `soniox-key-user:${user.id}`,
      limit: 30,
      windowMs: 60 * 60_000,
    })
    if (!userKeyLimit.allowed) return rateLimitResponse(userKeyLimit.retryAfterSeconds)

    const ipKeyLimit = checkRateLimit({
      key: `soniox-key-ip:${requestIp}`,
      limit: 60,
      windowMs: 60 * 60_000,
    })
    if (!ipKeyLimit.allowed) return rateLimitResponse(ipKeyLimit.retryAfterSeconds)

    const db = getD1()
    const rateReservationId = crypto.randomUUID()
    const sonioxRateUserKey = `soniox:${user.id}`
    const reservationRes = await db
      .prepare(`
        INSERT INTO ai_rate_limits (id, ip, user_id, created_at)
        SELECT ?1, ?2, ?3, datetime('now')
        WHERE (SELECT COUNT(*) FROM ai_rate_limits WHERE user_id = ?3 AND created_at >= datetime('now', '-1 hour')) < 30
          AND (SELECT COUNT(*) FROM ai_rate_limits WHERE ip = ?2 AND user_id LIKE 'soniox:%' AND created_at >= datetime('now', '-1 hour')) < 60
      `)
      .bind(rateReservationId, requestIp, sonioxRateUserKey)
      .run()
    if (!reservationRes.meta || reservationRes.meta.changes === 0) {
      return rateLimitResponse(3600)
    }
    releaseReservation = async () => {
      await db.prepare('DELETE FROM ai_rate_limits WHERE id = ?').bind(rateReservationId).run().catch(() => {})
    }
    await db
      .prepare("DELETE FROM ai_rate_limits WHERE created_at < datetime('now', '-2 hours')")
      .run()
      .catch(() => {})

    // 3. Resolve encrypted D1 Soniox key or SONIOX_API_KEY env
    let sonioxMasterKey = (process.env.SONIOX_API_KEY || '').trim()
    try {
      const row = await db
        .prepare('SELECT api_key FROM api_settings WHERE key = ?')
        .bind('soniox')
        .first<{ api_key?: string | null }>()
      if (row?.api_key) {
        const decrypted = (await decryptAiKey(row.api_key)).trim()
        if (decrypted) {
          sonioxMasterKey = decrypted
        }
      }
    } catch {
      // Fallback to process.env.SONIOX_API_KEY
    }

    if (!sonioxMasterKey) {
      await releaseReservation()
      return NextResponse.json(
        { error: 'Chưa cấu hình Soniox API Key trên máy chủ' },
        { status: 500, headers: noStoreHeader }
      )
    }

    // 4. Mint temporary key via standard REST API fetch (Edge runtime compatible)
    const sanitizedUserId = user.id.slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '')
    const response = await fetch('https://api.soniox.com/v1/auth/temporary-api-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sonioxMasterKey}`
      },
      body: JSON.stringify({
        usage_type: 'transcribe_websocket',
        expires_in_seconds: 60,
        single_use: true,
        max_session_duration_seconds: 7200,
        client_reference_id: `paylingo:${sanitizedUserId}`,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    // 5. If the project key is scoped strictly to Real-time WebSocket (403 on REST),
    // mint a 60s HMAC-SHA256 Edge WebSocket Proxy ticket so the master key is NEVER exposed to the client.
    if (response.status === 403) {
      const requestUrl = new URL(request.url)
      const wsProtocol = requestUrl.protocol === 'https:' ? 'wss:' : 'ws:'
      const ticket = await mintSonioxWsTicket(sonioxMasterKey, sanitizedUserId, 60)
      return NextResponse.json(
        {
          success: true,
          api_key: ticket,
          stt_ws_url: `${wsProtocol}//${requestUrl.host}/api/ws/soniox`,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        { headers: noStoreHeader }
      )
    }

    if (!response.ok) {
      await releaseReservation()
      console.error('Soniox temporary key request failed:', response.status)
      const retryAfter = response.headers.get('Retry-After')
      return NextResponse.json(
        { error: 'Dịch vụ nhận dạng giọng nói đang tạm thời không khả dụng' },
        {
          status: response.status === 429 ? 429 : 502,
          headers: {
            ...noStoreHeader,
            ...(retryAfter ? { 'Retry-After': retryAfter } : {}),
          },
        }
      )
    }

    let tempKeyResponse: { api_key?: string; expires_at?: string } = {}
    try {
      tempKeyResponse = await response.json()
    } catch {
      await releaseReservation()
      console.error('Soniox temporary key response was not valid JSON')
      return NextResponse.json(
        { error: 'Dịch vụ nhận dạng giọng nói trả về dữ liệu không hợp lệ' },
        { status: 502, headers: noStoreHeader }
      )
    }

    if (!tempKeyResponse.api_key) {
      await releaseReservation()
      console.error('Soniox temporary key response did not include api_key')
      return NextResponse.json(
        { error: 'Dịch vụ nhận dạng giọng nói trả về dữ liệu không hợp lệ' },
        { status: 502, headers: noStoreHeader }
      )
    }

    return NextResponse.json({
      success: true,
      api_key: tempKeyResponse.api_key,
      expires_at: tempKeyResponse.expires_at,
    }, {
      headers: noStoreHeader,
    })
  } catch (error: unknown) {
    await releaseReservation()
    console.error('Unable to mint Soniox temporary key:', errorKind(error))
    return NextResponse.json(
      { error: 'Không thể tạo khóa Soniox tạm thời' },
      { status: 500, headers: noStoreHeader }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    const email = user?.email?.trim().toLowerCase()

    if (!user || !email || !isAllowedEmail(email) || !user.email_confirmed_at) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập không hợp lệ' },
        { status: 401, headers: noStoreHeader },
      )
    }

    const deleteLimit = checkRateLimit({
      key: `account-delete:${user.id}:${getRequestIp(request)}`,
      limit: 5,
      windowMs: 60 * 60_000,
    })
    if (!deleteLimit.allowed) return rateLimitResponse(deleteLimit.retryAfterSeconds)

    const db = getD1()
    await db.batch([
      db.prepare('DELETE FROM transcript_entries WHERE session_id IN (SELECT id FROM sessions WHERE owner_id = ?)').bind(user.id),
      db.prepare('DELETE FROM session_summaries WHERE session_id IN (SELECT id FROM sessions WHERE owner_id = ?) OR folder_id IN (SELECT id FROM folders WHERE owner_id = ?)').bind(user.id, user.id),
      db.prepare('DELETE FROM shared_summaries WHERE session_id IN (SELECT id FROM sessions WHERE owner_id = ?) OR folder_id IN (SELECT id FROM folders WHERE owner_id = ?)').bind(user.id, user.id),
      db.prepare('DELETE FROM sessions WHERE owner_id = ?').bind(user.id),
      db.prepare('DELETE FROM folders WHERE owner_id = ?').bind(user.id),
      db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM auth_users WHERE id = ?').bind(user.id),
    ])

    const response = NextResponse.json(
      { success: true },
      {
        headers: noStoreHeader,
      },
    )

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })

    return response
  } catch (error: unknown) {
    console.error('Unable to delete PayLingo account:', errorKind(error))
    return NextResponse.json(
      { error: 'Không thể xóa tài khoản và dữ liệu. Vui lòng thử lại.' },
      { status: 500, headers: noStoreHeader },
    )
  }
}
