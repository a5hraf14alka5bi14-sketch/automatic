// Audit trail: records every successful mutating API request into audit_log.
// Registered after verifyToken so req.user is populated. Best-effort — a failed
// audit insert must never break the underlying request.

import { pool } from '../db.js'
import { logger } from '../logger.js'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const REDACT = /password|token|secret|api[_-]?key/i
const MAX_DEPTH = 6

// Recursively redacts sensitive keys (at any depth) and truncates long strings
// and large arrays, so nested secrets can never leak into the audit trail.
function sanitizeValue(val, depth) {
  if (depth > MAX_DEPTH) return '[…]'
  if (Array.isArray(val)) return val.slice(0, 50).map((v) => sanitizeValue(v, depth + 1))
  if (val && typeof val === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(val)) {
      out[k] = REDACT.test(k) ? '[redacted]' : sanitizeValue(v, depth + 1)
    }
    return out
  }
  if (typeof val === 'string' && val.length > 500) return val.slice(0, 500) + '…'
  return val
}

function sanitize(body) {
  if (!body || typeof body !== 'object') return null
  const out = sanitizeValue(body, 0)
  const isEmpty = Array.isArray(out) ? out.length === 0 : Object.keys(out).length === 0
  return isEmpty ? null : out
}

export function auditMutations(req, res, next) {
  if (!MUTATING.has(req.method) || !req.path.startsWith('/api')) return next()

  // Snapshot the body now — route handlers may mutate/consume it.
  const details = sanitize(req.body)

  res.on('finish', () => {
    if (res.statusCode >= 400) return
    pool.query(
      `INSERT INTO audit_log (user_id, user_email, method, path, status, ip, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.id ?? null,
        req.user?.email ?? req.user?.name ?? null,
        req.method,
        req.path,
        res.statusCode,
        req.ip,
        details ? JSON.stringify(details) : null,
      ]
    ).catch((err) => logger.warn('[audit] insert failed', { msg: err.message }))
  })

  next()
}
