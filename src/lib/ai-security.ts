const DEFAULT_AI_HOSTS = ['api.openai.com', '9r.9phut.org']

export function getAllowedAiHosts(): Set<string> {
  const configured = (process.env.AI_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...DEFAULT_AI_HOSTS, ...configured])
}

export function getSafeAiEndpoint(value: string | null | undefined): string | null {
  try {
    const endpoint = new URL((value || 'https://api.openai.com/v1').trim())
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      (endpoint.port && endpoint.port !== '443') ||
      !getAllowedAiHosts().has(endpoint.hostname.toLowerCase())
    ) {
      return null
    }
    return endpoint.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function redactSensitiveSecrets(input: string): string {
  if (!input || typeof input !== 'string') return ''
  return input
    .replace(/sk-[a-zA-Z0-9_-]{8,}/g, '[REDACTED_API_KEY]')
    .replace(/snx_[a-zA-Z0-9._-]{8,}/g, '[REDACTED_SONIOX_KEY]')
    .replace(/GOCSPX-[a-zA-Z0-9_-]{8,}/g, '[REDACTED_OAUTH_SECRET]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]')
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function computeHmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return bytesToHex(new Uint8Array(sig))
}

export async function mintSonioxWsTicket(
  masterKey: string,
  userId: string,
  ttlSeconds = 60
): Promise<string> {
  const safeTtl = Number.isFinite(ttlSeconds) ? Math.min(300, Math.floor(ttlSeconds)) : 60
  const exp = Math.floor(Date.now() / 1000) + safeTtl
  const nonceBytes = new Uint8Array(12)
  crypto.getRandomValues(nonceBytes)
  const nonce = bytesToHex(nonceBytes)
  const safeUser = (userId || 'anon').slice(0, 48).replace(/[^a-zA-Z0-9_-]/g, '') || 'anon'
  const payload = `paylingo_ws_v1:${exp}:${nonce}:${safeUser}`
  const sig = await computeHmacHex(masterKey.trim(), payload)
  return `paylingo_ws_v1.${exp}.${nonce}.${safeUser}.${sig}`
}

export async function verifySonioxWsTicket(
  ticket: string | null | undefined,
  masterKey: string
): Promise<boolean> {
  if (!ticket || typeof ticket !== 'string' || !masterKey) return false
  const parts = ticket.trim().split('.')
  if (parts.length !== 5 || parts[0] !== 'paylingo_ws_v1') return false
  const exp = Number.parseInt(parts[1], 10)
  const nonce = parts[2]
  const safeUser = parts[3]
  const sig = parts[4]
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  if (!/^[0-9a-f]{24}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return false
  const payload = `paylingo_ws_v1:${exp}:${nonce}:${safeUser}`
  const expected = await computeHmacHex(masterKey.trim(), payload)
  if (expected.length !== sig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  }
  return diff === 0
}

const FALLBACK_VAULT_SECRET = 'paylingo-edge-ai-key-vault-v1'

async function deriveAesKeyFromSecret(secretMaterial: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secretMaterial)
  )
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

async function deriveAesKey(): Promise<CryptoKey> {
  const secretMaterial = (
    process.env.AI_KEY_ENCRYPTION_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    ''
  ).trim()
  if (!secretMaterial) {
    throw new Error('AI_KEY_ENCRYPTION_SECRET hoặc ADMIN_SESSION_SECRET chưa được cấu hình')
  }
  return deriveAesKeyFromSecret(secretMaterial)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

export async function encryptAiKey(plainKey: string): Promise<string> {
  const trimmed = plainKey.trim()
  if (!trimmed || trimmed.startsWith('enc:v1:')) return trimmed
  const key = await deriveAesKey()
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(trimmed)
  )
  return `enc:v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`
}

export async function decryptAiKey(storedKey: string | null | undefined): Promise<string> {
  if (!storedKey || typeof storedKey !== 'string') return ''
  const trimmed = storedKey.trim()
  if (!trimmed.startsWith('enc:v1:')) return trimmed
  try {
    const parts = trimmed.split(':')
    if (parts.length !== 4) return ''
    const iv = base64ToBytes(parts[2])
    const ct = base64ToBytes(parts[3])
    const candidates = Array.from(
      new Set(
        [
          process.env.AI_KEY_ENCRYPTION_SECRET,
          process.env.ADMIN_SESSION_SECRET,
          FALLBACK_VAULT_SECRET,
        ].filter((v): v is string => Boolean(v && v.trim()))
      )
    )
    for (const secret of candidates) {
      try {
        const key = await deriveAesKeyFromSecret(secret)
        const plainBuf = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv as BufferSource },
          key,
          ct as BufferSource
        )
        return new TextDecoder().decode(plainBuf)
      } catch {
        // Try next candidate secret
      }
    }
    return ''
  } catch {
    return ''
  }
}
