import jwt from 'jsonwebtoken'

const SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'automatic-restaurant-secret-key'

export function verifyToken(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — token required' })
  }
  try {
    req.user = jwt.verify(auth.slice(7), SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
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
