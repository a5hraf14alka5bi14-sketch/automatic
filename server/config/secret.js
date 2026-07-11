import { randomBytes } from 'node:crypto'

const IS_PROD = process.env.NODE_ENV === 'production'

if (IS_PROD && !process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable must be set in production.')
  process.exit(1)
}

// In dev with no SESSION_SECRET: generate a per-process random secret so there
// is NO predictable static string in the codebase. Sessions are invalidated on
// restart — acceptable in development. Set SESSION_SECRET in Replit Secrets to
// persist sessions across restarts.
const _devFallback = `dev-${randomBytes(24).toString('hex')}`
if (!process.env.SESSION_SECRET) {
  console.warn(
    '[security] SESSION_SECRET is not set — using a per-process random secret.' +
    ' Sessions will be invalidated on every restart. Set SESSION_SECRET in Replit Secrets.'
  )
}

export const SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || _devFallback

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
