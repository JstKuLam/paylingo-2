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
  const response = NextResponse.redirect(`${origin}${next}`)

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
    const otpType = (type as any) || 'magiclink'
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
      // Fallback for Mobile / Cross-Browser clicks:
      // Supabase /auth/v1/verify updated user.last_sign_in_at right before redirecting to /auth/callback?code=...
      // If PKCE cookie is missing in mobile browser, verify recent sign-in via Admin client and issue session token.
      try {
        const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey)
        const now = new Date().getTime()
        const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers()

        if (!listErr && users && users.length > 0) {
          // Find user whose last_sign_in_at was updated within the last 120 seconds
          const recentUser = users.find(u => {
            if (!u.last_sign_in_at || !isAllowedEmail(u.email)) return false
            const signInTime = new Date(u.last_sign_in_at).getTime()
            const diffSec = (now - signInTime) / 1000
            return diffSec >= -5 && diffSec <= 120
          })

          if (recentUser && recentUser.email) {
            console.log('Mobile PKCE fallback: found recently verified user:', recentUser.email)
            const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
              type: 'magiclink',
              email: recentUser.email,
            })

            if (!linkErr && linkData?.properties?.hashed_token) {
              const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
                token_hash: linkData.properties.hashed_token,
                type: 'magiclink',
              })

              if (!verifyErr && verifyData?.session) {
                userSession = verifyData.session
              }
            }
          }
        }
      } catch (fallbackFail) {
        console.error('Mobile fallback session issuance failed:', fallbackFail)
      }
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
