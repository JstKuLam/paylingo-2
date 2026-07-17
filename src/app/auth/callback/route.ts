import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/session'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data?.session?.user) {
      const email = data.session.user.email
      // Enforce @pay2pay.vn domain in production, allow any in development
      const isAllowedDomain = email?.toLowerCase().endsWith('@pay2pay.vn') || process.env.NODE_ENV === 'development'

      if (!isAllowedDomain) {
        // Sign out immediately to clear cookies
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/?error=domain_restricted`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`)
}
