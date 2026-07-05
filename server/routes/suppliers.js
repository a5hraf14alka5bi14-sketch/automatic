import express from 'express'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createPoSchema, patchPoSchema } from '../validators.js'
import { logger } from '../logger.js'

const router = express.Router()

// ── Suppliers ──────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const r = await pool.query(
      'SELECT * FROM suppliers WHERE active = true ORDER BY name'
    )
    res.json(r.rows)
  } catch (err) { next(err) }
})

router.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  const { name, contact_name, phone, email, address, notes } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Supplier name is required' })
  try {
    const dup = await pool.query(
      `SELECT id FROM suppliers WHERE active = true
       AND REGEXP_REPLACE(LOWER(TRIM(name)), '\\s+', ' ', 'g')
         = REGEXP_REPLACE(LOWER(TRIM($1)), '\\s+', ' ', 'g')`,
      [name.trim()]
    )
    if (dup.rows.length > 0) return res.status(409).json({ error: 'A supplier with this name already exists' })
    const r = await pool.query(
      `INSERT INTO suppliers (name, contact_name, phone, email, address, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name.trim(), contact_name || null, phone || null, email || null, address || null, notes || null]
    )
    res.status(201).json(r.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A supplier with this name already exists' })
    next(err)
  }
})

router.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  const { name, contact_name, phone, email, address, notes, active } = req.body
  try {
    if (name?.trim()) {
      const dup = await pool.query(
        `SELECT id FROM suppliers WHERE active = true AND id <> $2
         AND REGEXP_REPLACE(LOWER(TRIM(name)), '\\s+', ' ', 'g')
           = REGEXP_REPLACE(LOWER(TRIM($1)), '\\s+', ' ', 'g')`,
        [name.trim(), req.params.id]
      )
      if (dup.rows.length > 0) return res.status(409).json({ error: 'A supplier with this name already exists' })
    }
    const r = await pool.query(
      `UPDATE suppliers SET
        name = COALESCE($1, name),
        contact_name = COALESCE($2, contact_name),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        address = COALESCE($5, address),
        notes = COALESCE($6, notes),
        active = COALESCE($7, active)
       WHERE id = $8 RETURNING *`,
      [name || null, contact_name || null, phone || null, email || null,
       address || null, notes || null, active ?? null, req.params.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Supplier not found' })
    res.json(r.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A supplier with this name already exists' })
    next(err)
  }
})

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await pool.query('UPDATE suppliers SET active = false WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Purchase Orders ────────────────────────────────────────────────────────────

router.get('/purchase-orders', async (req, res, next) => {
  try {
    const r = await pool.query(`
      SELECT po.*, s.name AS supplier_name,
             COALESCE(json_agg(poi ORDER BY poi.id) FILTER (WHERE poi.id IS NOT NULL), '[]') AS items
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      GROUP BY po.id, s.name
      ORDER BY po.created_at DESC
      LIMIT 200
    `)
    res.json(r.rows)
  } catch (err) { next(err) }
})

router.post('/purchase-orders', requireRole('admin', 'manager'), validate(createPoSchema), async (req, res, next) => {
  const { supplier_id, notes, items } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const po = await client.query(
      `INSERT INTO purchase_orders (supplier_id, notes, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [supplier_id || null, notes || null, req.user.id]
    )
    const poId = po.rows[0].id
    let total = 0
    for (const item of items) {
      const qty = parseFloat(item.quantity) || 0
      const cost = parseFloat(item.unit_cost) || 0
      total += qty * cost
      await client.query(
        `INSERT INTO purchase_order_items (purchase_order_id, inventory_id, item_name, quantity, unit, unit_cost)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [poId, item.inventory_id || null, item.item_name, qty, item.unit || 'kg', cost]
      )
    }
    await client.query('UPDATE purchase_orders SET total = $1 WHERE id = $2', [total.toFixed(3), poId])
    await client.query('COMMIT')
    const full = await pool.query(`
      SELECT po.*, s.name AS supplier_name,
             COALESCE(json_agg(poi ORDER BY poi.id), '[]') AS items
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.id = $1
      GROUP BY po.id, s.name
    `, [poId])
    res.status(201).json(full.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally { client.release() }
})

router.patch('/purchase-orders/:id', requireRole('admin', 'manager'), validate(patchPoSchema), async (req, res, next) => {
  const { status, notes } = req.body
  try {
    const extra = status === 'ordered' ? ', ordered_at = NOW()' : status === 'received' ? ', received_at = NOW()' : ''
    const r = await pool.query(
      `UPDATE purchase_orders SET
        status = COALESCE($1, status),
        notes = COALESCE($2, notes)
        ${extra}
       WHERE id = $3 RETURNING *`,
      [status || null, notes || null, req.params.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'PO not found' })
    res.json(r.rows[0])
  } catch (err) { next(err) }
})

// Receive PO — increments inventory quantities for each line item
router.post('/purchase-orders/:id/receive', requireRole('admin', 'manager'), async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const po = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE', [req.params.id]
    )
    if (!po.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'PO not found' }) }
    if (po.rows[0].status === 'received') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'PO already received' }) }

    const items = await client.query(
      'SELECT * FROM purchase_order_items WHERE purchase_order_id = $1', [req.params.id]
    )
    for (const item of items.rows) {
      if (item.inventory_id) {
        await client.query(
          'UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
          [item.quantity, item.inventory_id]
        )
        logger.info('[PO receive] restocked', { inventory_id: item.inventory_id, qty: item.quantity })
      }
    }
    await client.query(
      "UPDATE purchase_orders SET status = 'received', received_at = NOW() WHERE id = $1",
      [req.params.id]
    )
    await client.query('COMMIT')
    res.json({ ok: true, items_restocked: items.rows.filter(i => i.inventory_id).length })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally { client.release() }
})

// GET /:id must come AFTER all specific named routes (e.g. /purchase-orders) to avoid shadowing
router.get('/:id', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM suppliers WHERE id=$1', [req.params.id])
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(r.rows[0])
  } catch (err) { next(err) }
})

export default router
