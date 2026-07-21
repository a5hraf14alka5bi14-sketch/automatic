/**
 * Receipt share-token endpoint (authenticated)
 * POST /api/receipts/:orderId/share-token
 *   — generates (or returns existing) a random URL-safe token for the order.
 *   — token is stored in orders.receipt_token (UNIQUE).
 *   — returns { token, url } where url is the absolute public receipt URL.
 *
 * The public viewing endpoint is in server/routes/public.js:
 *   GET /api/public/receipt/:token  — unauthenticated, read-only
 */

import { Router }  from 'express'
import crypto      from 'node:crypto'
import { pool }    from '../db.js'
import { logger }  from '../logger.js'

const router = Router()

function getAppUrl(req) {
  const replitDomain = (process.env.REPLIT_DOMAINS || '').split(',')[0].trim()
  if (replitDomain) return `https://${replitDomain}`
  const proto = req.headers['x-forwarded-proto']?.split(',')[0]?.trim() || 'https'
  const host  = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5000'
  return `${proto}://${host}`
}

// POST /api/receipts/:orderId/share-token
// Idempotent: returns existing token if already generated.
// Access: any authenticated staff (cashier, manager, admin, etc.)
router.post('/:orderId/share-token', async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.orderId, 10)
    if (!orderId || orderId < 1) return res.status(400).json({ error: 'Invalid order ID' })

    // Check if order exists and user can see it
    const { rows } = await pool.query(
      `SELECT id, receipt_token FROM orders WHERE id=$1 AND status!='awaiting_payment'`,
      [orderId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Order not found' })

    let token = rows[0].receipt_token

    if (!token) {
      token = crypto.randomBytes(24).toString('base64url')
      const update = await pool.query(
        `UPDATE orders SET receipt_token=$1 WHERE id=$2 AND receipt_token IS NULL RETURNING receipt_token`,
        [token, orderId]
      )
      // Race: another request may have set it first — re-fetch
      if (!update.rows.length) {
        const retry = await pool.query('SELECT receipt_token FROM orders WHERE id=$1', [orderId])
        token = retry.rows[0]?.receipt_token
      }
    }

    const url = `${getAppUrl(req)}/receipt/${token}`
    logger.info('[receipts] share token issued', { orderId, tokenPrefix: token.slice(0, 8) })
    res.json({ token, url })
  } catch (err) { next(err) }
})

export default router
