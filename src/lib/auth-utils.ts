export const ALLOWED_DOMAINS = ['pay2pay.vn']
export const WHITELISTED_EMAILS = ['ngaphungg210@gmail.com', 'thu.hoang.a15@gmail.com']

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  if (process.env.NODE_ENV === 'development') return true

  const sanitized = email.trim().toLowerCase()
  if (WHITELISTED_EMAILS.includes(sanitized)) return true

  return ALLOWED_DOMAINS.some((domain) => sanitized.endsWith(`@${domain}`))
}
