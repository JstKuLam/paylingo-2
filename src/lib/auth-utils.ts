export const ALLOWED_DOMAINS = ['*']
export const WHITELISTED_EMAILS: string[] = []

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false

  const sanitized = email.trim().toLowerCase()
  if (sanitized.length > 254 || sanitized.includes('\r') || sanitized.includes('\n')) return false
  if (sanitized.endsWith('@paylingo.app')) return false
  return EMAIL_REGEX.test(sanitized)
}

/**
 * Checks whether an email is explicitly authorized to use server-managed resources
 * (such as server-minted Soniox keys or SMTP magic links). Defaults to false in public BYOK mode
 * unless ALLOWED_EMAIL_DOMAINS or WHITELISTED_EMAILS is configured in the environment.
 */
export function isServerManagedEmailAllowed(email: string | null | undefined): boolean {
  if (!isAllowedEmail(email)) return false
  const sanitized = email!.trim().toLowerCase()
  if (sanitized.endsWith('@paylingo.app')) return false

  const envWhitelist = (process.env.WHITELISTED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (envWhitelist.includes(sanitized) || WHITELISTED_EMAILS.includes(sanitized)) {
    return true
  }

  const envDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter((d) => Boolean(d) && d !== '*')
  if (envDomains.length === 0) return false

  const domain = sanitized.split('@')[1] || ''
  return envDomains.includes(domain)
}


