import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Next.js 16 Proxy is Node-only. Keep the deprecated Middleware convention
// temporarily because Cloudflare Pages requires the Edge runtime.
export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg)$).*)',
  ],
}
