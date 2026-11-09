import { getD1 } from '../d1-client'
import { isAllowedEmail } from '../auth-utils'
import { cookies } from 'next/headers'

export const AUTH_COOKIE_NAME = 'paylingo_auth_session'
export const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

export interface AuthUser {
  id: string
  email: string
  email_confirmed_at?: string | null
  created_at: string
}

export interface AuthSessionResult {
  user: AuthUser
  sessionToken: string
  expiresAt: string
}

/**
 * Finds or creates a user from a verified OAuth provider (e.g. Google SSO)
 * and issues a 30-day authenticated session in D1 while purging expired sessions.
 */
export async function createOrUpdateOAuthSession(
  rawEmail: string
): Promise<(AuthSessionResult & { isNewUser: boolean }) | null> {
  if (!rawEmail || typeof rawEmail !== 'string') return null
  const cleanEmail = rawEmail.trim().toLowerCase()
  if (!isAllowedEmail(cleanEmail)) return null

  const db = getD1()
  let user = await db
    .prepare('SELECT * FROM auth_users WHERE lower(email) = lower(?)')
    .bind(cleanEmail)
    .first<AuthUser>()

  const nowIso = new Date().toISOString()
  let isNewUser = false

  if (!user) {
    isNewUser = true
    const newUserId = crypto.randomUUID()
    try {
      await db
        .prepare(
          'INSERT INTO auth_users (id, email, email_confirmed_at, created_at) VALUES (?, ?, ?, ?)'
        )
        .bind(newUserId, cleanEmail, nowIso, nowIso)
        .run()

      user = {
        id: newUserId,
        email: cleanEmail,
        email_confirmed_at: nowIso,
        created_at: nowIso,
      }
    } catch {
      isNewUser = false
      user = await db
        .prepare('SELECT * FROM auth_users WHERE lower(email) = lower(?)')
        .bind(cleanEmail)
        .first<AuthUser>()
    }
  } else if (!user.email_confirmed_at) {
    await db
      .prepare('UPDATE auth_users SET email_confirmed_at = ? WHERE id = ?')
      .bind(nowIso, user.id)
      .run()
    user.email_confirmed_at = nowIso
  }

  if (!user) return null

  const sessionToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`
  const sessionExpiresAt = new Date(Date.now() + AUTH_COOKIE_MAX_AGE * 1000).toISOString()
  const sessionId = crypto.randomUUID()

  await db.batch([
    db.prepare('DELETE FROM auth_sessions WHERE datetime(expires_at) < datetime(\'now\')'),
    db
      .prepare(
        'INSERT INTO auth_sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(sessionId, user.id, sessionToken, sessionExpiresAt, nowIso),
  ])

  return {
    user,
    sessionToken,
    expiresAt: sessionExpiresAt,
    isNewUser,
  }
}

function safeDecodeURIComponent(val: string): string {
  try {
    return decodeURIComponent(val)
  } catch {
    return val
  }
}

/**
 * Extracts and verifies the authenticated user from request cookies or Authorization header.
 */
export async function getAuthenticatedUser(
  requestOrHeaders?: Request | Headers | string | null
): Promise<AuthUser | null> {
  const db = getD1()
  let token: string | null = null

  if (typeof requestOrHeaders === 'string') {
    token = requestOrHeaders
  } else if (requestOrHeaders instanceof Request) {
    const authHeader = requestOrHeaders.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim()
    } else {
      const cookieHeader = requestOrHeaders.headers.get('cookie') || ''
      const match = cookieHeader.match(new RegExp(`(?:^|; )${AUTH_COOKIE_NAME}=([^;]*)`))
      if (match) {
        token = safeDecodeURIComponent(match[1])
      }
    }
  } else if (requestOrHeaders instanceof Headers) {
    const authHeader = requestOrHeaders.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim()
    } else {
      const cookieHeader = requestOrHeaders.get('cookie') || ''
      const match = cookieHeader.match(new RegExp(`(?:^|; )${AUTH_COOKIE_NAME}=([^;]*)`))
      if (match) {
        token = safeDecodeURIComponent(match[1])
      }
    }
  } else {
    try {
      const cookieStore = await cookies()
      token = cookieStore.get(AUTH_COOKIE_NAME)?.value || null
    } catch {
      token = null
    }
  }

  if (!token || typeof token !== 'string') return null
  const cleanToken = token.trim()
  if (cleanToken.length < 10 || cleanToken.length > 256) return null

  const row = await db.prepare(`
    SELECT u.id, u.email, u.email_confirmed_at, u.created_at
    FROM auth_sessions s
    JOIN auth_users u ON s.user_id = u.id
    WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
  `)
    .bind(cleanToken)
    .first<AuthUser>()

  return row || null
}

/**
 * Destroys an active session and purges expired sessions.
 */
export async function destroySession(token: string): Promise<boolean> {
  if (!token || typeof token !== 'string') return false
  const cleanToken = token.trim()
  if (!cleanToken) return false

  const db = getD1()
  const res = await db.prepare('DELETE FROM auth_sessions WHERE token = ? OR datetime(expires_at) < datetime(\'now\')').bind(cleanToken).run()
  return res.success
}
