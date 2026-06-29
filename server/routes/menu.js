import express from 'express'
import { pool } from '../db.js'

const router = express.Router()

// ── GET /api/menu — available items only (used by POS) ───────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM menu_items WHERE available = true ORDER BY category, name'
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/menu/all — all items including unavailable (management) ──────────
router.get('/all', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM menu_items ORDER BY category, name'
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/menu/stats ───────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const s = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE available) AS available,
        ROUND(AVG(price)::numeric, 2) AS avg_price,
        ROUND(AVG(food_cost)::numeric, 2) AS avg_cost,
        ROUND(AVG(CASE WHEN price > 0 THEN (price - food_cost) / price * 100 ELSE 0 END)::numeric, 1) AS avg_margin,
        COUNT(DISTINCT category) AS categories
      FROM menu_items
    `)
    res.json(s.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/menu/:id ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const item = await pool.query('SELECT * FROM menu_items WHERE id=$1', [req.params.id])
    if (!item.rows.length) return res.status(404).json({ error: 'Not found' })
    const recipe = await pool.query(
      'SELECT r.*, i.name AS inventory_name, i.unit AS inventory_unit FROM recipe_ingredients r LEFT JOIN inventory i ON r.inventory_item_id=i.id WHERE r.menu_item_id=$1 ORDER BY r.id',
      [req.params.id]
    )
    res.json({ ...item.rows[0], recipe: recipe.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/menu ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, category, price, description, image_url, prep_time, tags, food_cost, available } = req.body
  if (!name || !category || !price) return res.status(400).json({ error: 'name, category, price required' })
  try {
    const result = await pool.query(
      `INSERT INTO menu_items (name, category, price, description, image_url, prep_time, tags, food_cost, available)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, category, parseFloat(price), description || null, image_url || null,
       prep_time ? parseInt(prep_time) : 15, tags || '', parseFloat(food_cost || 0),
       available !== false]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── PATCH /api/menu/:id ───────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { name, category, price, description, available, image_url, prep_time, tags, food_cost } = req.body
  try {
    const result = await pool.query(
      `UPDATE menu_items SET
        name=COALESCE($1,name), category=COALESCE($2,category),
        price=COALESCE($3,price), description=COALESCE($4,description),
        available=COALESCE($5,available), image_url=COALESCE($6,image_url),
        prep_time=COALESCE($7,prep_time), tags=COALESCE($8,tags),
        food_cost=COALESCE($9,food_cost)
       WHERE id=$10 RETURNING *`,
      [name, category, price ? parseFloat(price) : null, description,
       available, image_url, prep_time ? parseInt(prep_time) : null,
       tags, food_cost !== undefined ? parseFloat(food_cost) : null,
       req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /api/menu/:id ──────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE menu_items SET available = false WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /api/menu/:id/hard — permanent delete ──────────────────────────────
router.delete('/:id/hard', async (req, res) => {
  try {
    await pool.query('DELETE FROM menu_items WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/menu/:id/recipe ──────────────────────────────────────────────────
router.get('/:id/recipe', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, i.name AS inventory_name, i.unit AS inventory_unit, i.cost AS inventory_cost
       FROM recipe_ingredients r
       LEFT JOIN inventory i ON r.inventory_item_id=i.id
       WHERE r.menu_item_id=$1 ORDER BY r.id`,
      [req.params.id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/menu/:id/recipe — add ingredient ────────────────────────────────
router.post('/:id/recipe', async (req, res) => {
  const { inventory_item_id, ingredient_name, quantity, unit, cost } = req.body
  try {
    const result = await pool.query(
      `INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, ingredient_name, quantity, unit, cost)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, inventory_item_id || null, ingredient_name, parseFloat(quantity || 1),
       unit || 'pcs', parseFloat(cost || 0)]
    )
    // Recalculate food_cost from all recipe ingredients
    await pool.query(
      `UPDATE menu_items SET food_cost=(
        SELECT COALESCE(SUM(cost*quantity),0) FROM recipe_ingredients WHERE menu_item_id=$1
      ) WHERE id=$1`,
      [req.params.id]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /api/menu/:id/recipe/:rid ─────────────────────────────────────────
router.delete('/:id/recipe/:rid', async (req, res) => {
  try {
    await pool.query('DELETE FROM recipe_ingredients WHERE id=$1 AND menu_item_id=$2', [req.params.rid, req.params.id])
    await pool.query(
      `UPDATE menu_items SET food_cost=(
        SELECT COALESCE(SUM(cost*quantity),0) FROM recipe_ingredients WHERE menu_item_id=$1
      ) WHERE id=$1`,
      [req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
