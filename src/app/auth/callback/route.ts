import { NextResponse } from 'next/server'
import { verifyMagicToken, AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE } from '@/lib/auth/session'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'edge'


function safeNextPath(nextParam: string | null, origin: string): string {
  if (!nextParam || typeof nextParam !== 'string') return '/session'
  if (!nextParam.startsWith('/') || nextParam.startsWith('//') || nextParam.includes('\\')) {
    return '/session'
  }
  try {
    const parsed = new URL(nextParam, origin)
    if (parsed.origin !== origin) return '/session'
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    return '/session'
  }
}

export async function GET(request: Request) {
  const rateLimit = checkRateLimit({
    key: `auth-callback:${getRequestIp(request)}`,
    limit: 20,
    windowMs: 15 * 60_000,
  })
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds)
  }

  const requestUrl = new URL(request.url)
  const origin = requestUrl.origin
  const token =
    requestUrl.searchParams.get('token') ||
    requestUrl.searchParams.get('token_hash') ||
    requestUrl.searchParams.get('code') ||
    requestUrl.searchParams.get('otp')
  const nextParam = requestUrl.searchParams.get('next')
  const targetPath = safeNextPath(nextParam, origin)

  const cleanToken = token ? token.trim() : ''
  if (!cleanToken) {
    return NextResponse.redirect(`${origin}/?error=missing_token`, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  }

  if (cleanToken.length < 6 || cleanToken.length > 128) {
    return NextResponse.redirect(`${origin}/?error=invalid_or_expired_token`, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  }

  // verifyOtp / exchangeCodeForSession logic via D1 verifyMagicToken
  const sessionRes = await verifyMagicToken(cleanToken)
  if (!sessionRes) {
    return NextResponse.redirect(`${origin}/?error=invalid_or_expired_token`, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  }

  const targetUrl = new URL(targetPath, origin)
  const response = NextResponse.redirect(targetUrl.toString(), {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
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
}
