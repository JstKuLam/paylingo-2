import { NextResponse } from 'next/server'
import { verifyMagicToken, AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE } from '@/lib/auth/session'

export const runtime = 'edge'


function safeNextPath(nextParam: string | null): string {
  if (!nextParam || !nextParam.startsWith('/') || nextParam.startsWith('//')) {
    return '/session'
  }
  return nextParam
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const token =
    requestUrl.searchParams.get('token') ||
    requestUrl.searchParams.get('token_hash') ||
    requestUrl.searchParams.get('code') ||
    requestUrl.searchParams.get('otp')
  const nextParam = requestUrl.searchParams.get('next')
  const targetPath = safeNextPath(nextParam)

  const origin = requestUrl.origin

  if (!token) {
    return NextResponse.redirect(`${origin}/?error=missing_token`)
  }

  // verifyOtp / exchangeCodeForSession logic via D1 verifyMagicToken
  const sessionRes = await verifyMagicToken(token)
  if (!sessionRes) {
    return NextResponse.redirect(`${origin}/?error=invalid_or_expired_token`)
  }

  const targetUrl = new URL(targetPath, origin)
  const response = NextResponse.redirect(targetUrl.toString())

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
