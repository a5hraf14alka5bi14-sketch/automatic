import jwt from 'jsonwebtoken'
import { SECRET, ACCESS_COOKIE } from '../config/secret.js'

function extractToken(req) {
  if (req.cookies?.[ACCESS_COOKIE]) return req.cookies[ACCESS_COOKIE]
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export function verifyToken(req, res, next) {
  const token = extractToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized — authentication required' })
  }
  try {
    req.user = jwt.verify(token, SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden — insufficient role' })
    }
    next()
  }
}

// Blocks all protected API access while the user still owes a password change.
// Auth routes (login/logout/refresh/me/password) are mounted before verifyToken
// so they remain reachable and can clear the flag.
export function enforcePasswordChange(req, res, next) {
  if (req.user?.mustChange) {
    return res.status(403).json({ error: 'Password change required', mustChangePassword: true })
  }
  next()
}
