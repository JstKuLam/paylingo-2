const PASSWORD_FORMAT = 'pbkdf2-sha256'
const PASSWORD_ITERATIONS = 120_000

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false

  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    keyMaterial,
    256
  )
  return new Uint8Array(bits)
}

export async function hashSharedPassword(password: string) {
  if (!password) return null

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS)
  return `${PASSWORD_FORMAT}$${PASSWORD_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`
}

export async function verifySharedPassword(password: string, storedHash: string) {
  const [format, iterationsValue, saltValue, hashValue] = storedHash.split('$')

  if (format === PASSWORD_FORMAT && iterationsValue && saltValue && hashValue) {
    const iterations = Number(iterationsValue)
    if (!Number.isSafeInteger(iterations) || iterations < 10_000 || iterations > 1_000_000) return false

    const derived = await derivePassword(password, fromBase64Url(saltValue), iterations)
    return timingSafeEqual(derived, fromBase64Url(hashValue))
  }

  // Backward compatibility for links created before salted PBKDF2 hashes were introduced.
  const legacyHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  )
  const legacyHex = Array.from(legacyHash, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return legacyHex === storedHash
}

export function isLegacySharedPasswordHash(storedHash: string) {
  return !storedHash.startsWith(`${PASSWORD_FORMAT}$`)
}
