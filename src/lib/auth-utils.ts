const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false

  const sanitized = email.trim().toLowerCase()
  if (sanitized.length > 254 || sanitized.includes('\r') || sanitized.includes('\n')) return false
  if (sanitized.endsWith('@paylingo.app')) return false
  return EMAIL_REGEX.test(sanitized)
}
