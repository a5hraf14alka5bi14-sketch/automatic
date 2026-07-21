import express from 'express'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createPoSchema, patchPoSchema } from '../validators.js'
import { logger } from '../logger.js'

const router = express.Router()

// Supplier records and purchase orders expose vendor contacts and financial
// data (unit costs, PO totals). Restrict the entire hub to management — the
// per-route guards below (e.g. admin-only DELETE) further tighten specific
// mutations. Read routes previously had no guard, so any authenticated role
// (cashier/kitchen/staff) could view supplier + purchase-order financials.
router.use(requireRole('admin', 'manager'))

// ── Suppliers ──────────────────────────────────────────────────────────────────

// Optional pagination: ?limit=&offset= (omit for full list). Sets X-Total-Count.
router.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = req.query
    const total = await pool.query('SELECT COUNT(*)::int AS c FROM suppliers WHERE active = true')
    res.set('X-Total-Count', String(total.rows[0].c))
    let query = 'SELECT * FROM suppliers WHERE active = true ORDER BY name'
    const params = []
    if (limit !== undefined) {
      params.push(Math.min(Math.max(parseInt(limit) || 0, 0), 500)); query += ` LIMIT $${params.length}`
      params.push(Math.max(parseInt(offset) || 0, 0)); query += ` OFFSET $${params.length}`
    }
    const r = await pool.query(query, params)
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
      const vatInclusive = item.vat_inclusive === true
      const vatRate = parseFloat(item.vat_rate ?? 5)
      const enteredInPurchaseUnit = item.entered_in_purchase_unit === true
      // gross total for PO header (inc-VAT if inclusive, else cost+VAT)
      const grossLine = vatInclusive ? qty * cost : qty * cost * (1 + vatRate / 100)
      total += grossLine

      // Snapshot the conversion factor from the inventory item at creation time.
      // This is the authoritative multiplier used when receiving — storing it here
      // means it won't drift even if the inventory item's packaging is later changed.
      let conversionFactor = null
      if (enteredInPurchaseUnit && item.inventory_id) {
        const invRow = await client.query(
          'SELECT units_per_purchase_unit FROM inventory WHERE id = $1 AND deleted_at IS NULL',
          [item.inventory_id]
        )
        const factor = parseFloat(invRow.rows[0]?.units_per_purchase_unit || 0)
        if (factor > 0) conversionFactor = factor
      }

      await client.query(
        `INSERT INTO purchase_order_items
           (purchase_order_id, inventory_id, item_name, quantity, unit, unit_cost,
            vat_inclusive, vat_rate, entered_in_purchase_unit, conversion_factor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [poId, item.inventory_id || null, item.item_name, qty, item.unit || 'kg', cost,
         vatInclusive, vatRate, enteredInPurchaseUnit, conversionFactor]
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

// Receive PO (partial or full) — body: { quantities: { [item_id]: received_qty } }
// Omitting quantities for an item means "receive none of it this time".
// Omitting the quantities map entirely means "receive full remaining for all items".
// Can be called repeatedly on a partially_received PO until all items are done.
router.post('/purchase-orders/:id/receive', requireRole('admin', 'manager'), async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const po = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE', [req.params.id]
    )
    if (!po.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'PO not found' }) }
    const currentStatus = po.rows[0].status
    if (currentStatus === 'received') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'PO already fully received' }) }
    if (currentStatus === 'cancelled') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Cannot receive a cancelled PO' }) }

    const items = await client.query(
      'SELECT * FROM purchase_order_items WHERE purchase_order_id = $1', [req.params.id]
    )

    // quantities map: { [item_id]: qty_to_receive } — null/missing means receive all remaining
    const quantitiesMap = req.body?.quantities ?? null
    const receiveAll = quantitiesMap === null

    let restoredCount = 0
    const skippedNames = []   // items with no inventory_id link
    const zeroNames = []      // items explicitly passed as 0 (caller chose not to receive yet)

    for (const item of items.rows) {
      const remaining = parseFloat(item.quantity) - parseFloat(item.received_qty || 0)
      if (remaining <= 0) continue // already fully received in a prior call

      let toReceive
      if (receiveAll) {
        toReceive = remaining
      } else {
        const requested = parseFloat(quantitiesMap[item.id] ?? 0)
        toReceive = Math.min(Math.max(requested, 0), remaining) // clamp to [0, remaining]
        if (toReceive === 0) { zeroNames.push(item.item_name); continue }
      }

      // Update per-item received_qty
      await client.query(
        'UPDATE purchase_order_items SET received_qty = received_qty + $1 WHERE id = $2',
        [toReceive, item.id]
      )

      if (item.inventory_id) {
        // Convert purchase-unit qty → base stock-unit qty using the snapshotted
        // conversion_factor (stored at PO creation time). Fall back to re-fetching
        // from inventory only if the PO was created before migration 025 (null factor).
        let stockQty = toReceive
        if (item.entered_in_purchase_unit) {
          let factor = parseFloat(item.conversion_factor || 0)
          if (factor <= 0) {
            // Legacy PO item (created before the conversion_factor column was added):
            // fall back to reading the inventory item's current packaging setting.
            const invRow = await client.query(
              'SELECT units_per_purchase_unit FROM inventory WHERE id = $1', [item.inventory_id]
            )
            factor = parseFloat(invRow.rows[0]?.units_per_purchase_unit || 0)
          }
          if (factor > 0) {
            stockQty = parseFloat((toReceive * factor).toFixed(3))
          } else {
            // entered_in_purchase_unit=true but no factor found anywhere — log a warning
            logger.warn('[PO receive] entered_in_purchase_unit=true but no conversion_factor found; using raw qty', {
              item_id: item.id, item_name: item.item_name, inventory_id: item.inventory_id
            })
          }
        }
        await client.query(
          'UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
          [stockQty, item.inventory_id]
        )
        logger.info('[PO receive] restocked', {
          inventory_id: item.inventory_id,
          entered_in_purchase_unit: item.entered_in_purchase_unit,
          conversion_factor: item.conversion_factor,
          purchase_qty: toReceive,
          stock_qty: stockQty
        })
        restoredCount++
      } else {
        skippedNames.push(item.item_name)
        logger.warn('[PO receive] item skipped — no inventory link', { item_name: item.item_name })
      }
    }

    // Re-query to determine new PO status from updated received_qty values
    const updated = await client.query(
      'SELECT quantity, received_qty FROM purchase_order_items WHERE purchase_order_id = $1',
      [req.params.id]
    )
    const allDone = updated.rows.every(r => parseFloat(r.received_qty) >= parseFloat(r.quantity))
    const anyDone = updated.rows.some(r => parseFloat(r.received_qty) > 0)
    const newStatus = allDone ? 'received' : anyDone ? 'partially_received' : currentStatus
    const nowTs = newStatus !== currentStatus ? ', received_at = NOW()' : ''

    await client.query(
      `UPDATE purchase_orders SET status = $1${nowTs} WHERE id = $2`,
      [newStatus, req.params.id]
    )
    await client.query('COMMIT')
    res.json({
      ok: true,
      status: newStatus,
      items_restocked: restoredCount,
      items_skipped: skippedNames,
      items_deferred: zeroNames,
    })
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
