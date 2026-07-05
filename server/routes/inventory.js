import express from 'express'
import { pool, recordStockMovement } from '../db.js'
import { validate } from '../middleware/validate.js'
import { requireRole } from '../middleware/auth.js'
import { inventoryCreateSchema, inventoryUpdateSchema } from '../validators.js'
import { logger } from '../logger.js'

const router = express.Router()

// All write operations require admin or manager role
router.use((req, res, next) => {
  if (req.method === 'GET') return next()
  return requireRole('admin', 'manager')(req, res, next)
})

// ── GET /api/inventory/movements ──────────────────────────────────────────────
router.get('/movements', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { item_id, limit } = req.query
    const params = []
    let where = ''
    if (item_id) { params.push(parseInt(item_id)); where = `WHERE sm.inventory_item_id = $${params.length}` }
    params.push(Math.min(parseInt(limit) || 100, 500))
    const result = await pool.query(
      `SELECT sm.id, sm.inventory_item_id, sm.change, sm.quantity_after,
              sm.movement_type, sm.reference_type, sm.reference_id, sm.note, sm.created_at,
              i.name AS item_name, i.unit
         FROM stock_movements sm
         LEFT JOIN inventory i ON i.id = sm.inventory_item_id
         ${where}
        ORDER BY sm.created_at DESC, sm.id DESC
        LIMIT $${params.length}`,
      params
    )
    res.json(result.rows)
  } catch (err) { next(err) }
})

