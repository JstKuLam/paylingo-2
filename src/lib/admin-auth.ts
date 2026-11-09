import { cookies } from 'next/headers'
import { getD1 } from '@/lib/d1-client'

const ENCODER = new TextEncoder()
const SESSION_COOKIE_NAME = 'admin_session'
const PBKDF2_ITERATIONS = 100_000
const ADMIN_HASH_PREFIX = 'pbkdf2-sha256'

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

export function timingSafeEqualStr(left: string, right: string): boolean {
  return timingSafeEqualBytes(ENCODER.encode(left), ENCODER.encode(right))
}

async function pbkdf2Bits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', ENCODER.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    keyMaterial,
    256
  )
  return new Uint8Array(bits)
}

async function legacyHashPassword(password: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', ENCODER.encode(password))
  return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function isLegacyAdminHash(stored: string): boolean {
  return Boolean(stored) && !stored.startsWith(`${ADMIN_HASH_PREFIX}$`)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await pbkdf2Bits(password, salt, PBKDF2_ITERATIONS)
  return `${ADMIN_HASH_PREFIX}$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false
  if (stored.startsWith(`${ADMIN_HASH_PREFIX}$`)) {
    const parts = stored.split('$')
    if (parts.length !== 4) return false
    const iterations = Number(parts[1])
    if (!Number.isSafeInteger(iterations) || iterations < 40_000 || iterations > 1_000_000) return false
    const derived = await pbkdf2Bits(password, fromBase64Url(parts[2]), iterations)
    return timingSafeEqualBytes(derived, fromBase64Url(parts[3]))
  }
  return timingSafeEqualStr(await legacyHashPassword(password), stored)
}

function getSigningSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('ADMIN_SESSION_SECRET chưa được cấu hình an toàn')
  return secret
}

async function adminHmac(passwordHash: string, value: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(`${getSigningSecret()}:${passwordHash}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', keyMaterial, ENCODER.encode(value))
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createSignedAdminValue(value: string, passwordHash: string): Promise<string> {
  return `${value}.${await adminHmac(passwordHash, value)}`
}

export async function verifySignedAdminValue(token: string, passwordHash: string): Promise<string | null> {
  if (typeof token !== 'string' || !token || token.length > 2048 || typeof passwordHash !== 'string' || !passwordHash) return null
  const separator = token.lastIndexOf('.')
  if (separator < 1) return null
  const value = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  const expected = await adminHmac(passwordHash, value)
  return timingSafeEqualStr(expected, signature) ? value : null
}

export const ADMIN_SESSION_MAX_AGE = 12 * 3600 // 12 hours

export async function createSessionToken(passwordHash: string, maxAgeSeconds = ADMIN_SESSION_MAX_AGE): Promise<string> {
  const expiresAt = Date.now() + maxAgeSeconds * 1000
  return createSignedAdminValue(`${expiresAt}:${crypto.randomUUID()}`, passwordHash)
}

export async function verifySessionToken(token: string, passwordHash: string): Promise<boolean> {
  try {
    const value = await verifySignedAdminValue(token, passwordHash)
    if (!value) return false
    const [expiresAtStr] = value.split(':')
    const expiresAt = parseInt(expiresAtStr, 10)
    if (isNaN(expiresAt) || expiresAt < Date.now()) return false
    return true
  } catch {
    return false
  }
}

export async function getAdminCredentials() {
  const db = getD1()
  const data = await db.prepare('SELECT * FROM api_settings WHERE key = ?')
    .bind('admin_auth')
    .first<{ key: string; api_key: string; provider?: string; endpoint?: string; model?: string }>()
    
  if (!data) {
    const bootstrap = process.env.ADMIN_BOOTSTRAP_PASSWORD
    if (bootstrap && bootstrap.length >= 12) {
      return {
        configured: true,
        passwordHash: await legacyHashPassword(bootstrap),
        passkeyEnabled: false,
        passkeySpki: '',
        passkeyCredId: ''
      }
    }
    return {
      configured: false,
      passwordHash: '',
      passkeyEnabled: false,
      passkeySpki: '',
      passkeyCredId: ''
    }
  }
  
  return {
    configured: true,
    passwordHash: data.api_key,
    passkeyEnabled: data.provider === 'passkey_enabled',
    passkeySpki: data.endpoint || '',
    passkeyCredId: data.model || ''
  }
}

export async function saveAdminCredentials(hash: string, passkeySpki = '', passkeyCredId = '', passkeyEnabled = false) {
  const db = getD1()
  const res = await db.prepare(`
    INSERT INTO api_settings (key, api_key, endpoint, model, provider, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      api_key = excluded.api_key,
      endpoint = excluded.endpoint,
      model = excluded.model,
      provider = excluded.provider,
      updated_at = excluded.updated_at
  `)
    .bind(
      'admin_auth',
      hash,
      passkeySpki,
      passkeyCredId,
      passkeyEnabled ? 'passkey_enabled' : 'passkey_disabled'
    )
    .run()
  return res.success
}

export async function checkAdminSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return false
  
  const creds = await getAdminCredentials()
  if (!creds.configured || !creds.passwordHash) return false
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
  const normalized = base64
    .trim()
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binaryString = atob(padded)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

function webAuthnDerSignatureToRaw(signature: Uint8Array): Uint8Array | null {
  if (signature.length < 8 || signature[0] !== 0x30) return null
  let offset = 1
  const sequenceLength = signature[offset] & 0x80
    ? signature[offset + 1]
    : signature[offset]
  offset += signature[offset] & 0x80 ? 2 : 1
  if (sequenceLength <= 0 || offset + sequenceLength > signature.length || signature[offset++] !== 0x02) return null

  const rLength = signature[offset++]
  const r = signature.slice(offset, offset + rLength)
  offset += rLength
  if (signature[offset++] !== 0x02) return null
  const sLength = signature[offset++]
  const s = signature.slice(offset, offset + sLength)
  if (offset + sLength > signature.length) return null

  const normalize = (value: Uint8Array) => {
    let normalized = value
    while (normalized.length > 32 && normalized[0] === 0) normalized = normalized.slice(1)
    if (normalized.length > 32) return null
    const result = new Uint8Array(32)
    result.set(normalized, 32 - normalized.length)
    return result
  }
  const rawR = normalize(r)
  const rawS = normalize(s)
  if (!rawR || !rawS) return null
  const raw = new Uint8Array(64)
  raw.set(rawR, 0)
  raw.set(rawS, 32)
  return raw
}

export async function verifyPasskeyAssertion(
  clientDataJSONBase64: string,
  authenticatorDataBase64: string,
  signatureBase64: string,
  spkiBase64: string,
  expectedOrigin: string,
  expectedRpId: string
): Promise<boolean> {
  try {
    const spki = base64ToArrayBuffer(spkiBase64)
    const authData = base64ToArrayBuffer(authenticatorDataBase64)
    const clientDataJSON = base64ToArrayBuffer(clientDataJSONBase64)
    const signatureDer = new Uint8Array(base64ToArrayBuffer(signatureBase64))
    const signature = webAuthnDerSignatureToRaw(signatureDer)
    if (!signature) return false

    const clientData = JSON.parse(new TextDecoder().decode(clientDataJSON)) as {
      type?: string
      origin?: string
    }
    const normalizeOrigin = (url: string) => url.trim().replace(/\/+$/, '')
    if (clientData.type !== 'webauthn.get' || normalizeOrigin(clientData.origin || '') !== normalizeOrigin(expectedOrigin)) return false

    const authBytes = new Uint8Array(authData)
    if (authBytes.byteLength < 37) return false
    const expectedRpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', ENCODER.encode(expectedRpId)))
    if (!timingSafeEqualBytes(authBytes.slice(0, 32), expectedRpIdHash)) return false

    const flags = authBytes[32]
    const userPresent = (flags & 0x01) !== 0
    const userVerified = (flags & 0x04) !== 0
    if (!userPresent || !userVerified) return false

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
      signature as BufferSource,
      concat as BufferSource
    )
  } catch (err) {
    console.error('Failed to verify passkey signature:', err)
    return false
  }
}
