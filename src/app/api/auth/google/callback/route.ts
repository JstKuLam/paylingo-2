import { NextResponse } from 'next/server'
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  createOrUpdateOAuthSession,
  getAuthenticatedUser,
} from '@/lib/auth/session'
import {
  GOOGLE_OAUTH_COOKIE,
  GOOGLE_PROFILE_COOKIE,
  getGoogleOAuthConfig,
  isAllowedOAuthReturnOrigin,
  signOAuthHandoff,
  verifyOAuthHandoff,
} from '@/lib/auth/google-oauth'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'edge'

const redirectSecurityHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
}

function safeDecodeCookie(val: string): string {
  try {
    return decodeURIComponent(val)
  } catch {
    return val
  }
}

export async function GET(request: Request) {
  const rateLimit = checkRateLimit({
    key: `google-oauth-callback:${getRequestIp(request)}`,
    limit: 30,
    windowMs: 15 * 60_000,
  })
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds)
  }

  const requestUrl = new URL(request.url)
  const origin = requestUrl.origin

  const config = await getGoogleOAuthConfig()
  if (!config) {
    return NextResponse.redirect(`${origin}/?error=google_not_configured`, {
      headers: redirectSecurityHeaders,
    })
  }

  // Handle cross-domain OAuth handoff from canonical paylingo.pages.dev to custom domain (e.g. noidi.9phut.org)
  const handoffToken = (requestUrl.searchParams.get('handoff') || '').trim()
  if (handoffToken) {
    const handoffPayload = await verifyOAuthHandoff(handoffToken, config.clientSecret)
    if (!handoffPayload) {
      return NextResponse.redirect(`${origin}/?error=google_auth_failed`, {
        headers: redirectSecurityHeaders,
      })
    }
    const verifiedUser = await getAuthenticatedUser(handoffPayload.sessionToken)
    if (!verifiedUser) {
      return NextResponse.redirect(`${origin}/?error=google_auth_failed`, {
        headers: redirectSecurityHeaders,
      })
    }

    const handoffResponse = NextResponse.redirect(`${origin}/session`, {
      headers: redirectSecurityHeaders,
    })
    handoffResponse.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: handoffPayload.sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE,
    })
    handoffResponse.cookies.set({
      name: GOOGLE_PROFILE_COOKIE,
      value: handoffPayload.displayName,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE,
    })
    return handoffResponse
  }

  const cookieHeader = request.headers.get('cookie') || ''
  const cookieMatch = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${GOOGLE_OAUTH_COOKIE}=([^;]+)`)
  )
  const rawOAuthCookie = cookieMatch ? safeDecodeCookie(cookieMatch[1].trim()) : ''
  const [savedState = '', codeVerifier = '', , rawReturnOrigin = ''] = rawOAuthCookie.split('.')
  const decodedReturnOrigin = safeDecodeCookie(rawReturnOrigin)
  const targetOrigin =
    isAllowedOAuthReturnOrigin(decodedReturnOrigin) && decodedReturnOrigin !== origin
      ? decodedReturnOrigin
      : origin

  const oauthError = requestUrl.searchParams.get('error')
  if (oauthError) {
    return NextResponse.redirect(`${targetOrigin}/?error=google_cancelled`, {
      headers: redirectSecurityHeaders,
    })
  }

  const code = (requestUrl.searchParams.get('code') || '').trim()
  const state = (requestUrl.searchParams.get('state') || '').trim()
  if (!code || !state || code.length > 512 || state.length < 16 || state.length > 128) {
    return NextResponse.redirect(`${targetOrigin}/?error=google_auth_failed`, {
      headers: redirectSecurityHeaders,
    })
  }

  if (!savedState || !codeVerifier || savedState !== state) {
    return NextResponse.redirect(`${targetOrigin}/?error=google_auth_failed`, {
      headers: redirectSecurityHeaders,
    })
  }

  try {
    const redirectUri = `${origin}/api/auth/google/callback`
    const tokenParams = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    })

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: tokenParams.toString(),
      signal: AbortSignal.timeout(10_000),
    })

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${targetOrigin}/?error=google_auth_failed`, {
        headers: redirectSecurityHeaders,
      })
    }

    const tokenData = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string
    }
    const accessToken = typeof tokenData.access_token === 'string' ? tokenData.access_token.trim() : ''
    if (!accessToken) {
      return NextResponse.redirect(`${targetOrigin}/?error=google_auth_failed`, {
        headers: redirectSecurityHeaders,
      })
    }

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!profileRes.ok) {
      return NextResponse.redirect(`${targetOrigin}/?error=google_auth_failed`, {
        headers: redirectSecurityHeaders,
      })
    }

    const profile = (await profileRes.json().catch(() => ({}))) as {
      email?: string
      email_verified?: boolean
      name?: string
      given_name?: string
    }

    const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : ''
    if (!email || profile.email_verified === false) {
      return NextResponse.redirect(`${targetOrigin}/?error=google_auth_failed`, {
        headers: redirectSecurityHeaders,
      })
    }

    const sessionRes = await createOrUpdateOAuthSession(email)
    if (!sessionRes) {
      return NextResponse.redirect(`${targetOrigin}/?error=google_auth_failed`, {
        headers: redirectSecurityHeaders,
      })
    }

    const displayName = (
      profile.name ||
      profile.given_name ||
      email.split('@')[0] ||
      'Google User'
    )
      .trim()
      .slice(0, 80)

    let destinationUrl = `${origin}/session`
    if (targetOrigin !== origin) {
      const signedHandoff = await signOAuthHandoff(
        {
          sessionToken: sessionRes.sessionToken,
          displayName,
          exp: Date.now() + 30_000,
        },
        config.clientSecret
      )
      destinationUrl = `${targetOrigin}/api/auth/google/callback?handoff=${encodeURIComponent(signedHandoff)}`
    }

    const response = NextResponse.redirect(destinationUrl, {
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
      name: GOOGLE_PROFILE_COOKIE,
      value: displayName,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE,
    })

    response.cookies.set({
      name: GOOGLE_OAUTH_COOKIE,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })

    return response
  } catch {
    return NextResponse.redirect(`${targetOrigin}/?error=google_auth_failed`, {
      headers: redirectSecurityHeaders,
    })
  }
}
