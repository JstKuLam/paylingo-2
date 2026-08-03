import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isAllowedEmail } from '@/lib/auth-utils'
import { AUTH_COOKIE_OPTIONS } from '@/lib/supabase/auth-config'

export const runtime = 'edge'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://plokbhbcegrpxiczthvc.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'REDACTED_SUPABASE_LEGACY_PUBLISHABLE_ANON_KEY_'

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/session'
  return value
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const { searchParams } = requestUrl
  const origin = process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === 'development' ? requestUrl.origin : 'https://noidi.9phut.org')
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = safeNextPath(searchParams.get('next'))

  const cookieStore = await cookies()
  const response = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
              response.cookies.set(name, value, options)
            })
          } catch {
            // Handled in server environment
          }
        },
      },
    }
  )

  let userSession = null

  // 1. Try verifyOtp via token_hash FIRST (direct magic link, works cross-device and on mobile)
  if (token_hash) {
    const otpType =
      type === 'signup' ||
      type === 'invite' ||
      type === 'magiclink' ||
      type === 'recovery' ||
      type === 'email_change' ||
      type === 'email'
        ? type
        : 'magiclink'
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: otpType })
    if (!error && data?.session) {
      userSession = data.session
    } else if (error) {
      console.warn('verifyOtp with token_hash failed:', error.message)
    }
  }

  // 2. Try exchanging code via SSR client (PKCE flow)
  if (!userSession && code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data?.session) {
      userSession = data.session
    } else if (error) {
      console.warn('SSR exchangeCodeForSession failed:', error.message)
    }
  }

  // 3. Check userSession authorization
  if (userSession?.user) {
    const email = userSession.user.email
    const isAllowed = isAllowedEmail(email)

    if (!isAllowed) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/?error=domain_restricted`)
    }
    return response
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`)
}
