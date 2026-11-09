import { NextResponse } from 'next/server'
import { AUTH_COOKIE_MAX_AGE, AUTH_COOKIE_NAME, getAuthenticatedUser } from '@/lib/auth/session'
import { GOOGLE_PROFILE_COOKIE } from '@/lib/auth/google-oauth'
import { getD1 } from '@/lib/d1-client'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

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

async function computeDeviceTag(deviceSecret: string): Promise<string> {
  const bytes = new TextEncoder().encode(`paylingo-device-v1:${deviceSecret}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

export async function POST(request: Request) {
  const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }
  try {
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type phải là application/json' },
        { status: 415, headers: noStoreHeader }
      )
    }

    const ipLimit = checkRateLimit({
      key: `profile-session-ip:${getRequestIp(request)}`,
      limit: 60,
      windowMs: 15 * 60_000,
    })
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterSeconds)

    const body = (await request.json().catch(() => ({}))) as {
      name?: string
      userId?: string
      deviceSecret?: string
    }
    const rawName = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    if (!rawName) {
      return NextResponse.json({ error: 'Vui lòng nhập tên của bạn' }, { status: 400, headers: noStoreHeader })
    }

    const rawDeviceSecret =
      typeof body.deviceSecret === 'string' && body.deviceSecret.trim().length >= 16
        ? body.deviceSecret.trim().slice(0, 128)
        : ''
    const deviceTag = rawDeviceSecret ? await computeDeviceTag(rawDeviceSecret) : ''

    const db = getD1()
    const nowIso = new Date().toISOString()
    const slug = rawName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 24) || 'user'

    const existingUser = await getAuthenticatedUser(request)
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const requestedUserId =
      typeof body.userId === 'string' && uuidV4Regex.test(body.userId) ? body.userId : ''

    let userId = ''
    let rotated = false
    let userRecord: { id: string; email: string; email_confirmed_at?: string | null; created_at: string } | null = null

    const requestedRecord = requestedUserId
      ? await db
          .prepare('SELECT * FROM auth_users WHERE id = ?')
          .bind(requestedUserId)
          .first<{ id: string; email: string; email_confirmed_at?: string | null; created_at: string }>()
      : null

    const isSameAuthenticatedCookie = Boolean(
      existingUser && requestedRecord && existingUser.id === requestedRecord.id
    )
    const requestedEmailLower = requestedRecord?.email.toLowerCase() || ''
    const requestedBoundTagMatch = requestedEmailLower.match(/\.([0-9a-f]{16})@paylingo\.app$/)
    const hasMatchingDeviceTag =
      Boolean(deviceTag) && Boolean(requestedBoundTagMatch) && requestedBoundTagMatch![1] === deviceTag

    if (requestedRecord && (isSameAuthenticatedCookie || hasMatchingDeviceTag)) {
      // 1. requestedUserId exists in D1 and is proven by either matching cookie or matching deviceTag
      userId = requestedRecord.id
      userRecord = requestedRecord
      if (
        isSameAuthenticatedCookie &&
        deviceTag &&
        !requestedBoundTagMatch &&
        requestedEmailLower.endsWith('@paylingo.app')
      ) {
        const upgradedEmail = `${slug}.${userRecord.id.slice(0, 8).toLowerCase()}.${deviceTag}@paylingo.app`
        await db
          .prepare('UPDATE auth_users SET email = ? WHERE id = ?')
          .bind(upgradedEmail, userRecord.id)
          .run()
          .catch(() => {})
        userRecord.email = upgradedEmail
      }
    } else if (existingUser) {
      // 2. Valid session cookie exists (e.g. Safari ITP cleared localStorage/IndexedDB while 30-day HttpOnly cookie survived)
      userId = existingUser.id
      userRecord = existingUser
      rotated = Boolean(requestedUserId && requestedUserId !== existingUser.id)
      if (deviceTag && existingUser.email.toLowerCase().endsWith('@paylingo.app')) {
        const reboundEmail = `${slug}.${userRecord.id.slice(0, 8).toLowerCase()}.${deviceTag}@paylingo.app`
        if (reboundEmail !== userRecord.email.toLowerCase()) {
          await db
            .prepare('UPDATE auth_users SET email = ? WHERE id = ?')
            .bind(reboundEmail, userRecord.id)
            .run()
            .catch(() => {})
          userRecord.email = reboundEmail
        }
      }
    } else if (requestedRecord) {
      // 3. requestedUserId exists in D1 but caller cannot prove ownership -> rotate to a fresh UUID
      userId = crypto.randomUUID()
      userRecord = null
      rotated = true
    } else {
      // 4. Brand-new user (requestedUserId not in D1 and no cookie)
      userId = requestedUserId || crypto.randomUUID()
      userRecord = null
      rotated = false
    }

    if (!userRecord) {
      const tagSuffix = deviceTag ? `.${deviceTag}` : `.${crypto.randomUUID().slice(0, 8)}`
      const syntheticEmail = `${slug}.${userId.slice(0, 8).toLowerCase()}${tagSuffix}@paylingo.app`
      try {
        await db
          .prepare('INSERT INTO auth_users (id, email, email_confirmed_at, created_at) VALUES (?, ?, ?, ?)')
          .bind(userId, syntheticEmail, nowIso, nowIso)
          .run()
        userRecord = {
          id: userId,
          email: syntheticEmail,
          email_confirmed_at: nowIso,
          created_at: nowIso,
        }
      } catch {
        userId = crypto.randomUUID()
        const fallbackEmail = `${slug}.${userId.slice(0, 8).toLowerCase()}${tagSuffix}@paylingo.app`
        await db
          .prepare('INSERT INTO auth_users (id, email, email_confirmed_at, created_at) VALUES (?, ?, ?, ?)')
          .bind(userId, fallbackEmail, nowIso, nowIso)
          .run()
        userRecord = {
          id: userId,
          email: fallbackEmail,
          email_confirmed_at: nowIso,
          created_at: nowIso,
        }
      }
    }

    const sessionToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`
    const sessionExpiresAt = new Date(Date.now() + AUTH_COOKIE_MAX_AGE * 1000).toISOString()
    await db
      .prepare('INSERT INTO auth_sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userRecord.id, sessionToken, sessionExpiresAt, nowIso)
      .run()

    const response = NextResponse.json(
      {
        user: {
          ...userRecord,
          user_metadata: {
            username: rawName,
            full_name: rawName,
            name: rawName,
          },
        },
        authenticated: true,
        rotated,
      },
      { headers: noStoreHeader }
    )

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE,
    })

    return response
  } catch {
    return NextResponse.json(
      { user: null, authenticated: false, error: 'Failed to authenticate user' },
      { status: 500, headers: noStoreHeader }
    )
  }
}
