export const ALLOWED_DOMAINS = ['*']
export const WHITELISTED_EMAILS: string[] = []

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  if (process.env.NODE_ENV === 'development') return true

  const sanitized = email.trim().toLowerCase()
  return EMAIL_REGEX.test(sanitized)
}

