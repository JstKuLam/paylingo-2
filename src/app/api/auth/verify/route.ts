import { NextResponse } from 'next/server'
import { verifyMagicToken, AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE } from '@/lib/auth/session'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'edge'


const noStoreHeader = {
  'Cache-Control': 'no-store, max-age=0',
}

export async function POST(request: Request) {
  try {
    let body: { token?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Dữ liệu yêu cầu không hợp lệ.' },
        { status: 400, headers: noStoreHeader }
      )
    }

    const { token } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Mã xác thực không hợp lệ.' },
        { status: 400, headers: noStoreHeader }
      )
    }

    const cleanToken = token.trim()
    if (cleanToken.length < 6 || cleanToken.length > 128) {
      return NextResponse.json(
        { error: 'Mã xác thực không đúng định dạng hoặc đã hết hạn.' },
        { status: 400, headers: noStoreHeader }
      )
    }

    const rateLimit = checkRateLimit({
      key: `verify-otp:${getRequestIp(request)}`,
      limit: 10,
      windowMs: 15 * 60_000,
    })
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds)

    const tokenLimit = checkRateLimit({
      key: `verify-token:${cleanToken.slice(0, 32)}`,
      limit: 10,
      windowMs: 15 * 60_000,
    })
    if (!tokenLimit.allowed) return rateLimitResponse(tokenLimit.retryAfterSeconds)

    const sessionRes = await verifyMagicToken(cleanToken)
    if (!sessionRes) {
      return NextResponse.json(
        { error: 'Mã xác thực không đúng hoặc đã hết hạn.' },
        { status: 400, headers: noStoreHeader }
      )
    }

    const response = NextResponse.json({
      success: true,
      user: sessionRes.user,
    }, {
      headers: noStoreHeader,
    })

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: sessionRes.sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE,
    })

    return response
  } catch (err: unknown) {
    console.error('Error in verify route:', err)
    return NextResponse.json(
      { error: 'Lỗi hệ thống khi xác thực.' },
      { status: 500, headers: noStoreHeader }
    )
  }
}
