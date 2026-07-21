/**
 * Public (unauthenticated) routes — safe to expose without a token.
 * Mounted at /api/public in server/index.js BEFORE the verifyToken middleware.
 *
 * Endpoints:
 *   GET  /api/public/menu                    — active menu grouped by category
 *   GET  /api/public/settings                — restaurant name + currency + tap_enabled flag
 *   POST /api/public/orders/pay              — QR self-order: server-repriced cart → Tap charge
 *   POST /api/public/webhook/tap             — Tap payment webhook (async charge updates)
 *   GET  /api/public/payment-status/:orderId — payment status polling fallback
 *
 * QR order flow (mandatory payment):
 *   1. Customer taps "Pay & Order" → POST /orders/pay
 *   2. Server reprices cart, creates order (status='awaiting_payment'), opens Tap charge
 *   3. Customer is redirected to Tap hosted checkout (card + Apple Pay)
 *   4. On payment success, Tap POSTs webhook → order flips to status='pending', broadcast to kitchen
 *   5. If payment fails/timeout, order is auto-cancelled by the cleanup interval (20 min)
 *   6. Customer lands on /qr-menu?payment=success&order=ID&table=N → polling confirmation view
 *
 * Security: all amounts come from server-side repricing — no client-submitted
 * price is ever trusted.
 */

import { Router }   from 'express'
import rateLimit    from 'express-rate-limit'
import { pool }     from '../db.js'
import { broadcast } from '../events.js'
import { getStationSets } from '../lib/stations.js'
import { repriceItems, insertOrderItems } from '../lib/orderPricing.js'
import { validate } from '../middleware/validate.js'
import { qrOrderSchema } from '../validators.js'
import { logger } from '../logger.js'
import {
  createCharge,
  getChargeStatus,
  tapPublicKey,
  verifyWebhookSignature,
} from '../lib/tap.js'

const router = Router()

// ── QR order rate limiter: 10 req / minute / IP ───────────────────────────────
const qrOrderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many orders from this device. Please wait a minute before trying again.' },
  skip: () => !!process.env.VITEST,
})

// ── Payment-status rate limiter: 30 req / minute / IP ────────────────────────
// Each call with tap_id triggers an outbound Tap API call — keep this tight.
const paymentStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many status checks. Please wait a moment.' },
  skip: () => !!process.env.VITEST,
})

// ── Helper: derive the public app URL from the incoming request ───────────────
// Used to build Tap's redirect.url and post.url which must be absolute.
function getAppUrl(req) {
  // REPLIT_DOMAINS holds the real public hostname (e.g. abc.sisko.replit.dev).
  // Always prefer it — x-forwarded-host can be localhost:3001 when the request
  // arrives through the Vite dev proxy, which would make Tap redirect back to localhost.
  const replitDomain = (process.env.REPLIT_DOMAINS || '').split(',')[0].trim()
  if (replitDomain) return `https://${replitDomain}`

  const proto = req.headers['x-forwarded-proto']?.split(',')[0]?.trim() || 'https'
  const host  = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5000'
  return `${proto}://${host}`
}

// ── Shared: transition a paid order into the visible pending state ────────────
// Called from webhook AND from the polling fallback to keep logic DRY.
async function activateOrder(orderId, chargeId) {
  const { rows } = await pool.query(
    `UPDATE orders
        SET status='pending', payment_status='paid', updated_at=NOW()
      WHERE id=$1 AND status='awaiting_payment'
      RETURNING id, table_number, type, rush, source`,
    [orderId]
  )
  if (rows.length) {
    const o = rows[0]
    logger.info('[tap] order activated after payment', { orderId, chargeId })
    broadcast('order_created', {
      id:           o.id,
      type:         o.type,
      table_number: o.table_number,
      status:       'pending',
      rush:         false,
      source:       'qr',
    })
  }
  return rows.length > 0
}

