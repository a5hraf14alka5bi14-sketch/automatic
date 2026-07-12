// ── Replit Auth (web-only additional sign-in option) ──────────────────────────
// Uses Replit as an OpenID Connect provider. This does NOT replace the app's
// own email/password + JWT system: after a successful OIDC login we match the
// Replit account to an EXISTING staff account (by previously-linked replit_sub,
// then by email) and mint the app's normal JWT cookies. Unknown Replit accounts
// are rejected — no staff account is ever auto-created, so RBAC stays intact.
//
// The express-session (PostgreSQL `sessions` table, migration 016) is used only
// during the OAuth handshake (state/nonce) and destroyed right after.
import * as client from 'openid-client'
import { Strategy } from 'openid-client/passport'
import passport from 'passport'
import session from 'express-session'
import connectPg from 'connect-pg-simple'
import memoize from 'memoizee'
import { pool } from '../db.js'
import { SECRET } from '../config/secret.js'
import { makeTokens, setAuthCookies } from './auth.js'
import { logger } from '../logger.js'

const IS_PROD = process.env.NODE_ENV === 'production'

const getOidcConfig = memoize(
  () => client.discovery(
    new URL(process.env.ISSUER_URL ?? 'https://replit.com/oidc'),
    process.env.REPL_ID
  ),
  { maxAge: 3600 * 1000, promise: true }
)

const SESSION_TTL = 15 * 60 * 1000 // handshake only — 15 minutes is plenty

function handshakeSession() {
  const PgStore = connectPg(session)
  return session({
    name: 'replit_oidc_sid',
    secret: SECRET,
    store: new PgStore({ pool, tableName: 'sessions', createTableIfMissing: false, ttl: SESSION_TTL / 1000 }),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: IS_PROD, sameSite: 'lax', maxAge: SESSION_TTL, path: '/' },
  })
}

// Look up the staff account for a Replit identity. Matching order:
// 1. previously-linked users.replit_sub  2. exact email match (then link sub).
export async function findStaffUser(claims) {
  const sub = claims?.sub
  const email = (claims?.email || '').trim().toLowerCase()
  if (sub) {
    const r = await pool.query('SELECT * FROM users WHERE replit_sub = $1', [sub])
    if (r.rows.length) return r.rows[0]
  }
  // Email fallback is only trusted when the provider asserts the address is
  // verified — otherwise an unverified/attacker-set email claim could bind to
  // (and log into) an existing staff account on first link.
  if (!email || claims?.email_verified !== true) return null
  const r = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [email])
  if (!r.rows.length) return null
  const user = r.rows[0]
  if (sub) {
    // Best-effort link so future logins survive a Replit email change.
    try {
      await pool.query('UPDATE users SET replit_sub = $1 WHERE id = $2 AND replit_sub IS NULL', [sub, user.id])
    } catch (err) {
      logger.error(err?.message || 'replit_sub link failed', { path: '/api/callback' })
    }
  }
  return user
}

// Mounts /api/login and /api/callback. No-op when REPL_ID is missing (native
// builds, CI) — the classic email/password login keeps working regardless.
export function setupReplitAuth(app) {
  if (!process.env.REPL_ID) {
    logger.warn('Replit Auth disabled — REPL_ID not set')
    return
  }

  const sessionMw = handshakeSession()
  const strategies = new Set()

  // Never trust the Host header for the OAuth callback URL: only hostnames the
  // platform says this app is served on (REPLIT_DOMAINS, comma-separated) are
  // accepted. localhost is allowed outside production for local testing.
  const allowedHosts = new Set(
    (process.env.REPLIT_DOMAINS || '').split(',').map(h => h.trim()).filter(Boolean)
  )
  if (!IS_PROD) allowedHosts.add('localhost')
  const isAllowedHost = (hostname) => allowedHosts.has(hostname)

  const ensureStrategy = async (hostname) => {
    const name = `replitauth:${hostname}`
    if (!strategies.has(name)) {
      const config = await getOidcConfig()
      passport.use(new Strategy(
        {
          name,
          config,
          scope: 'openid email profile',
          callbackURL: `https://${hostname}/api/callback`,
        },
        (tokens, verified) => verified(null, { claims: tokens.claims() })
      ))
      strategies.add(name)
    }
    return name
  }

  passport.serializeUser((user, cb) => cb(null, user))
  passport.deserializeUser((user, cb) => cb(null, user))

  app.get('/api/login', sessionMw, passport.initialize(), passport.session(), async (req, res, next) => {
    try {
      if (!isAllowedHost(req.hostname)) return res.status(403).json({ error: 'Unknown host' })
      const name = await ensureStrategy(req.hostname)
      passport.authenticate(name, { prompt: 'login consent', scope: ['openid', 'email', 'profile'] })(req, res, next)
    } catch (err) { next(err) }
  })

  app.get('/api/callback', sessionMw, passport.initialize(), passport.session(), async (req, res, next) => {
    try {
      if (!isAllowedHost(req.hostname)) return res.status(403).json({ error: 'Unknown host' })
      const name = await ensureStrategy(req.hostname)
      passport.authenticate(name, async (err, oidcUser) => {
        const finish = (redirect) => {
          // The OIDC session is only needed for the handshake — drop it.
          req.session?.destroy(() => {})
          res.clearCookie('replit_oidc_sid', { path: '/' })
          res.redirect(redirect)
        }
        try {
          if (err || !oidcUser?.claims) return finish('/?replit_auth=failed')
          const staff = await findStaffUser(oidcUser.claims)
          if (!staff) return finish('/?replit_auth=unmatched')
          const { token, refresh_token } = makeTokens(staff.id, staff.role, staff.must_change_password || false)
          setAuthCookies(res, token, refresh_token)
          logger.info('Replit Auth login', { userId: staff.id, role: staff.role })
          return finish('/')
        } catch (e) {
          logger.error(e?.message || 'Replit Auth callback failed', { path: '/api/callback' })
          return finish('/?replit_auth=failed')
        }
      })(req, res, next)
    } catch (err) { next(err) }
  })
}
