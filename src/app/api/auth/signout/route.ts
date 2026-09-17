import { NextResponse } from 'next/server'
import { destroySession, AUTH_COOKIE_NAME } from '@/lib/auth/session'

export const runtime = 'edge'


export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || ''
    const match = cookieHeader.match(new RegExp(`(?:^|; )${AUTH_COOKIE_NAME}=([^;]*)`))
    const token = match ? decodeURIComponent(match[1]) : null

    if (token) {
      await destroySession(token)
    }

    const response = NextResponse.json({ success: true }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
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

    return response
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
