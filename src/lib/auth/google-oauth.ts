import { getD1 } from '../d1-client'
import { decryptAiKey } from '../ai-security'

export const GOOGLE_OAUTH_COOKIE = 'paylingo_google_oauth'
export const GOOGLE_PROFILE_COOKIE = 'paylingo_sso_profile'
export const CANONICAL_OAUTH_ORIGIN = 'https://paylingo.pages.dev'

const ALLOWED_OAUTH_RETURN_ORIGINS = new Set([
  'https://noidi.9phut.org',
  'https://paylingo.pages.dev',
])

export function isAllowedOAuthReturnOrigin(origin: string | null | undefined): origin is string {
  if (!origin || typeof origin !== 'string') return false
  return ALLOWED_OAUTH_RETURN_ORIGINS.has(origin.trim())
}

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
}

export interface OAuthHandoffPayload {
  sessionToken: string
  displayName: string
  exp: number
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array | null {
  try {
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

export async function signOAuthHandoff(
  payload: OAuthHandoffPayload,
  secret: string
): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const payloadB64 = base64UrlEncode(payloadBytes)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`paylingo-oauth-handoff-v1:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(sig))}`
}

export async function verifyOAuthHandoff(
  token: string,
  secret: string
): Promise<OAuthHandoffPayload | null> {
  if (!token || typeof token !== 'string' || token.length > 1024) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts
  const sigBytes = base64UrlDecode(sigB64)
  const payloadBytes = base64UrlDecode(payloadB64)
  if (!sigBytes || !payloadBytes) return null

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(`paylingo-oauth-handoff-v1:${secret}`),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer,
      new TextEncoder().encode(payloadB64)
    )
    if (!valid) return null

    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<OAuthHandoffPayload>
    if (
      !parsed ||
      typeof parsed.sessionToken !== 'string' ||
      parsed.sessionToken.length < 10 ||
      parsed.sessionToken.length > 256 ||
      typeof parsed.displayName !== 'string' ||
      typeof parsed.exp !== 'number' ||
      !Number.isFinite(parsed.exp) ||
      Date.now() > parsed.exp
    ) {
      return null
    }
    return {
      sessionToken: parsed.sessionToken,
      displayName: parsed.displayName.slice(0, 80),
      exp: parsed.exp,
    }
  } catch {
    return null
  }
}

export function generateOAuthState(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function generatePkcePair(): Promise<{
  codeVerifier: string
  codeChallenge: string
}> {
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  const codeVerifier = base64UrlEncode(randomBytes)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier)
  )
  const codeChallenge = base64UrlEncode(new Uint8Array(digest))
  return { codeVerifier, codeChallenge }
}

export async function getGoogleOAuthConfig(): Promise<GoogleOAuthConfig | null> {
  const envClientId = (
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    ''
  ).trim()
  const envClientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim()

  if (envClientId && envClientSecret) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
    }
  }

  try {
    const db = getD1()
    const row = await db
      .prepare('SELECT endpoint, api_key FROM api_settings WHERE key = ?')
      .bind('google_oauth')
      .first<{ endpoint?: string | null; api_key?: string | null }>()

    const dbClientId = (row?.endpoint || envClientId || '').trim()
    const rawSecret = row?.api_key ? await decryptAiKey(row.api_key) : envClientSecret
    const dbClientSecret = (rawSecret || '').trim()
    if (dbClientId && dbClientSecret) {
      return {
        clientId: dbClientId,
        clientSecret: dbClientSecret,
      }
    }
  } catch {
    // Fallback if D1 table is unavailable
  }

  return null
}
