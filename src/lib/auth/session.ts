import { getD1 } from '../d1-client'
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
 * Creates a magic token and 6-digit OTP for email login.
 */
export async function createMagicToken(email: string): Promise<{ token: string; otp: string }> {
  const db = getD1()
  const sanitizedEmail = email.trim().toLowerCase()
  const token = crypto.randomUUID()
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  
  // 15 minutes expiration
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  // Clean up old tokens for this email
  await db.prepare('DELETE FROM auth_tokens WHERE email = ? OR expires_at < datetime(\'now\')')
    .bind(sanitizedEmail)
    .run()

  // Insert magic link token and OTP
  await db.prepare('INSERT INTO auth_tokens (token, email, expires_at, created_at) VALUES (?, ?, ?, datetime(\'now\'))')
    .bind(token, sanitizedEmail, expiresAt)
    .run()

  await db.prepare('INSERT INTO auth_tokens (token, email, expires_at, created_at) VALUES (?, ?, ?, datetime(\'now\'))')
    .bind(otp, sanitizedEmail, expiresAt)
    .run()

  return { token, otp }
}

/**
 * Verifies a magic token or OTP code, issues a long-lived user session.
 */
export async function verifyMagicToken(tokenOrOtp: string): Promise<AuthSessionResult | null> {
  const db = getD1()
  const cleanInput = tokenOrOtp.trim()

  const record = await db.prepare(
    'SELECT * FROM auth_tokens WHERE token = ? AND expires_at > datetime(\'now\')'
  )
    .bind(cleanInput)
    .first<{ token: string; email: string; expires_at: string }>()

  if (!record) return null

  // Delete used tokens for this email
  await db.prepare('DELETE FROM auth_tokens WHERE email = ?').bind(record.email).run()

  // Find or create user
  let user = await db.prepare('SELECT * FROM auth_users WHERE lower(email) = lower(?)')
    .bind(record.email)
    .first<AuthUser>()

  const nowIso = new Date().toISOString()

  if (!user) {
    const newUserId = crypto.randomUUID()
    await db.prepare(
      'INSERT INTO auth_users (id, email, email_confirmed_at, created_at) VALUES (?, ?, ?, ?)'
    )
      .bind(newUserId, record.email, nowIso, nowIso)
      .run()

    user = {
      id: newUserId,
      email: record.email,
      email_confirmed_at: nowIso,
      created_at: nowIso,
    }
  } else if (!user.email_confirmed_at) {
    await db.prepare('UPDATE auth_users SET email_confirmed_at = ? WHERE id = ?')
      .bind(nowIso, user.id)
      .run()
    user.email_confirmed_at = nowIso
  }

  // Create session
  const sessionToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`
  const sessionExpiresAt = new Date(Date.now() + AUTH_COOKIE_MAX_AGE * 1000).toISOString()
  const sessionId = crypto.randomUUID()

  await db.prepare(
    'INSERT INTO auth_sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(sessionId, user.id, sessionToken, sessionExpiresAt, nowIso)
    .run()

  return {
    user,
    sessionToken,
    expiresAt: sessionExpiresAt,
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
        token = decodeURIComponent(match[1])
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
        token = decodeURIComponent(match[1])
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

  if (!token) return null

  const row = await db.prepare(`
    SELECT u.id, u.email, u.email_confirmed_at, u.created_at
    FROM auth_sessions s
    JOIN auth_users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `)
    .bind(token)
    .first<AuthUser>()

  return row || null
}

/**
 * Destroys an active session.
 */
export async function destroySession(token: string): Promise<boolean> {
  const db = getD1()
  const res = await db.prepare('DELETE FROM auth_sessions WHERE token = ?').bind(token).run()
  return res.success
}
