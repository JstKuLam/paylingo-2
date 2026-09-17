import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE_NAME } from '@/lib/auth/session'

export async function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get(AUTH_COOKIE_NAME)?.value

  // If accessing root "/" and already authenticated, redirect to /session (unless error/signout param is present)
  if (
    request.nextUrl.pathname === '/' &&
    sessionToken &&
    !request.nextUrl.searchParams.has('error') &&
    !request.nextUrl.searchParams.has('signout')
  ) {
    return NextResponse.redirect(new URL('/session', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg)$).*)',
  ],
}
