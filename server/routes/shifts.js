/**
 * Shift management + Z-Report routes.
 * A "shift" is a work period opened by a manager and closed at end of day.
 * Closing a shift computes the full Z-Report: revenue by payment method,
 * expected cash vs actual cash entered, voids, discounts.
 */
import express         from 'express'
import { pool }        from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { logger }      from '../logger.js'

const router = express.Router()

// ── GET /api/shifts/current — active open shift (any authenticated user) ──────
router.get('/current', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT s.*, u.name AS opened_by_name
      FROM shifts s
      LEFT JOIN users u ON u.id = s.opened_by
      WHERE s.status = 'open'
      ORDER BY s.opened_at DESC
      LIMIT 1
    `)
    res.json(r.rows[0] || null)
  } catch (err) {
    logger.error(err?.message, { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/shifts — list shifts (manager+) ──────────────────────────────────
router.get('/', requireRole('manager'), async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 30, 100)
  const offset = Math.max(parseInt(req.query.offset) || 0, 0)
  try {
    const r = await pool.query(`
      SELECT s.*,
        u1.name AS opened_by_name,
        u2.name AS closed_by_name
      FROM shifts s
      LEFT JOIN users u1 ON u1.id = s.opened_by
      LEFT JOIN users u2 ON u2.id = s.closed_by
      ORDER BY s.opened_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset])
    const total = await pool.query('SELECT COUNT(*) FROM shifts')
    res.setHeader('X-Total-Count', total.rows[0].count)
    res.json(r.rows)
  } catch (err) {
    logger.error(err?.message, { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/shifts/:id — single shift with full Z-Report summary ──────────────
router.get('/:id', requireRole('manager'), async (req, res) => {
  try {
    const shift = await pool.query(`
      SELECT s.*, u1.name AS opened_by_name, u2.name AS closed_by_name
      FROM shifts s
      LEFT JOIN users u1 ON u1.id = s.opened_by
      LEFT JOIN users u2 ON u2.id = s.closed_by
      WHERE s.id = $1
    `, [req.params.id])
    if (!shift.rows.length) return res.status(404).json({ error: 'Not found' })

    const s = shift.rows[0]
    // Fetch orders in this shift's window
    const end = s.closed_at ? `'${s.closed_at}'` : 'NOW()'
    const orders = await pool.query(`
      SELECT o.status, o.total, o.subtotal, o.discount, o.payment_method,
             o.void_reason, o.voided_at, u.name AS voided_by_name, o.created_at
      FROM orders o
      LEFT JOIN users u ON u.id = o.voided_by
      WHERE o.created_at BETWEEN $1 AND ${end}
      ORDER BY o.created_at DESC
    `, [s.opened_at])

    res.json({ ...s, orders: orders.rows })
  } catch (err) {
    logger.error(err?.message, { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/shifts/open — open a new shift (manager+) ───────────────────────
router.post('/open', requireRole('manager'), async (req, res) => {
  try {
    // Only one open shift at a time
    const existing = await pool.query("SELECT id FROM shifts WHERE status='open' LIMIT 1")
    if (existing.rows.length) {
      return res.status(409).json({ error: 'A shift is already open. Close it first.' })
    }
    const r = await pool.query(`
      INSERT INTO shifts (opened_by, status) VALUES ($1, 'open')
      RETURNING *
    `, [req.user.id])
    res.status(201).json(r.rows[0])
  } catch (err) {
    logger.error(err?.message, { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/shifts/:id/close — close shift + compute Z-Report ───────────────
router.post('/:id/close', requireRole('manager'), async (req, res) => {
  const { actual_cash, notes } = req.body
  if (actual_cash === undefined || actual_cash === null || isNaN(parseFloat(actual_cash))) {
    return res.status(400).json({ error: 'actual_cash is required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const shift = await client.query(
      "SELECT * FROM shifts WHERE id=$1 AND status='open'",
      [req.params.id]
    )
    if (!shift.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Open shift not found' })
    }
    const s = shift.rows[0]

    // Aggregate completed orders in this shift window
    const agg = await client.query(`
      SELECT
        COUNT(*)  FILTER (WHERE status = 'completed')                           AS total_orders,
        COALESCE(SUM(total) FILTER (WHERE status = 'completed'), 0)             AS total_revenue,
        COALESCE(SUM(total) FILTER (WHERE status='completed'
                               AND payment_method='cash'), 0)                   AS expected_cash,
        COALESCE(SUM(discount) FILTER (WHERE status = 'completed'), 0)         AS discounts_total,
        COUNT(*)  FILTER (WHERE status = 'cancelled' AND void_reason IS NOT NULL) AS voids_count,
        COALESCE(SUM(total) FILTER (WHERE status = 'cancelled'
                               AND void_reason IS NOT NULL), 0)                 AS voids_total
      FROM orders
      WHERE created_at >= $1
    `, [s.opened_at])
    const a = agg.rows[0]

    // Revenue breakdown by payment method
    const byMethod = await client.query(`
      SELECT payment_method, SUM(total) AS total
      FROM orders
      WHERE status='completed' AND created_at >= $1 AND payment_method IS NOT NULL
      GROUP BY payment_method
    `, [s.opened_at])
    const revenueByMethod = {}
    for (const row of byMethod.rows) {
      revenueByMethod[row.payment_method] = parseFloat(row.total)
    }

    const expectedCash  = parseFloat(a.expected_cash)
    const actualCash    = parseFloat(actual_cash)
    const variance      = actualCash - expectedCash

    const updated = await client.query(`
      UPDATE shifts SET
        status           = 'closed',
        closed_at        = NOW(),
        closed_by        = $1,
        actual_cash      = $2,
        expected_cash    = $3,
        variance         = $4,
        total_orders     = $5,
        total_revenue    = $6,
        revenue_by_method = $7,
        discounts_total  = $8,
        voids_count      = $9,
        voids_total      = $10,
        notes            = $11
      WHERE id = $12
      RETURNING *
    `, [
      req.user.id,
      actualCash,
      expectedCash,
      variance,
      parseInt(a.total_orders),
      parseFloat(a.total_revenue),
      JSON.stringify(revenueByMethod),
      parseFloat(a.discounts_total),
      parseInt(a.voids_count),
      parseFloat(a.voids_total),
      notes || null,
      req.params.id,
    ])

    await client.query('COMMIT')
    res.json(updated.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message, { path: req.path })
    res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

export default router
