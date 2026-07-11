import express from 'express'
import jwt from 'jsonwebtoken'
import speakeasy from 'speakeasy'
import QRCode from 'qrcode'
import { pool } from '../db.js'
import { verifyToken } from '../middleware/auth.js'
import {
  SECRET, cookieOptions,
  ACCESS_COOKIE, REFRESH_COOKIE, ACCESS_MAX_AGE, REFRESH_MAX_AGE,
} from '../config/secret.js'
import { passwordSchema } from '../validators.js'
import { hashPassword, verifyPassword, needsRehash } from '../lib/password.js'
import { logger } from '../logger.js'

const router = express.Router()

export function makeTokens(userId, role, mustChange = false) {
  const token = jwt.sign({ id: userId, role, mustChange }, SECRET, { expiresIn: '15m' })
  const refresh_token = jwt.sign({ id: userId, role, type: 'refresh' }, SECRET, { expiresIn: '30d' })
  return { token, refresh_token }
}

export function setAuthCookies(res, token, refresh_token) {
  res.cookie(ACCESS_COOKIE, token, cookieOptions(ACCESS_MAX_AGE))
  res.cookie(REFRESH_COOKIE, refresh_token, cookieOptions(REFRESH_MAX_AGE))
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' })
  res.clearCookie(REFRESH_COOKIE, { path: '/' })
}

router.post('/login', async (req, res, next) => {
  const { email, password, totp_token } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 512) {
    return res.status(400).json({ error: 'Invalid credentials payload' })
  }
  if (totp_token !== undefined && (typeof totp_token !== 'string' || totp_token.length > 16)) {
    return res.status(400).json({ error: 'Invalid authenticator code' })
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' })
    const user = result.rows[0]
    const valid = await verifyPassword(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

    // TOTP check — if enabled and verified, require token
    if (user.totp_enabled && user.totp_verified) {
      if (!totp_token) {
        return res.status(200).json({ requires_totp: true })
      }
      const ok = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: 'base32',
        token: totp_token,
        window: 1,
      })
      if (!ok) return res.status(401).json({ error: 'Invalid authenticator code' })
    }

    // Transparent hash upgrade: legacy accounts are stored as bcrypt (or a
    // weaker Argon2id profile). The plaintext is available here (and just
    // verified), so silently re-hash to the current Argon2id parameters and
    // persist it — no password reset required. Best-effort: never block login
    // on failure.
    if (needsRehash(user.password)) {
      try {
        const upgraded = await hashPassword(password)
        // Compare-and-set on the hash we just verified so a concurrent password
        // change can never be clobbered by this best-effort upgrade.
        await pool.query(
          'UPDATE users SET password = $1 WHERE id = $2 AND password = $3',
          [upgraded, user.id, user.password]
        )
      } catch (err) {
        logger.error(err?.message || 'Password hash upgrade failed', { path: req.path })
      }
    }

    const { token, refresh_token } = makeTokens(user.id, user.role, user.must_change_password || false)
    setAuthCookies(res, token, refresh_token)
    res.json({
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        must_change_password: user.must_change_password || false,
        totp_enabled: user.totp_enabled || false,
      },
      // Tokens are ALSO returned in the body so native shells (Capacitor /
      // Electron), which live on a different origin and can't rely on the
      // SameSite=Lax auth cookies, can store them and send `Authorization:
      // Bearer`. Web clients ignore these and keep using the httpOnly cookies.
      token,
      refresh_token,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/refresh', async (req, res) => {
  const refresh_token = req.cookies?.[REFRESH_COOKIE] || req.body?.refresh_token
  if (!refresh_token) return res.status(401).json({ error: 'Session expired' })
  try {
    const payload = jwt.verify(refresh_token, SECRET)
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid session' })
    const result = await pool.query('SELECT id, role, must_change_password FROM users WHERE id = $1', [payload.id])
    if (!result.rows.length) return res.status(401).json({ error: 'Session expired' })
    const { id, role, must_change_password } = result.rows[0]
    // If an admin has mandated a password change, refuse to mint a fresh session.
    // The user must change their password (via their existing access token) or
    // re-authenticate — they cannot silently extend an in-flight session.
    if (must_change_password) {
      return res.status(403).json({ error: 'Password change required', mustChangePassword: true })
    }
    const { token, refresh_token: newRefresh } = makeTokens(id, role, false)
    setAuthCookies(res, token, newRefresh)
    // Rotated tokens also in body for native bearer-token clients (see /login).
    res.json({ success: true, token, refresh_token: newRefresh })
  } catch {
    clearAuthCookies(res)
    res.status(401).json({ error: 'Session expired' })
  }
})