// ── Stale awaiting_payment order cleanup ──────────────────────────────────────
// Every 5 minutes, cancel QR orders stuck in awaiting_payment for > 20 minutes.
// These orders are invisible to staff, so this is silent housekeeping.
if (!process.env.VITEST) {
  setInterval(async () => {
    try {
      const { rows } = await pool.query(`
        UPDATE orders
           SET status='cancelled', payment_status='failed', updated_at=NOW()
         WHERE status='awaiting_payment'
           AND created_at < NOW() - INTERVAL '20 minutes'
         RETURNING id
      `)
      if (rows.length > 0) {
        logger.info('[tap/cleanup] cancelled stale awaiting_payment orders', {
          count: rows.length,
          ids: rows.map(r => r.id),
        })
      }
    } catch (err) {
      logger.error('[tap/cleanup] stale order cleanup failed', { err: err.message })
    }
  }, 5 * 60 * 1000).unref()
}

// ── Public menu ───────────────────────────────────────────────────────────────
router.get('/menu', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, name_ar, price, category, description
      FROM menu_items
      WHERE deleted_at IS NULL AND available = true
      ORDER BY category, name
    `)

    const grouped = {}
    for (const item of rows) {
      const cat = item.category || 'Other'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push({
        id:          item.id,
        name:        item.name,
        name_ar:     item.name_ar,
        price:       parseFloat(item.price),
        description: item.description,
      })
    }

    const categories = Object.entries(grouped).map(([category, items]) => ({ category, items }))
    res.json({ categories, total: rows.length })
  } catch (err) { next(err) }
})

// ── Public settings (name + currency + tap flag) ──────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('restaurant_name','currency_symbol')"
    )
    const out = {}
    for (const r of rows) out[r.key] = r.value
    res.json({
      restaurant_name: out.restaurant_name || 'Restaurant',
      currency_symbol: out.currency_symbol || 'OMR',
      tap_enabled:     !!process.env.TAP_SECRET_KEY,
      tap_pub_key:     tapPublicKey(),
    })
  } catch (err) { next(err) }
})

// ── QR self-ordering: pay online via Tap (mandatory) ─────────────────────────
// Flow:
//   1. Validate + server-reprice the cart
//   2. Create order in status='awaiting_payment' (invisible to kitchen/staff)
//   3. Create a Tap charge for the server-computed total
//   4. Store tap_charge_id; return the Tap-hosted payment_url to the frontend
//   5. Frontend redirects the browser to Tap checkout (card + Apple Pay)
//   6. Tap webhook (below) confirms payment → order becomes 'pending'
//
// Security: the Tap charge amount is ALWAYS the server-repriced total —
// no price, discount, or amount from the request body is ever trusted.
router.post('/orders/pay', qrOrderLimiter, validate(qrOrderSchema), async (req, res, next) => {
  const { table_number, items, notes } = req.body
  const client = await pool.connect()
  let orderId = null

  try {
    await client.query('BEGIN')

    // ── Reprice cart server-side ───────────────────────────────────────────────
    const { rows: sRows } = await client.query(
      "SELECT value FROM settings WHERE key='tax_rate'"
    )
    const taxRate = parseFloat(sRows[0]?.value || '11') / 100

    const { active: activeStations } = await getStationSets()
    const coerceStation = s => (s && activeStations.has(s) ? s : 'kitchen')

    const { repricedItems, rawSubtotal } = await repriceItems(client, items, { requireAvailable: true })

    const tax   = parseFloat((rawSubtotal * taxRate).toFixed(3))
    const total = parseFloat((rawSubtotal + tax).toFixed(3))

    // ── Create order in awaiting_payment state ────────────────────────────────
    // NOT broadcast to kitchen yet — only activateOrder() does that after payment.
    const { rows: oRows } = await client.query(
      `INSERT INTO orders
         (type, table_number, status, subtotal, tax, total,
          notes, discount, discount_type, source, payment_status)
       VALUES ('dine-in',$1,'awaiting_payment',$2,$3,$4,$5,0,'fixed','qr','unpaid')
       RETURNING id, table_number, total, subtotal, tax`,
      [table_number, rawSubtotal.toFixed(3), tax, total, notes || null]
    )
    const order = oRows[0]
    orderId = order.id

    await insertOrderItems(client, order.id, repricedItems, coerceStation)

    await client.query('COMMIT')

    // ── Create Tap charge (outside transaction) ───────────────────────────────
    const appUrl     = getAppUrl(req)
    const successUrl = `${appUrl}/qr-menu?payment=success&order=${order.id}&table=${table_number}`
    const webhookUrl = `${appUrl}/api/public/webhook/tap`

    const description = `Order #${order.id} · Table ${table_number}`

    const { chargeId, paymentUrl } = await createCharge({
      orderId:    order.id,
      amountOmr:  total,
      description,
      successUrl,
      webhookUrl,
    })

    // ── Store charge id on order ──────────────────────────────────────────────
    await pool.query(
      'UPDATE orders SET tap_charge_id=$1 WHERE id=$2',
      [chargeId, order.id]
    )

    logger.info('[public/orders/pay] charge ready', { orderId: order.id, chargeId })

    res.status(201).json({
      id:             order.id,
      table_number:   order.table_number,
      total:          parseFloat(order.total),
      status:         'awaiting_payment',
      payment_status: 'unpaid',
      charge_id:      chargeId,
      payment_url:    paymentUrl,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})

    if (err.status) return res.status(err.status).json({ error: err.error })

    // If the order was created but Tap charge failed, cancel the draft order
    // so it does not sit in awaiting_payment indefinitely.
    if (orderId) {
      await pool.query(
        "UPDATE orders SET status='cancelled', payment_status='failed' WHERE id=$1",
        [orderId]
      ).catch(() => {})
      logger.error('[public/orders/pay] Tap charge failed; draft order cancelled', {
        orderId, err: err.message,
      })
    }

    logger.error('[public/orders/pay]', { err: err?.message })
    res.status(502).json({
      error: 'Online payment is temporarily unavailable. Please try again or ask staff for assistance.',
    })
  } finally { client.release() }
})

