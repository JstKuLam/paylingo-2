import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE_NAME } from '@/lib/auth/session'

export async function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get(AUTH_COOKIE_NAME)?.value?.trim()
  const hasValidTokenShape = Boolean(
    sessionToken && sessionToken.length >= 10 && sessionToken.length <= 256
  )

  // If accessing root "/" and already authenticated, redirect to /session (unless error/signout param is present)
  if (
    request.nextUrl.pathname === '/' &&
    hasValidTokenShape &&
    !request.nextUrl.searchParams.has('error') &&
    !request.nextUrl.searchParams.has('signout')
  ) {
    return NextResponse.redirect(new URL('/session', request.url), {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Frame-Options': 'DENY',
      },
    })
  }

  const response = NextResponse.next()
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  return response
}

export const config = {
  matcher: [
    '/',
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg)$).*)',
  ],
}
