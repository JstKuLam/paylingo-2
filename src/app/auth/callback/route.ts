import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { isAllowedEmail } from '@/lib/auth-utils'

export const runtime = 'edge'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://plokbhbcegrpxiczthvc.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'REDACTED_SUPABASE_LEGACY_PUBLISHABLE_ANON_KEY_'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'REDACTED_SUPABASE_LEGACY_SERVICE_ROLE_KEY'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/session'

  const cookieStore = await cookies()
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
          }
        },
      },
    }
  )

  let userSession = null

  // 1. Try exchanging code via SSR client
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data?.session) {
      userSession = data.session
    } else if (error) {
      console.warn('SSR exchangeCodeForSession failed, trying admin fallback:', error.message)
      // Fallback: try exchanging code via Admin client if PKCE cookie is missing (cross-device/browser click)
      try {
        const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey)
        const { data: adminData, error: adminErr } = await supabaseAdmin.auth.exchangeCodeForSession(code)
        if (!adminErr && adminData?.session) {
          userSession = adminData.session
          // Set session on SSR client so cookies are written to browser
          await supabase.auth.setSession({
            access_token: adminData.session.access_token,
            refresh_token: adminData.session.refresh_token,
          })
        }
      } catch (adminFail) {
        console.error('Admin code exchange failed:', adminFail)
      }
    }
  }

  // 2. Try verifyOtp via token_hash if code failed or token_hash present
  if (!userSession && token_hash) {
    const otpType = (type as any) || 'magiclink'
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: otpType })
    if (!error && data?.session) {
      userSession = data.session
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
    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`)
}
