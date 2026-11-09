import { getD1 } from '../d1-client'
import { decryptAiKey } from '../ai-security'

export const GOOGLE_OAUTH_COOKIE = 'paylingo_google_oauth'
export const GOOGLE_PROFILE_COOKIE = 'paylingo_sso_profile'

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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
