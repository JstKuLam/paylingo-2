export const AUTH_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60

export const AUTH_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax' as const,
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
}