router.post('/logout', (req, res) => {
  clearAuthCookies(res)
  res.json({ success: true })
})

router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, must_change_password, totp_enabled FROM users WHERE id = $1',
      [req.user.id]
    )
    if (!result.rows.length) return res.status(401).json({ error: 'Session expired' })
    res.json({ user: result.rows[0] })
  } catch (err) {
    next(err)
  }
})

router.patch('/password', verifyToken, async (req, res, next) => {
  const { current_password, new_password } = req.body
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current and new password are required' })
  }
  const { error: pwErr } = passwordSchema.validate(new_password)
  if (pwErr) return res.status(400).json({ error: pwErr.message })

  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' })
    const user = result.rows[0]
    const valid = await verifyPassword(current_password, user.password)
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })
    const hash = await hashPassword(new_password)
    await pool.query('UPDATE users SET password = $1, must_change_password = false WHERE id = $2', [hash, user.id])
    const { token, refresh_token } = makeTokens(user.id, user.role, false)
    setAuthCookies(res, token, refresh_token)
    // Fresh tokens also in body for native bearer-token clients (see /login).
    res.json({ success: true, token, refresh_token })
  } catch (err) {
    next(err)
  }
})

// ── TOTP Two-Factor Authentication ────────────────────────────────────────────

router.get('/totp/status', verifyToken, async (req, res, next) => {
  try {
    const r = await pool.query('SELECT totp_enabled, totp_verified FROM users WHERE id=$1', [req.user.id])
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' })
    const { totp_enabled, totp_verified } = r.rows[0]
    res.json({ enabled: totp_enabled || false, verified: totp_verified || false })
  } catch (err) { next(err) }
})

router.post('/totp/setup', verifyToken, async (req, res, next) => {
  try {
    const userRes = await pool.query('SELECT name, email FROM users WHERE id=$1', [req.user.id])
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' })
    const { name, email } = userRes.rows[0]

    const secret = speakeasy.generateSecret({
      name: `Automatic OS (${email})`,
      issuer: 'الأوتوماتيك اللبناني',
      length: 20,
    })

    // Store temporary secret (not yet verified/enabled)
    await pool.query(
      'UPDATE users SET totp_secret=$1, totp_enabled=false, totp_verified=false WHERE id=$2',
      [secret.base32, req.user.id]
    )

    const qr_url = await QRCode.toDataURL(secret.otpauth_url)
    res.json({ qr_url, secret: secret.base32 })
  } catch (err) { next(err) }
})

router.post('/totp/enable', verifyToken, async (req, res, next) => {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'Token required' })
  try {
    const r = await pool.query('SELECT totp_secret FROM users WHERE id=$1', [req.user.id])
    if (!r.rows.length || !r.rows[0].totp_secret) return res.status(400).json({ error: 'Run /totp/setup first' })
    const { totp_secret } = r.rows[0]
    const ok = speakeasy.totp.verify({ secret: totp_secret, encoding: 'base32', token, window: 1 })
    if (!ok) return res.status(401).json({ error: 'Invalid code — check your authenticator app' })
    await pool.query('UPDATE users SET totp_enabled=true, totp_verified=true WHERE id=$1', [req.user.id])
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.delete('/totp', verifyToken, async (req, res, next) => {
  // Require the user's current password OR a valid TOTP code before disabling 2FA.
  // A hijacked session alone is not enough to remove the second factor.
  const { password, totp_token } = req.body || {}
  if (!password && !totp_token) {
    return res.status(400).json({ error: 'Provide your current password or a TOTP code to disable 2FA' })
  }
  try {
    const r = await pool.query(
      'SELECT password AS password_hash, totp_secret, totp_enabled, totp_verified FROM users WHERE id=$1',
      [req.user.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' })
    const user = r.rows[0]

    if (password) {
      const valid = await verifyPassword(password, user.password_hash)
      if (!valid) return res.status(401).json({ error: 'Incorrect password' })
    } else {
      // Verify TOTP code (falls through to here when no password supplied)
      if (!user.totp_enabled || !user.totp_verified || !user.totp_secret) {
        return res.status(400).json({ error: '2FA is not currently enabled' })
      }
      const ok = speakeasy.totp.verify({
        secret: user.totp_secret, encoding: 'base32', token: totp_token, window: 1,
      })
      if (!ok) return res.status(401).json({ error: 'Invalid TOTP code' })
    }

    await pool.query(
      'UPDATE users SET totp_secret=NULL, totp_enabled=false, totp_verified=false WHERE id=$1',
      [req.user.id]
    )
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
