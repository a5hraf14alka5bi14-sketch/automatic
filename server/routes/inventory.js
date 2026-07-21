import express from 'express'
import { pool, recordStockMovement } from '../db.js'
import { validate } from '../middleware/validate.js'
import { requireRole } from '../middleware/auth.js'
import { inventoryCreateSchema, inventoryUpdateSchema } from '../validators.js'
import { logger } from '../logger.js'
import { broadcast } from '../events.js'

const router = express.Router()

// All write operations require admin or manager role
router.use((req, res, next) => {
  if (req.method === 'GET') return next()
  return requireRole('admin', 'manager')(req, res, next)
})

// GET / and /low-stock stay open to every authenticated role (POS stock
// warnings + read-only inventory views need them), but purchase cost and
// supplier linkage are management-only: strip them for cashier/kitchen/staff.
const isManagement = (req) => req.user?.role === 'admin' || req.user?.role === 'manager'

function stripInventoryFinancials(rows, req) {
  if (isManagement(req)) return rows
  return rows.map(({ cost, supplier_id, ...rest }) => rest)
}

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
    let query = `SELECT inventory.*,
        (SELECT MAX(sm.created_at) FROM stock_movements sm
          WHERE sm.inventory_item_id = inventory.id AND sm.movement_type = 'stocktake') AS last_counted_at
      FROM inventory WHERE deleted_at IS NULL ORDER BY category, name`
    const params = []
    if (limit !== undefined) {
      params.push(Math.min(Math.max(parseInt(limit) || 0, 0), 500)); query += ` LIMIT $${params.length}`
      params.push(Math.max(parseInt(offset) || 0, 0)); query += ` OFFSET $${params.length}`
    }
    const result = await pool.query(query, params)
    res.json(stripInventoryFinancials(result.rows, req))
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
    res.json(stripInventoryFinancials(result.rows, req))
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
router.get('/impact', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        i.id, i.name AS item_name, i.quantity, i.min_quantity, i.unit,
        m.id AS menu_item_id, m.name AS menu_item_name, m.name_ar AS menu_item_name_ar, m.category,
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
        menu_item_name_ar: row.menu_item_name_ar,
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
  const { name, category, quantity, unit, min_quantity, cost, purchase_unit, units_per_purchase_unit } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost, purchase_unit, units_per_purchase_unit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, category || 'general', quantity, unit || 'pcs', min_quantity || 0, cost || null,
       purchase_unit || null, units_per_purchase_unit || null]
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
    broadcast('inventory_updated', { id: created.id, action: 'created' })
    res.status(201).json(created)
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// ── PATCH /api/inventory/bulk-stocktake — MUST come before /:id ───────────────
// Body: { items: [{ id, quantity?, min_quantity? }] } — single transaction.
// quantity sets the counted on-hand amount (records a 'stocktake' movement);
// min_quantity sets the low-stock threshold. Either or both may be provided,
// so staff can enter counts and thresholds in one pass.
router.patch('/bulk-stocktake', async (req, res, next) => {
  const { items } = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const results = []
    for (const { id, quantity, min_quantity } of items) {
      const hasQty = quantity !== undefined && quantity !== null && quantity !== ''
      const hasMin = min_quantity !== undefined && min_quantity !== null && min_quantity !== ''
      const qty = hasQty ? parseFloat(quantity) : null
      const minQty = hasMin ? parseFloat(min_quantity) : null
      if (!id) continue
      if (hasQty && (isNaN(qty) || qty < 0)) continue
      if (hasMin && (isNaN(minQty) || minQty < 0)) continue
      if (!hasQty && !hasMin) continue
      const prev = await client.query('SELECT quantity, unit, name FROM inventory WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id])
      if (!prev.rows.length) continue
      const { quantity: oldQty, unit } = prev.rows[0]
      const r = await client.query(
        `UPDATE inventory SET
           quantity = COALESCE($1, quantity),
           min_quantity = COALESCE($2, min_quantity),
           updated_at = NOW()
         WHERE id=$3 RETURNING *`,
        [hasQty ? qty.toFixed(3) : null, hasMin ? minQty.toFixed(3) : null, id]
      )
      if (hasQty) {
        const delta = qty - parseFloat(oldQty)
        if (Math.abs(delta) > 0.0001) {
          await recordStockMovement(client, {
            inventoryItemId: id,
            change: parseFloat(delta.toFixed(3)),
            quantityAfter: qty,
            movementType: 'stocktake',
            note: `Stocktake: ${parseFloat(oldQty).toFixed(3)} → ${qty.toFixed(3)} ${unit}`,
          })
        } else {
          // Count confirmed the system quantity — still record it so the item
          // shows as "counted" (last_counted_at) even when nothing changed.
          await recordStockMovement(client, {
            inventoryItemId: id,
            change: 0,
            quantityAfter: qty,
            movementType: 'stocktake',
            note: `Stocktake: count confirmed at ${qty.toFixed(3)} ${unit}`,
            allowZero: true,
          })
        }
      }
      results.push(r.rows[0])
    }
    await client.query('COMMIT')
    if (results.length) broadcast('inventory_updated', { action: 'stocktake', count: results.length })
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
      const { name, category, quantity, unit, min_quantity, cost, purchase_unit, units_per_purchase_unit } = req.body
      result = await client.query(
        `UPDATE inventory SET
          name=COALESCE($1,name), category=COALESCE($2,category),
          quantity=COALESCE($3,quantity), unit=COALESCE($4,unit),
          min_quantity=COALESCE($5,min_quantity), cost=COALESCE($6,cost),
          purchase_unit=COALESCE($7,purchase_unit),
          units_per_purchase_unit=COALESCE($8,units_per_purchase_unit),
          updated_at=NOW()
         WHERE id=$9 RETURNING *`,
        [name, category, quantity !== undefined ? parseFloat(quantity) : null,
         unit, min_quantity !== undefined ? parseFloat(min_quantity) : null,
         cost !== undefined ? parseFloat(cost) : null,
         purchase_unit !== undefined ? (purchase_unit || null) : null,
         units_per_purchase_unit !== undefined ? parseFloat(units_per_purchase_unit) : null,
         req.params.id]
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
    broadcast('inventory_updated', { id: parseInt(req.params.id), action: 'updated' })
    res.json(result.rows[0])
  } catch (err) {
    await client.query('ROLLBACK'); logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// ── DELETE /api/inventory/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    // Soft delete bypasses the FK, so guard explicitly: an item still linked
    // from recipe_ingredients must not disappear or stock deduction for those
    // dishes silently stops (this broke deduction menu-wide once).
    const refs = await pool.query(
      `SELECT COUNT(DISTINCT ri.menu_item_id)::int AS dishes, COUNT(*)::int AS lines
       FROM recipe_ingredients ri WHERE ri.inventory_item_id = $1`,
      [req.params.id]
    )
    if (refs.rows[0].lines > 0) {
      return res.status(409).json({
        error: `Item is used by ${refs.rows[0].lines} recipe ingredient(s) across ${refs.rows[0].dishes} dish(es). Unlink it from those recipes first.`,
        recipe_lines: refs.rows[0].lines,
        recipe_dishes: refs.rows[0].dishes,
      })
    }
    const result = await pool.query('UPDATE inventory SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    broadcast('inventory_updated', { id: parseInt(req.params.id), action: 'deleted' })
    res.json({ success: true })
  } catch (err) {
    // FK violation — item is used in recipes
    if (err.code === '23503') return res.status(409).json({ error: 'Item is used in recipes. Remove from recipes first.' })
    logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' })
  }
})

export default router