// ── Tap payment webhook ───────────────────────────────────────────────────────
// Tap POSTs the charge object here when payment status changes.
// Security:
//   1. HMAC-SHA256 hashstring signature is verified before any processing.
//   2. We re-query Tap's API for authoritative status (never trust payload alone).
// All events are logged in payment_webhook_log for audit purposes.
router.post('/webhook/tap', async (req, res) => {
  const payload  = req.body || {}
  // Tap sends the full charge object; id is the charge ID
  const chargeId = payload.id || payload.charge_id

  // ── Signature verification (H1 fix) ────────────────────────────────────────
  // Reject any webhook whose hashstring doesn't match — prevents quota-drain
  // attacks where an adversary floods the endpoint with arbitrary charge IDs.
  if (!verifyWebhookSignature(payload)) {
    logger.warn('[webhook/tap] rejected — invalid or missing hashstring', {
      chargeId, hasHashstring: !!payload.hashstring,
    })
    // Always return 200 so Tap doesn't know the signature format we expect;
    // a 401 would leak that we check signatures.
    return res.json({ received: false })
  }

  logger.info('[webhook/tap] received (signature OK)', { chargeId, status: payload.status })

  // Log the raw event first for audit trail
  let logId = null
  try {
    const { rows } = await pool.query(
      `INSERT INTO payment_webhook_log (charge_id, payload, status)
       VALUES ($1, $2, $3) RETURNING id`,
      [chargeId || null, JSON.stringify(payload), payload.status || null]
    )
    logId = rows[0]?.id
  } catch (logErr) {
    logger.error('[webhook/tap] log insert failed', { err: logErr.message })
  }

  if (!chargeId) {
    logger.warn('[webhook/tap] no charge id in payload — ignoring')
    return res.json({ received: true })
  }

  try {
    // Look up the order by tap_charge_id
    const { rows: orderRows } = await pool.query(
      'SELECT id, status, payment_status FROM orders WHERE tap_charge_id=$1',
      [chargeId]
    )

    if (!orderRows.length) {
      logger.warn('[webhook/tap] no order found for charge', { chargeId })
      return res.json({ received: true })
    }

    const order = orderRows[0]

    // Re-query Tap for authoritative status (don't trust webhook payload alone)
    const { status: tapStatus } = await getChargeStatus(chargeId)

    if (tapStatus === 'paid' && order.status === 'awaiting_payment') {
      // Activate the order → status='pending', broadcast to kitchen
      await activateOrder(order.id, chargeId)

      if (logId) {
        await pool.query(
          'UPDATE payment_webhook_log SET processed=true, status=$1, order_id=$2 WHERE id=$3',
          ['paid', order.id, logId]
        )
      }

      logger.info('[webhook/tap] order activated', { orderId: order.id, chargeId })
      return res.json({ received: true, order_id: order.id, payment_status: 'paid' })
    }

    if (tapStatus === 'failed') {
      await pool.query(
        `UPDATE orders SET status='cancelled', payment_status='failed', updated_at=NOW()
          WHERE id=$1 AND status='awaiting_payment'`,
        [order.id]
      )
      if (logId) {
        await pool.query(
          'UPDATE payment_webhook_log SET processed=true, status=$1, order_id=$2 WHERE id=$3',
          ['failed', order.id, logId]
        )
      }
      logger.info('[webhook/tap] order cancelled (payment failed)', { orderId: order.id, chargeId })
      broadcast('order_payment_updated', { id: order.id, payment_status: 'failed' })
      return res.json({ received: true, order_id: order.id, payment_status: 'failed' })
    }

    // Still pending — log only
    if (logId) {
      await pool.query('UPDATE payment_webhook_log SET order_id=$1 WHERE id=$2', [order.id, logId])
    }
    res.json({ received: true, order_id: order.id, payment_status: order.payment_status })
  } catch (err) {
    logger.error('[webhook/tap] processing error', { err: err.message, chargeId })
    // Always 200 so Tap doesn't retry on transient errors
    res.json({ received: true, error: 'processing_error' })
  }
})

