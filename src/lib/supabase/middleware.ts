import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIE_OPTIONS } from './auth-config'
import { isAllowedEmail } from '../auth-utils'

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.soniox.com wss://stt-rt.soniox.com; upgrade-insecure-requests",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self), payment=(), usb=()',
}

function applySecurityHeaders(response: NextResponse) {
  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => response.headers.set(name, value))
  return response
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://plokbhbcegrpxiczthvc.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'REDACTED_SUPABASE_LEGACY_PUBLISHABLE_ANON_KEY_'

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh auth token if expired - required for Server Components & Pages
  const { data: { user } } = await supabase.auth.getUser()

  const protectsUserData = request.nextUrl.pathname === '/session' ||
    request.nextUrl.pathname.startsWith('/history')
  if (protectsUserData && (!user?.email || !user.email_confirmed_at || !isAllowedEmail(user.email))) {
    if (user) await supabase.auth.signOut()
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.search = '?error=unauthorized'
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
    return applySecurityHeaders(redirectResponse)
  }

  return applySecurityHeaders(supabaseResponse)
}
