import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/session'

export const runtime = 'edge'


export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    return NextResponse.json({
      user: user || null,
      authenticated: !!user,
    })
  } catch (err: any) {
    return NextResponse.json({ user: null, authenticated: false, error: err?.message }, { status: 500 })
  }
}
