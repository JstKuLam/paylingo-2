import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, AUTH_COOKIE_NAME } from '@/lib/auth/session'
import { isAllowedEmail } from '@/lib/auth-utils'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'
import { getD1 } from '@/lib/d1-client'

export const runtime = 'edge'


const noStoreHeader = {
  'Cache-Control': 'no-store, max-age=0',
  'Vary': 'Authorization',
}

function errorKind(error: unknown) {
  return error instanceof Error ? error.name : 'UnknownError'
}

export async function POST(request: NextRequest) {
  try {
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
        { error: 'Tài khoản không hợp lệ hoặc chưa được xác thực.' },
        { status: 403, headers: noStoreHeader }
      )
    }

    const keyLimit = checkRateLimit({
      key: `soniox-key:${user.id}:${getRequestIp(request)}`,
      limit: 30,
      windowMs: 60 * 60_000,
    })
    if (!keyLimit.allowed) return rateLimitResponse(keyLimit.retryAfterSeconds)

    // 3. Verify SONIOX_API_KEY env is set
    if (!process.env.SONIOX_API_KEY) {
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
        'Authorization': `Bearer ${process.env.SONIOX_API_KEY}`
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

    if (!response.ok) {
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
      console.error('Soniox temporary key response was not valid JSON')
      return NextResponse.json(
        { error: 'Dịch vụ nhận dạng giọng nói trả về dữ liệu không hợp lệ' },
        { status: 502, headers: noStoreHeader }
      )
    }

    if (!tempKeyResponse.api_key) {
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

    const db = getD1()
    await db.batch([
      db.prepare('DELETE FROM transcript_entries WHERE session_id IN (SELECT id FROM sessions WHERE owner_id = ?)').bind(user.id),
      db.prepare('DELETE FROM session_summaries WHERE session_id IN (SELECT id FROM sessions WHERE owner_id = ?) OR folder_id IN (SELECT id FROM folders WHERE owner_id = ?)').bind(user.id, user.id),
      db.prepare('DELETE FROM shared_summaries WHERE session_id IN (SELECT id FROM sessions WHERE owner_id = ?) OR folder_id IN (SELECT id FROM folders WHERE owner_id = ?)').bind(user.id, user.id),
      db.prepare('DELETE FROM sessions WHERE owner_id = ?').bind(user.id),
      db.prepare('DELETE FROM folders WHERE owner_id = ?').bind(user.id),
      db.prepare('DELETE FROM auth_tokens WHERE email = ?').bind(email),
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
