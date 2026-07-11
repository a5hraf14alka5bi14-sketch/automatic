// Server-side push notifications (FCM HTTP v1 for Android/Web, APNs for iOS).
//
// This module is fully ENV-GATED and safe to run anywhere, including Replit's
// Linux environment where we can't actually reach a device: when the relevant
// credentials aren't configured it becomes a logged no-op instead of throwing.
// Real delivery only happens once FCM_SERVICE_ACCOUNT (a Google service-account
// JSON) is set in the deployed backend.
//
// Design notes:
//  - We build the OAuth2 access token from the service-account private key with
//    the `jsonwebtoken` dep already in the project (no extra SDK/native build).
//  - Device tokens live in the `device_tokens` table (migration 013), keyed by
//    user, so a notification can fan out to every registered device.
//  - Failures are swallowed + logged; a push failure must never break the
//    request (e.g. creating an order) that triggered it.
import jwt from 'jsonwebtoken'
import { pool } from '../db.js'
import { logger } from '../logger.js'

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

// Parse the service-account JSON from the env var once. Returns null when
// unconfigured or malformed (push then becomes a no-op).
let _svcAccountCache
function getServiceAccount() {
  if (_svcAccountCache !== undefined) return _svcAccountCache
  const raw = (process.env.FCM_SERVICE_ACCOUNT || '').trim()
  if (!raw) { _svcAccountCache = null; return null }
  try {
    const parsed = JSON.parse(raw)
    if (parsed.client_email && parsed.private_key && parsed.project_id) {
      _svcAccountCache = parsed
    } else {
      logger.warn('FCM_SERVICE_ACCOUNT missing required fields; push disabled')
      _svcAccountCache = null
    }
  } catch {
    logger.warn('FCM_SERVICE_ACCOUNT is not valid JSON; push disabled')
    _svcAccountCache = null
  }
  return _svcAccountCache
}

// True when push is actually configured for delivery.
export function isPushConfigured() {
  return !!getServiceAccount()
}

// Exchange the service-account key for a short-lived OAuth2 access token.
let _tokenCache = null // { token, exp }
async function getAccessToken() {
  const svc = getServiceAccount()
  if (!svc) return null
  const now = Math.floor(Date.now() / 1000)
  if (_tokenCache && _tokenCache.exp - 60 > now) return _tokenCache.token
  const assertion = jwt.sign(
    { scope: FCM_SCOPE },
    svc.private_key,
    {
      algorithm: 'RS256',
      issuer: svc.client_email,
      subject: svc.client_email,
      audience: 'https://oauth2.googleapis.com/token',
      expiresIn: 3600,
    }
  )
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    logger.error('FCM OAuth token exchange failed', { status: res.status })
    return null
  }
  const data = await res.json()
  _tokenCache = { token: data.access_token, exp: now + (data.expires_in || 3600) }
  return _tokenCache.token
}

// Register (or refresh) a device token for a user. Upserts on the unique token.
export async function registerDeviceToken(userId, token, platform = 'unknown') {
  if (!token) throw new Error('token required')
  await pool.query(
    `INSERT INTO device_tokens (user_id, token, platform, last_seen)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           platform = EXCLUDED.platform,
           last_seen = now()`,
    [userId, token, platform]
  )
}

// Remove a device token (logout / unsubscribe). Idempotent.
// When `userId` is provided the delete is scoped to that owner so one user can't
// unregister another user's device (cross-user notification DoS). Internal
// pruning of FCM-reported dead tokens passes no userId (delete unconditionally —
// the token is genuinely dead regardless of owner).
export async function removeDeviceToken(token, userId = null) {
  if (!token) return
  if (userId != null) {
    await pool.query('DELETE FROM device_tokens WHERE token = $1 AND user_id = $2', [token, userId])
  } else {
    await pool.query('DELETE FROM device_tokens WHERE token = $1', [token])
  }
}

// Send one FCM HTTP v1 message. Returns true on success. Prunes tokens that FCM
// reports as unregistered so the table doesn't accumulate dead entries.
async function sendToToken(accessToken, projectId, token, title, body, data) {
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: data ? Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)])
            ) : undefined,
          },
        }),
      }
    )
    if (res.ok) return true
    if (res.status === 404 || res.status === 400) {
      // UNREGISTERED / invalid token — prune it.
      await removeDeviceToken(token)
    }
    logger.warn('FCM send failed', { status: res.status })
    return false
  } catch (err) {
    logger.error('FCM send error', { error: err?.message })
    return false
  }
}

// Fan a notification out to every registered device (optionally scoped to one
// or more roles, e.g. only 'kitchen' staff, or ['staff','cashier'] for
// front-of-house). No-op + log when push isn't configured.
export async function sendPushNotification(title, body, { role = null, data = null } = {}) {
  const svc = getServiceAccount()
  if (!svc) {
    logger.info('Push skipped (FCM not configured)', { title })
    return { sent: 0, skipped: true }
  }
  const accessToken = await getAccessToken()
  if (!accessToken) return { sent: 0, skipped: true }

  let rows
  if (role) {
    const roles = Array.isArray(role) ? role : [role]
    rows = (await pool.query(
      `SELECT dt.token FROM device_tokens dt
       JOIN users u ON u.id = dt.user_id
       WHERE u.role = ANY($1::text[])`,
      [roles]
    )).rows
  } else {
    rows = (await pool.query('SELECT token FROM device_tokens')).rows
  }

  let sent = 0
  for (const { token } of rows) {
    if (await sendToToken(accessToken, svc.project_id, token, title, body, data)) sent++
  }
  return { sent, skipped: false }
}
