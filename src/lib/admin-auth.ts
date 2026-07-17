import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'

const ENCODER = new TextEncoder()
const DEFAULT_PASSWORD = 'hoilamgi229@'
const SESSION_COOKIE_NAME = 'admin_session'
const SIGNING_SALT = 'paylingo_admin_salt_2026'

export async function hashPassword(password: string): Promise<string> {
  const data = ENCODER.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function createSessionToken(passwordHash: string, maxAgeSeconds = 86400 * 7): Promise<string> {
  const expiresAt = Date.now() + maxAgeSeconds * 1000
  const data = `${expiresAt}`
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(passwordHash + SIGNING_SALT),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    keyMaterial,
    ENCODER.encode(data)
  )
  const hashArray = Array.from(new Uint8Array(signature))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  
  return `${data}.${hashHex}`
}

export async function verifySessionToken(token: string, passwordHash: string): Promise<boolean> {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return false
    const [expiresAtStr, sig] = parts
    const expiresAt = parseInt(expiresAtStr, 10)
    
    if (isNaN(expiresAt) || expiresAt < Date.now()) return false
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      ENCODER.encode(passwordHash + SIGNING_SALT),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign(
      'HMAC',
      keyMaterial,
      ENCODER.encode(expiresAtStr)
    )
    const hashArray = Array.from(new Uint8Array(signature))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    return hashHex === sig
  } catch {
    return false
  }
}

export async function getAdminCredentials() {
  const adminSupa = createAdminClient()
  const { data, error } = await adminSupa
    .from('api_settings')
    .select('*')
    .eq('key', 'admin_auth')
    .single()
    
  if (error || !data) {
    const defaultHash = await hashPassword(DEFAULT_PASSWORD)
    return {
      passwordHash: defaultHash,
      passkeyEnabled: false,
      passkeySpki: '',
      passkeyCredId: ''
    }
  }
  
  return {
    passwordHash: data.api_key,
    passkeyEnabled: data.provider === 'passkey_enabled',
    passkeySpki: data.endpoint || '',
    passkeyCredId: data.model || ''
  }
}

export async function saveAdminCredentials(hash: string, passkeySpki = '', passkeyCredId = '', passkeyEnabled = false) {
  const adminSupa = createAdminClient()
  const { error } = await adminSupa
    .from('api_settings')
    .upsert({
      key: 'admin_auth',
      api_key: hash,
      endpoint: passkeySpki,
      model: passkeyCredId,
      provider: passkeyEnabled ? 'passkey_enabled' : 'passkey_disabled',
      updated_at: new Date().toISOString()
    })
  return !error
}

export async function checkAdminSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return false
  
  const creds = await getAdminCredentials()
  return await verifySessionToken(token, creds.passwordHash)
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

export async function verifyPasskeyAssertion(
  clientDataJSONBase64: string,
  authenticatorDataBase64: string,
  signatureBase64: string,
  spkiBase64: string
): Promise<boolean> {
  try {
    const spki = base64ToArrayBuffer(spkiBase64)
    const authData = base64ToArrayBuffer(authenticatorDataBase64)
    const clientDataJSON = base64ToArrayBuffer(clientDataJSONBase64)
    const signature = base64ToArrayBuffer(signatureBase64)

    const clientDataHash = await crypto.subtle.digest('SHA-256', clientDataJSON)

    const concat = new Uint8Array(authData.byteLength + clientDataHash.byteLength)
    concat.set(new Uint8Array(authData), 0)
    concat.set(new Uint8Array(clientDataHash), authData.byteLength)

    const key = await crypto.subtle.importKey(
      'spki',
      spki,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
    
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      signature,
      concat
    )
  } catch (err) {
    console.error('Failed to verify passkey signature:', err)
    return false
  }
}
