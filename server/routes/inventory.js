import express from 'express'
import { pool } from '../db.js'

const router = express.Router()

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
  try {
    const result = await pool.query(
      'INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, category || 'general', quantity, unit || 'pcs', min_quantity || 0, cost || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── PATCH /api/inventory/:id ──────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { name, category, quantity, unit, min_quantity, cost, adjust } = req.body
  try {
    let result
    if (adjust !== undefined) {
      // Relative adjustment: +N or -N
      result = await pool.query(
        'UPDATE inventory SET quantity = GREATEST(0, quantity + $1), updated_at=NOW() WHERE id=$2 RETURNING *',
        [parseFloat(adjust), req.params.id]
      )
    } else {
      result = await pool.query(
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
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
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
