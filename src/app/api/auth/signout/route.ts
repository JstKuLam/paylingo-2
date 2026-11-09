import { NextResponse } from 'next/server'
import { destroySession, AUTH_COOKIE_NAME } from '@/lib/auth/session'
import { GOOGLE_PROFILE_COOKIE } from '@/lib/auth/google-oauth'

export const runtime = 'edge'


const noStoreHeader = {
  'Cache-Control': 'no-store, max-age=0',
}

function safeDecodeURIComponent(val: string): string {
  try {
    return decodeURIComponent(val)
  } catch {
    return val
  }
}

export async function POST(request: Request) {
  try {
    let token: string | null = null
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim()
    } else {
      const cookieHeader = request.headers.get('cookie') || ''
      const match = cookieHeader.match(new RegExp(`(?:^|; )${AUTH_COOKIE_NAME}=([^;]*)`))
      token = match ? safeDecodeURIComponent(match[1]) : null
    }

    if (token) {
      await destroySession(token)
    }

    const response = NextResponse.json({ success: true }, {
      headers: noStoreHeader,
    })
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    response.cookies.set({
      name: GOOGLE_PROFILE_COOKIE,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })

    return response
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500, headers: noStoreHeader }
    )
  }
}
