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

function generateSecureOtp(): string {
  const array = new Uint32Array(1)
  const range = 900_000
  const maxValid = 0xFFFFFFFF - (0xFFFFFFFF % range)
  let val: number
  do {
    crypto.getRandomValues(array)
    val = array[0]
  } while (val >= maxValid)
  return (100_000 + (val % range)).toString()
}

/**
 * Creates a magic token and 6-digit OTP for email login.
 */
export async function createMagicToken(email: string): Promise<{ token: string; otp: string }> {
  const db = getD1()
  const sanitizedEmail = email.trim().toLowerCase()
  const token = crypto.randomUUID()
  const otp = generateSecureOtp()
  
  // 15 minutes expiration
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  // Clean up old tokens for this email and insert magic link token and email-scoped OTP atomically
  const scopedOtpToken = `otp:${sanitizedEmail}:${otp}`
  await db.batch([
    db.prepare('DELETE FROM auth_tokens WHERE email = ? OR datetime(expires_at) < datetime(\'now\')').bind(sanitizedEmail),
    db.prepare('INSERT OR REPLACE INTO auth_tokens (token, email, expires_at, created_at) VALUES (?, ?, ?, datetime(\'now\'))').bind(token, sanitizedEmail, expiresAt),
    db.prepare('INSERT OR REPLACE INTO auth_tokens (token, email, expires_at, created_at) VALUES (?, ?, ?, datetime(\'now\'))').bind(scopedOtpToken, sanitizedEmail, expiresAt),
  ])

  return { token, otp }
}

/**
 * Verifies a magic token or OTP code, issues a long-lived user session.
 */
export async function verifyMagicToken(tokenOrOtp: string, expectedEmail?: string): Promise<AuthSessionResult | null> {
  if (!tokenOrOtp || typeof tokenOrOtp !== 'string') return null
  const cleanInput = tokenOrOtp.trim()
  if (cleanInput.length < 6 || cleanInput.length > 128) return null
  const cleanEmail = typeof expectedEmail === 'string' && expectedEmail.trim()
    ? expectedEmail.trim().toLowerCase()
    : null

  // Short 6-digit OTPs MUST bind to the requesting email to prevent cross-account OTP collisions
  if (cleanInput.length === 6 && !cleanEmail) {
    return null
  }
  if (cleanInput.length !== 6 && cleanInput.length < 32) {
    return null
  }
  const lookupToken = cleanInput.length === 6 && cleanEmail ? `otp:${cleanEmail}:${cleanInput}` : cleanInput

  const db = getD1()

  const record = cleanEmail
    ? await db.prepare(
        'SELECT * FROM auth_tokens WHERE token = ? AND lower(email) = lower(?) AND datetime(expires_at) > datetime(\'now\')'
      )
        .bind(lookupToken, cleanEmail)
        .first<{ token: string; email: string; expires_at: string }>()
    : await db.prepare(
        'SELECT * FROM auth_tokens WHERE token = ? AND datetime(expires_at) > datetime(\'now\')'
      )
        .bind(lookupToken)
        .first<{ token: string; email: string; expires_at: string }>()

  if (!record || !isAllowedEmail(record.email)) return null

  // Atomically delete token and verify changes > 0 to prevent concurrent replay race conditions
  const deleteRes = await db.prepare('DELETE FROM auth_tokens WHERE token = ?').bind(lookupToken).run()
  if (!deleteRes.success || (deleteRes.meta && deleteRes.meta.changes === 0)) {
    return null
  }

  // Delete any other tokens for this email
  await db.prepare('DELETE FROM auth_tokens WHERE email = ?').bind(record.email).run()

  // Find or create user
  let user = await db.prepare('SELECT * FROM auth_users WHERE lower(email) = lower(?)')
    .bind(record.email)
    .first<AuthUser>()

  const nowIso = new Date().toISOString()

  if (!user) {
    const newUserId = crypto.randomUUID()
    try {
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
    } catch {
      // Concurrently inserted by parallel request
      user = await db.prepare('SELECT * FROM auth_users WHERE lower(email) = lower(?)')
        .bind(record.email)
        .first<AuthUser>()
    }
  } else if (!user.email_confirmed_at) {
    await db.prepare('UPDATE auth_users SET email_confirmed_at = ? WHERE id = ?')
      .bind(nowIso, user.id)
      .run()
    user.email_confirmed_at = nowIso
  }

  if (!user) return null

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
 * Finds or creates a user from a verified OAuth provider (e.g. Google SSO)
 * and issues a 30-day authenticated session in D1.
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

  await db
    .prepare(
      'INSERT INTO auth_sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(sessionId, user.id, sessionToken, sessionExpiresAt, nowIso)
    .run()

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
