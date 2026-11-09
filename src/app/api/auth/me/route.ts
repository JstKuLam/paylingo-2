import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/session'
import { GOOGLE_PROFILE_COOKIE } from '@/lib/auth/google-oauth'

export const runtime = 'edge'

function safeDecodeProfileName(val: string): string {
  let out = val.trim()
  for (let i = 0; i < 3; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(out)) break
    try {
      const next = decodeURIComponent(out)
      if (next === out) break
      out = next
    } catch {
      break
    }
  }
  return out.trim().slice(0, 80)
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user || user.email.toLowerCase().endsWith('@paylingo.app')) {
      return NextResponse.json(
        { user: null, authenticated: false },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    const cookieHeader = request.headers.get('cookie') || ''
    const profileMatch = cookieHeader.match(
      new RegExp(`(?:^|;\\s*)${GOOGLE_PROFILE_COOKIE}=([^;]+)`)
    )
    const profileName = profileMatch ? safeDecodeProfileName(profileMatch[1]) : ''
    const fallbackName = profileName || user.email.split('@')[0] || 'User'

    return NextResponse.json(
      {
        user: {
          ...user,
          user_metadata: {
            username: fallbackName,
            full_name: fallbackName,
            name: fallbackName,
          },
        },
        authenticated: true,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    )
  } catch {
    return NextResponse.json(
      { user: null, authenticated: false, error: 'Failed to authenticate user' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    )
  }
}
