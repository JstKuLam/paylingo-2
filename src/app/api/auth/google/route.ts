import { NextResponse } from 'next/server'
import {
  GOOGLE_OAUTH_COOKIE,
  generateOAuthState,
  generatePkcePair,
  getGoogleOAuthConfig,
} from '@/lib/auth/google-oauth'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'edge'

const redirectSecurityHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
}

export async function GET(request: Request) {
  const rateLimit = checkRateLimit({
    key: `google-oauth-init:${getRequestIp(request)}`,
    limit: 30,
    windowMs: 15 * 60_000,
  })
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds)
  }

  const requestUrl = new URL(request.url)
  if (
    requestUrl.hostname.endsWith('.paylingo.pages.dev') &&
    requestUrl.hostname !== 'paylingo.pages.dev'
  ) {
    return NextResponse.redirect(
      `https://paylingo.pages.dev/api/auth/google${requestUrl.search}`,
      { headers: redirectSecurityHeaders }
    )
  }

  const origin = requestUrl.origin
  const mode = requestUrl.searchParams.get('mode') === 'signup' ? 'signup' : 'signin'

  const config = await getGoogleOAuthConfig()
  if (!config) {
    return NextResponse.redirect(`${origin}/?error=google_not_configured`, {
      headers: redirectSecurityHeaders,
    })
  }

  const state = generateOAuthState()
  const { codeVerifier, codeChallenge } = await generatePkcePair()
  const redirectUri = `${origin}/api/auth/google/callback`

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', config.clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid email profile')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('prompt', 'select_account')

  const response = NextResponse.redirect(authUrl.toString(), {
    headers: redirectSecurityHeaders,
  })

  response.cookies.set({
    name: GOOGLE_OAUTH_COOKIE,
    value: `${state}.${codeVerifier}.${mode}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })

  return response
}
