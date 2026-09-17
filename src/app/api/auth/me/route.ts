import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/session'

export const runtime = 'edge'


export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    return NextResponse.json({
      user: user || null,
      authenticated: !!user,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
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
