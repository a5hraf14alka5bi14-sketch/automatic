const IS_PROD = process.env.NODE_ENV === 'production'

if (IS_PROD && !process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable must be set in production.')
  process.exit(1)
}
if (!process.env.SESSION_SECRET) {
  console.warn('[security] SESSION_SECRET is not set — using an insecure development fallback. Set this before deploying.')
}

export const SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'dev-only-insecure-secret'

export const cookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  secure: IS_PROD,
  sameSite: 'lax',
  path: '/',
  maxAge: maxAgeMs,
})

export const ACCESS_COOKIE = 'access_token'
export const REFRESH_COOKIE = 'refresh_token'
export const ACCESS_MAX_AGE = 2 * 60 * 60 * 1000
export const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000
