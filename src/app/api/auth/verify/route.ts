import { NextResponse } from 'next/server'
import { verifyMagicToken, AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE } from '@/lib/auth/session'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'edge'


export async function POST(request: Request) {
  try {
    const { token } = await request.json()

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Mã xác thực không hợp lệ.' }, { status: 400 })
    }

    const cleanToken = token.trim()
    const rateLimit = checkRateLimit({
      key: `verify-otp:${getRequestIp(request)}`,
      limit: 10,
      windowMs: 15 * 60_000,
    })
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds)

    const sessionRes = await verifyMagicToken(cleanToken)
    if (!sessionRes) {
      return NextResponse.json({ error: 'Mã xác thực không đúng hoặc đã hết hạn.' }, { status: 400 })
    }

    const response = NextResponse.json({
      success: true,
      user: sessionRes.user,
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
      { error: err instanceof Error ? err.message : 'Lỗi hệ thống khi xác thực.' },
      { status: 500 }
    )
  }
}