// ── GET /api/inventory ────────────────────────────────────────────────────────
// Optional pagination: ?limit=&offset= (omit for full list). Sets X-Total-Count.
router.get('/', async (req, res) => {
  try {
    const { limit, offset } = req.query
    const total = await pool.query('SELECT COUNT(*)::int AS c FROM inventory WHERE deleted_at IS NULL')
    res.set('X-Total-Count', String(total.rows[0].c))
    let query = 'SELECT * FROM inventory WHERE deleted_at IS NULL ORDER BY category, name'
    const params = []
    if (limit !== undefined) {
      params.push(Math.min(Math.max(parseInt(limit) || 0, 0), 500)); query += ` LIMIT $${params.length}`
      params.push(Math.max(parseInt(offset) || 0, 0)); query += ` OFFSET $${params.length}`
    }
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// ── GET /api/inventory/low-stock ─────────────────────────────────────────────
// Optional pagination: ?limit=&offset= (omit for full list). Sets X-Total-Count.
router.get('/low-stock', async (req, res) => {
  try {
    const { limit, offset } = req.query
    const total = await pool.query(
      'SELECT COUNT(*)::int AS c FROM inventory WHERE quantity <= min_quantity AND deleted_at IS NULL'
    )
    res.set('X-Total-Count', String(total.rows[0].c))
    let query = 'SELECT * FROM inventory WHERE quantity <= min_quantity AND deleted_at IS NULL ORDER BY (quantity / NULLIF(min_quantity,0)) ASC, name'
    const params = []
    if (limit !== undefined) {
      params.push(Math.min(Math.max(parseInt(limit) || 0, 0), 500)); query += ` LIMIT $${params.length}`
      params.push(Math.max(parseInt(offset) || 0, 0)); query += ` OFFSET $${params.length}`
    }
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// ── GET /api/inventory/stats ──────────────────────────────────────────────────
router.get('/stats', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const s = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE quantity <= min_quantity) AS low_stock,
        COALESCE(SUM(quantity * cost), 0) AS total_value,
        COUNT(DISTINCT category) AS categories
      FROM inventory
      WHERE deleted_at IS NULL
    `)
    res.json(s.rows[0])
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// ── GET /api/inventory/impact — low-stock items → affected menu items ─────────
router.get('/impact', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        i.id, i.name AS item_name, i.quantity, i.min_quantity, i.unit,
        m.id AS menu_item_id, m.name AS menu_item_name, m.category,
        r.quantity AS required_qty, r.unit AS required_unit
      FROM inventory i
      JOIN recipe_ingredients r ON r.inventory_item_id = i.id
      JOIN menu_items m ON m.id = r.menu_item_id AND m.available = true AND m.deleted_at IS NULL
      WHERE i.quantity <= i.min_quantity AND i.deleted_at IS NULL
      ORDER BY i.name, m.name
    `)
    const grouped = {}
    for (const row of result.rows) {
      if (!grouped[row.id]) {
        grouped[row.id] = {
          id: row.id, item_name: row.item_name,
          quantity: row.quantity, min_quantity: row.min_quantity, unit: row.unit,
          affected_dishes: []
        }
      }
      grouped[row.id].affected_dishes.push({
        menu_item_id: row.menu_item_id, menu_item_name: row.menu_item_name,
        category: row.category, required_qty: row.required_qty, required_unit: row.required_unit
      })
    }
    res.json(Object.values(grouped))
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/inventory ───────────────────────────────────────────────────────
router.post('/', validate(inventoryCreateSchema), async (req, res) => {
  const { name, category, quantity, unit, min_quantity, cost } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      'INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, category || 'general', quantity, unit || 'pcs', min_quantity || 0, cost || null]
    )
    const created = result.rows[0]
    const qty = parseFloat(created.quantity)
    if (qty > 0) {
      await recordStockMovement(client, {
        inventoryItemId: created.id,
        change: qty,
        quantityAfter: qty,
        movementType: 'initial',
        referenceType: 'manual',
        note: 'Initial stock'
      })
    }
    await client.query('COMMIT')
    res.status(201).json(created)
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// ── PATCH /api/inventory/bulk-stocktake — MUST come before /:id ───────────────
// Body: { items: [{ id, quantity }] }  — sets quantities in a single transaction
router.patch('/bulk-stocktake', async (req, res, next) => {
  const { items } = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const results = []
    for (const { id, quantity } of items) {
      const qty = parseFloat(quantity)
      if (!id || isNaN(qty) || qty < 0) continue
      const prev = await client.query('SELECT quantity, unit, name FROM inventory WHERE id=$1 AND deleted_at IS NULL', [id])
      if (!prev.rows.length) continue
      const { quantity: oldQty, unit } = prev.rows[0]
      const r = await client.query(
        'UPDATE inventory SET quantity=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
        [qty.toFixed(3), id]
      )
      const delta = qty - parseFloat(oldQty)
      if (Math.abs(delta) > 0.0001) {
        await recordStockMovement(client, {
          inventoryItemId: id,
          change: parseFloat(delta.toFixed(3)),
          quantityAfter: qty,
          movementType: 'stocktake',
          note: `Stocktake: ${parseFloat(oldQty).toFixed(3)} → ${qty.toFixed(3)} ${unit}`,
        })
      }
      results.push(r.rows[0])
    }
    await client.query('COMMIT')
    res.json({ updated: results.length, items: results })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally { client.release() }
})

router.patch('/:id', validate(inventoryUpdateSchema), async (req, res) => {
  const { name, category, quantity, unit, min_quantity, cost, adjust } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const before = await client.query('SELECT quantity FROM inventory WHERE id=$1 FOR UPDATE', [req.params.id])
    if (!before.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }) }
    const prevQty = parseFloat(before.rows[0].quantity)

    let result
    if (adjust !== undefined) {
      // Relative adjustment: +N or -N
      result = await client.query(
        'UPDATE inventory SET quantity = GREATEST(0, quantity + $1), updated_at=NOW() WHERE id=$2 RETURNING *',
        [parseFloat(adjust), req.params.id]
      )
    } else {
      result = await client.query(
        `UPDATE inventory SET
          name=COALESCE($1,name), category=COALESCE($2,category),
          quantity=COALESCE($3,quantity), unit=COALESCE($4,unit),
          min_quantity=COALESCE($5,min_quantity), cost=COALESCE($6,cost),
          updated_at=NOW()
         WHERE id=$7 RETURNING *`,
        [name, category, quantity !== undefined ? parseFloat(quantity) : null,
         unit, min_quantity !== undefined ? parseFloat(min_quantity) : null,
         cost !== undefined ? parseFloat(cost) : null, req.params.id]
      )
    }

    const newQty = parseFloat(result.rows[0].quantity)
    const delta = newQty - prevQty
    if (delta !== 0) {
      await recordStockMovement(client, {
        inventoryItemId: parseInt(req.params.id),
        change: delta,
        quantityAfter: newQty,
        movementType: adjust !== undefined ? 'adjustment' : 'manual_edit',
        referenceType: 'manual',
        note: adjust !== undefined ? 'Manual stock adjustment' : 'Manual quantity edit'
      })
    }

    await client.query('COMMIT')
    res.json(result.rows[0])
  } catch (err) {
    await client.query('ROLLBACK'); logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// ── DELETE /api/inventory/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('UPDATE inventory SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) {
    // FK violation — item is used in recipes
    if (err.code === '23503') return res.status(409).json({ error: 'Item is used in recipes. Remove from recipes first.' })
    logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' })
  }
})

export default router