// ── Payment status polling: GET /api/public/payment-status/:orderId ───────────
// Called by the customer's browser after Tap redirects them back.
// Accepts optional ?tap_id=chg_... query param (Tap appends this to the redirect URL).
// When tap_id is supplied we ALWAYS do a fresh Tap check, regardless of DB order state.
// This handles two race conditions:
//   1. Webhook hasn't arrived yet when the browser lands back (CAPTURED but still awaiting_payment in DB)
//   2. Stale cleanup cancelled the order before the webhook arrived (CAPTURED but DB=cancelled)
router.get('/payment-status/:orderId', paymentStatusLimiter, async (req, res, next) => {
  const orderId = parseInt(req.params.orderId, 10)
  if (!orderId || orderId < 1) return res.status(400).json({ error: 'Invalid order ID' })

  // Tap appends ?tap_id=chg_... to the redirect URL — use it for direct verification
  const tapIdParam = (req.query.tap_id || '').toString().trim()

  try {
    const { rows } = await pool.query(
      `SELECT id, status, payment_status, tap_charge_id, total, table_number
       FROM orders WHERE id=$1 AND source='qr'`,
      [orderId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Order not found' })

    const order     = rows[0]
    const chargeId  = tapIdParam || order.tap_charge_id

    // Do a live Tap check when:
    //  a) tap_id param supplied (direct post-redirect verification), OR
    //  b) order still awaiting_payment (webhook hasn't fired yet)
    // Skip only when order is already confirmed paid (avoid unnecessary API call)
    const alreadyPaid = order.status === 'pending' && order.payment_status === 'paid'

    if (chargeId && !alreadyPaid) {
      try {
        const { status: live, rawStatus } = await getChargeStatus(chargeId)
        logger.info('[payment-status] live Tap check', {
          orderId, chargeId, rawStatus, dbStatus: order.status,
        })

        if (live === 'paid') {
          // Activate regardless of current DB state — covers the race where
          // stale cleanup cancelled the order before the webhook arrived.
          await activateOrder(order.id, chargeId)
          // If cleanup had already cancelled it, re-open it now
          if (order.status === 'cancelled') {
            await pool.query(
              `UPDATE orders SET status='pending', payment_status='paid', updated_at=NOW()
                WHERE id=$1`,
              [order.id]
            )
          }
          order.status         = 'pending'
          order.payment_status = 'paid'
        } else if (live === 'failed') {
          // Only cancel if still awaiting — don't overwrite a legitimate open order
          if (order.status === 'awaiting_payment') {
            await pool.query(
              `UPDATE orders SET status='cancelled', payment_status='failed', updated_at=NOW()
                WHERE id=$1 AND status='awaiting_payment'`,
              [orderId]
            )
            order.status         = 'cancelled'
            order.payment_status = 'failed'
          }
          logger.info('[payment-status] charge failed/cancelled', { orderId, chargeId, rawStatus })
        }
        // live === 'pending' → charge still in-flight; return current DB state,
        // frontend will poll again in 2 s
      } catch (tapErr) {
        // Non-fatal — return DB state and let the customer retry
        logger.warn('[payment-status] live Tap check error', {
          orderId, chargeId, err: tapErr.message,
        })
      }
    }

    res.json({
      order_id:       order.id,
      payment_status: order.payment_status,
      order_status:   order.status,
      total:          parseFloat(order.total),
      table_number:   order.table_number,
      confirmed:      order.status === 'pending' && order.payment_status === 'paid',
    })
  } catch (err) { next(err) }
})

// ── Public receipt view: GET /api/public/receipt/:token ──────────────────────
// Unauthenticated, read-only. Returns just enough data to render a digital bill.
// Rate-limited to 30 req/min/IP (shares the payment-status limiter).
router.get('/receipt/:token', paymentStatusLimiter, async (req, res, next) => {
  try {
    const token = (req.params.token || '').trim()
    if (!token || token.length < 10) return res.status(400).json({ error: 'Invalid receipt link' })

    // Fetch order by token — skip cancelled / awaiting_payment orders
    const { rows: orderRows } = await pool.query(
      `SELECT o.id, o.type, o.table_number,
              o.subtotal, o.tax, o.total,
              o.discount, o.discount_type, o.loyalty_discount,
              o.notes, o.payment_method, o.created_at, o.paid_at, o.status,
              c.name AS customer_name
       FROM   orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE  o.receipt_token = $1
         AND  o.status NOT IN ('cancelled','awaiting_payment')`,
      [token]
    )
    if (!orderRows.length) return res.status(404).json({ error: 'Receipt not found' })
    const order = orderRows[0]

    // Items
    const { rows: itemRows } = await pool.query(
      `SELECT oi.id, oi.quantity, oi.price,
              m.name, m.name_ar
       FROM   order_items oi
       LEFT JOIN menu_items m ON m.id = oi.menu_item_id
       WHERE  oi.order_id = $1
       ORDER  BY oi.id`,
      [order.id]
    )

    // Modifiers (if any)
    let modRows = []
    if (itemRows.length) {
      const ids = itemRows.map(i => i.id)
      const { rows } = await pool.query(
        `SELECT oim.order_item_id, md.name AS modifier_name, md.price AS modifier_price
         FROM   order_item_modifiers oim
         JOIN   modifiers md ON md.id = oim.modifier_id
         WHERE  oim.order_item_id = ANY($1)`,
        [ids]
      )
      modRows = rows
    }

    // Minimal settings for receipt rendering
    const { rows: settRows } = await pool.query(
      `SELECT key, value FROM settings
       WHERE  key IN ('restaurant_name','restaurant_name_ar','currency_symbol',
                      'tax_rate','vat_number','business_phone',
                      'receipt_footer','receipt_footer_ar')`
    )
    const settings = {}
    for (const r of settRows) settings[r.key] = r.value

    res.json({ order, items: itemRows, modifiers: modRows, settings })
  } catch (err) { next(err) }
})

export default router
