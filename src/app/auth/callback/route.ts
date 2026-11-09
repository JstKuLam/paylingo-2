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

  const redirectSecurityHeaders = {
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
  }

  const cleanToken = token ? token.trim() : ''
  if (!cleanToken) {
    return NextResponse.redirect(`${origin}/?error=missing_token`, {
      headers: redirectSecurityHeaders,
    })
  }

  if (cleanToken.length < 6 || cleanToken.length > 128) {
    return NextResponse.redirect(`${origin}/?error=invalid_or_expired_token`, {
      headers: redirectSecurityHeaders,
    })
  }

  // Reject cross-site Login-CSRF and subresource prefetches: require same-origin OR token-bound __Host-paylingo_magic_nonce cookie
  const secFetchSite = request.headers.get('sec-fetch-site')?.toLowerCase()
  const secFetchMode = request.headers.get('sec-fetch-mode')?.toLowerCase()
  const secFetchDest = request.headers.get('sec-fetch-dest')?.toLowerCase()
  const isSubresourceFetch =
    (Boolean(secFetchMode) && secFetchMode !== 'navigate') ||
    (Boolean(secFetchDest) && secFetchDest !== 'document')
  const queryNonce = (requestUrl.searchParams.get('nonce') || '').trim()
  const rawCookie = request.headers.get('cookie') || ''
  const expectedNonceCookieRegex =
    process.env.NODE_ENV === 'production'
      ? /(?:^|;\s*)__Host-paylingo_magic_nonce=([^;]+)/
      : /(?:^|;\s*)(?:__Host-)?paylingo_magic_nonce=([^;]+)/
  const nonceCookieMatch = rawCookie.match(expectedNonceCookieRegex)
  const cookieNonce = nonceCookieMatch ? nonceCookieMatch[1].trim() : ''
  let hasMatchingBrowserNonce = false
  if (queryNonce.length === 32 && cookieNonce.length >= 16 && cookieNonce.length <= 64) {
    const nonceDigest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`paylingo-magic-nonce-v1:${cleanToken}:${cookieNonce}`)
    )
    const expectedBoundNonce = Array.from(new Uint8Array(nonceDigest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32)
    hasMatchingBrowserNonce = expectedBoundNonce === queryNonce
  }
  const isSameOrigin = secFetchSite === 'same-origin'

  if (isSubresourceFetch || cleanToken.length < 32 || (!isSameOrigin && !hasMatchingBrowserNonce)) {
    return NextResponse.redirect(`${origin}/?error=invalid_or_expired_token`, {
      headers: redirectSecurityHeaders,
    })
  }

  // verifyOtp / exchangeCodeForSession logic via D1 verifyMagicToken
  const sessionRes = await verifyMagicToken(cleanToken)
  if (!sessionRes) {
    return NextResponse.redirect(`${origin}/?error=invalid_or_expired_token`, {
      headers: redirectSecurityHeaders,
    })
  }

  const targetUrl = new URL(targetPath, origin)
  const response = NextResponse.redirect(targetUrl.toString(), {
    headers: redirectSecurityHeaders,
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
  response.cookies.set({
    name: 'paylingo_magic_nonce',
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  if (process.env.NODE_ENV === 'production') {
    response.cookies.set({
      name: '__Host-paylingo_magic_nonce',
      value: '',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
  }

  return response
}
