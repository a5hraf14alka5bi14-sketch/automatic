import express from 'express'
import { pool, recordStockMovement } from '../db.js'

const router = express.Router()

// ── GET /api/inventory/movements ──────────────────────────────────────────────
router.get('/movements', async (req, res, next) => {
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
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM inventory ORDER BY category, name')
    res.json(result.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── GET /api/inventory/low-stock ─────────────────────────────────────────────
router.get('/low-stock', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM inventory WHERE quantity <= min_quantity ORDER BY (quantity / NULLIF(min_quantity,0)) ASC, name'
    )
    res.json(result.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── GET /api/inventory/stats ──────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const s = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE quantity <= min_quantity) AS low_stock,
        COALESCE(SUM(quantity * cost), 0) AS total_value,
        COUNT(DISTINCT category) AS categories
      FROM inventory
    `)
    res.json(s.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── POST /api/inventory ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, category, quantity, unit, min_quantity, cost } = req.body
  if (!name || quantity === undefined) return res.status(400).json({ error: 'name and quantity required' })
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
    console.error(err); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// ── PATCH /api/inventory/:id ──────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
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
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// ── DELETE /api/inventory/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM inventory WHERE id=$1 RETURNING id', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) {
    // FK violation — item is used in recipes
    if (err.code === '23503') return res.status(409).json({ error: 'Item is used in recipes. Remove from recipes first.' })
    console.error(err); res.status(500).json({ error: 'Server error' })
  }
})

export default router
