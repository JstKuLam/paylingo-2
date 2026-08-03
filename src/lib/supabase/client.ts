import { createBrowserClient } from '@supabase/ssr'
import { AUTH_COOKIE_OPTIONS } from './auth-config'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
      cookieOptions: AUTH_COOKIE_OPTIONS,
    }
  )
}
