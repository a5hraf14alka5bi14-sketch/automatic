import express from 'express'
import { pool } from '../db.js'
import { validate } from '../middleware/validate.js'
import { menuCreateSchema, menuUpdateSchema } from '../validators.js'

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
// Optional pagination: ?limit=&offset= (omit for full list). Sets X-Total-Count.
router.get('/all', async (req, res) => {
  try {
    const { limit, offset } = req.query
    const total = await pool.query('SELECT COUNT(*)::int AS c FROM menu_items')
    res.set('X-Total-Count', String(total.rows[0].c))
    let query = 'SELECT * FROM menu_items ORDER BY category, name'
    const params = []
    if (limit !== undefined) {
      params.push(Math.min(Math.max(parseInt(limit) || 0, 0), 500)); query += ` LIMIT $${params.length}`
      params.push(Math.max(parseInt(offset) || 0, 0)); query += ` OFFSET $${params.length}`
    }
    const result = await pool.query(query, params)
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

// ── GET /api/menu/modifier-groups/:gid/modifiers ─────────────────────────────
router.get('/modifier-groups/:gid/modifiers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM modifiers WHERE group_id=$1 ORDER BY id', [req.params.gid])
    res.json(result.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── POST /api/menu/modifier-groups/:gid/modifiers ────────────────────────────
router.post('/modifier-groups/:gid/modifiers', async (req, res) => {
  const { name, price_delta } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name required' })
  try {
    const result = await pool.query(
      'INSERT INTO modifiers (group_id, name, price_delta) VALUES ($1,$2,$3) RETURNING *',
      [req.params.gid, name.trim(), parseFloat(price_delta || 0)]
    )
    res.status(201).json(result.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── PATCH /api/menu/modifier-groups/:gid ─────────────────────────────────────
router.patch('/modifier-groups/:gid', async (req, res) => {
  const { name, required, max_selections } = req.body
  try {
    const result = await pool.query(
      `UPDATE modifier_groups SET
        name=COALESCE($1,name),
        required=COALESCE($2,required),
        max_selections=COALESCE($3,max_selections)
       WHERE id=$4 RETURNING *`,
      [name || null, required !== undefined ? required : null,
       max_selections !== undefined ? parseInt(max_selections) : null, req.params.gid]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── DELETE /api/menu/modifier-groups/:gid ────────────────────────────────────
router.delete('/modifier-groups/:gid', async (req, res) => {
  try {
    await pool.query('DELETE FROM modifier_groups WHERE id=$1', [req.params.gid])
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── PATCH /api/menu/modifiers/:mid ───────────────────────────────────────────
router.patch('/modifiers/:mid', async (req, res) => {
  const { name, price_delta } = req.body
  try {
    const result = await pool.query(
      `UPDATE modifiers SET name=COALESCE($1,name), price_delta=COALESCE($2,price_delta) WHERE id=$3 RETURNING *`,
      [name || null, price_delta !== undefined ? parseFloat(price_delta) : null, req.params.mid]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── DELETE /api/menu/modifiers/:mid ──────────────────────────────────────────
router.delete('/modifiers/:mid', async (req, res) => {
  try {
    await pool.query('DELETE FROM modifiers WHERE id=$1', [req.params.mid])
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
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
router.post('/', validate(menuCreateSchema), async (req, res) => {
  const { name, category, price, description, image_url, prep_time, tags, food_cost, available } = req.body
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
router.patch('/:id', validate(menuUpdateSchema), async (req, res) => {
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

// ── GET /api/menu/:id/modifier-groups ────────────────────────────────────────
router.get('/:id/modifier-groups', async (req, res) => {
  try {
    const groups = await pool.query(
      'SELECT * FROM modifier_groups WHERE menu_item_id=$1 ORDER BY id',
      [req.params.id]
    )
    const result = []
    for (const g of groups.rows) {
      const mods = await pool.query(
        'SELECT * FROM modifiers WHERE group_id=$1 ORDER BY id',
        [g.id]
      )
      result.push({ ...g, modifiers: mods.rows })
    }
    res.json(result)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── POST /api/menu/:id/modifier-groups ────────────────────────────────────────
router.post('/:id/modifier-groups', async (req, res) => {
  const { name, required, max_selections } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name required' })
  try {
    const result = await pool.query(
      'INSERT INTO modifier_groups (menu_item_id, name, required, max_selections) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, name.trim(), required || false, parseInt(max_selections) || 1]
    )
    res.status(201).json({ ...result.rows[0], modifiers: [] })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
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
