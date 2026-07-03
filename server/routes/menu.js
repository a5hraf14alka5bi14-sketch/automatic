import express from 'express'
import { pool } from '../db.js'
import { validate } from '../middleware/validate.js'
import { requireRole } from '../middleware/auth.js'
import { menuCreateSchema, menuUpdateSchema } from '../validators.js'
import { logger } from '../logger.js'
import { rankInventory, prepareInventory } from '../utils/ingredientMatch.js'
import { computeDeductAmount } from '../lib/inventory.js'

const router = express.Router()

// All write operations require admin or manager role
router.use((req, res, next) => {
  if (req.method === 'GET') return next()
  return requireRole('admin', 'manager')(req, res, next)
})

// ── GET /api/menu — available items only (used by POS) ───────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM menu_items WHERE available = true AND deleted_at IS NULL ORDER BY category, name'
    )
    res.json(result.rows)
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/menu/all — all items including unavailable (management) ──────────
// Optional pagination: ?limit=&offset= (omit for full list). Sets X-Total-Count.
router.get('/all', async (req, res) => {
  try {
    const { limit, offset } = req.query
    const total = await pool.query('SELECT COUNT(*)::int AS c FROM menu_items WHERE deleted_at IS NULL')
    res.set('X-Total-Count', String(total.rows[0].c))
    let query = 'SELECT * FROM menu_items WHERE deleted_at IS NULL ORDER BY category, name'
    const params = []
    if (limit !== undefined) {
      params.push(Math.min(Math.max(parseInt(limit) || 0, 0), 500)); query += ` LIMIT $${params.length}`
      params.push(Math.max(parseInt(offset) || 0, 0)); query += ` OFFSET $${params.length}`
    }
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/menu/barcode/:code — look up item by barcode (POS scanner) ──────
router.get('/barcode/:code', async (req, res) => {
  try {
    const { code } = req.params
    if (!code || code.length < 3) return res.status(400).json({ error: 'Invalid barcode' })
    const r = await pool.query(
      'SELECT * FROM menu_items WHERE barcode = $1 AND deleted_at IS NULL',
      [code.trim()]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Item not found' })
    res.json(r.rows[0])
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
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
      WHERE deleted_at IS NULL
    `)
    res.json(s.rows[0])
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/menu/modifier-groups/:gid/modifiers ─────────────────────────────
router.get('/modifier-groups/:gid/modifiers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM modifiers WHERE group_id=$1 ORDER BY id', [req.params.gid])
    res.json(result.rows)
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
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
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
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
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// ── DELETE /api/menu/modifier-groups/:gid ────────────────────────────────────
router.delete('/modifier-groups/:gid', async (req, res) => {
  try {
    await pool.query('DELETE FROM modifier_groups WHERE id=$1', [req.params.gid])
    res.json({ success: true })
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
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
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// ── DELETE /api/menu/modifiers/:mid ──────────────────────────────────────────
router.delete('/modifiers/:mid', async (req, res) => {
  try {
    await pool.query('DELETE FROM modifiers WHERE id=$1', [req.params.mid])
    res.json({ success: true })
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// ── GET /api/menu/food-cost — all items with cost % & margin ─────────────────
router.get('/food-cost', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        m.id, m.name, m.category, m.price, m.food_cost, m.available,
        CASE WHEN m.price > 0 THEN ROUND((m.food_cost / m.price * 100)::numeric, 1) ELSE 0 END AS food_cost_pct,
        CASE WHEN m.price > 0 THEN ROUND(((m.price - m.food_cost) / m.price * 100)::numeric, 1) ELSE 0 END AS margin_pct,
        COUNT(r.id)::int AS ingredient_count
      FROM menu_items m
      LEFT JOIN recipe_ingredients r ON r.menu_item_id = m.id
      WHERE m.deleted_at IS NULL
      GROUP BY m.id
      ORDER BY food_cost_pct DESC NULLS LAST
    `)
    res.json(result.rows)
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/menu/recipe/link-summary — inventory-link coverage ──────────────
router.get('/recipe/link-summary', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE inventory_item_id IS NOT NULL)::int AS linked,
        COUNT(*) FILTER (WHERE inventory_item_id IS NULL)::int AS unlinked,
        COUNT(DISTINCT ingredient_name) FILTER (WHERE inventory_item_id IS NOT NULL)::int AS distinct_linked,
        COUNT(DISTINCT ingredient_name) FILTER (WHERE inventory_item_id IS NULL)::int AS distinct_unlinked
      FROM recipe_ingredients
    `)
    res.json(r.rows[0])
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/menu/recipe/unlinked — distinct unlinked ingredients + matches ──
// Groups unlinked recipe_ingredients by ingredient_name and attaches ranked
// inventory suggestions so staff can pick the correct item per ingredient.
router.get('/recipe/unlinked', async (req, res) => {
  try {
    const grp = await pool.query(`
      SELECT ri.ingredient_name,
             MIN(ri.unit) AS unit,
             COUNT(*)::int AS occurrences,
             SUM(ri.quantity)::float AS total_quantity,
             MAX(ri.cost)::float AS cost,
             json_agg(DISTINCT m.name) FILTER (WHERE m.name IS NOT NULL) AS dishes
      FROM recipe_ingredients ri
      LEFT JOIN menu_items m ON m.id = ri.menu_item_id
      WHERE ri.inventory_item_id IS NULL
      GROUP BY ri.ingredient_name
      ORDER BY COUNT(*) DESC, ri.ingredient_name
    `)
    const inv = await pool.query('SELECT id, name, unit, cost, quantity, category FROM inventory')
    const prepared = prepareInventory(inv.rows)
    const result = grp.rows.map(g => ({
      ingredient_name: g.ingredient_name,
      unit: g.unit,
      occurrences: g.occurrences,
      total_quantity: g.total_quantity,
      cost: g.cost,
      dishes: g.dishes || [],
      suggestions: rankInventory(g.ingredient_name, prepared, 6),
    }))
    res.json(result)
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/menu/stock-availability — max sellable qty per dish ──────────────
// For every dish that has at least one recipe ingredient LINKED to inventory,
// computes how many can still be sold before the first ingredient hits zero.
// Dishes with no linked ingredients are omitted (their stock is untracked, so
// they are treated as unlimited by the POS). Used to warn cashiers before a
// sale would drive an ingredient negative.
router.get('/stock-availability', async (req, res) => {
  try {
    const rows = (await pool.query(
      `SELECT ri.menu_item_id, ri.quantity AS ing_qty, ri.unit AS recipe_unit,
              i.quantity AS inv_qty, i.unit AS inv_unit
       FROM recipe_ingredients ri
       JOIN inventory i ON i.id = ri.inventory_item_id
       WHERE ri.inventory_item_id IS NOT NULL AND i.deleted_at IS NULL`
    )).rows
    const avail = {}
    for (const r of rows) {
      const perItem = computeDeductAmount({
        ingQty: r.ing_qty, recipeUnit: r.recipe_unit,
        invUnit: r.inv_unit, orderQty: 1,
      })
      // A non-consuming ingredient (perItem <= 0) never limits availability.
      const maxForIng = perItem > 0 ? Math.floor(parseFloat(r.inv_qty) / perItem) : Infinity
      const cur = avail[r.menu_item_id]
      avail[r.menu_item_id] = cur == null ? maxForIng : Math.min(cur, maxForIng)
    }
    // Serialise Infinity (unlimited) as null.
    const out = {}
    for (const [id, v] of Object.entries(avail)) out[id] = Number.isFinite(v) ? v : null
    res.json(out)
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── PATCH /api/menu/recipe/link — link an ingredient name to an inventory item ─
// Links every recipe_ingredients row sharing `ingredient_name` to the chosen
// inventory item so all dishes using it will deduct real stock. Optionally
// syncs the ingredient cost from the inventory item and recalculates food cost.
router.patch('/recipe/link', async (req, res) => {
  const { ingredient_name, inventory_item_id, apply_cost } = req.body
  if (!ingredient_name?.trim() || !inventory_item_id) {
    return res.status(400).json({ error: 'ingredient_name and inventory_item_id are required' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inv = await client.query('SELECT id, cost, unit FROM inventory WHERE id=$1', [inventory_item_id])
    if (!inv.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Inventory item not found' }) }
    const invCost = parseFloat(inv.rows[0].cost || 0)

    const setCost = apply_cost && invCost > 0 ? ', cost=$3' : ''
    const params = apply_cost && invCost > 0
      ? [inventory_item_id, ingredient_name.trim(), invCost]
      : [inventory_item_id, ingredient_name.trim()]
    const upd = await client.query(
      `UPDATE recipe_ingredients SET inventory_item_id=$1${setCost}
       WHERE ingredient_name=$2 RETURNING menu_item_id`,
      params
    )
    const affected = [...new Set(upd.rows.map(r => r.menu_item_id).filter(Boolean))]
    for (const mid of affected) {
      await client.query(
        `UPDATE menu_items SET food_cost=(
          SELECT COALESCE(SUM(cost*quantity),0) FROM recipe_ingredients WHERE menu_item_id=$1
        ) WHERE id=$1`,
        [mid]
      )
    }
    await client.query('COMMIT')
    res.json({ updated: upd.rows.length, affected_dishes: affected.length })
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// ── PATCH /api/menu/recipe/unlink — remove inventory link from an ingredient ──
router.patch('/recipe/unlink', async (req, res) => {
  const { ingredient_name } = req.body
  if (!ingredient_name?.trim()) return res.status(400).json({ error: 'ingredient_name is required' })
  try {
    const upd = await pool.query(
      'UPDATE recipe_ingredients SET inventory_item_id=NULL WHERE ingredient_name=$1 RETURNING id',
      [ingredient_name.trim()]
    )
    res.json({ updated: upd.rows.length })
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/menu/:id ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const item = await pool.query('SELECT * FROM menu_items WHERE id=$1 AND deleted_at IS NULL', [req.params.id])
    if (!item.rows.length) return res.status(404).json({ error: 'Not found' })
    const recipe = await pool.query(
      'SELECT r.*, i.name AS inventory_name, i.unit AS inventory_unit FROM recipe_ingredients r LEFT JOIN inventory i ON r.inventory_item_id=i.id WHERE r.menu_item_id=$1 ORDER BY r.id',
      [req.params.id]
    )
    res.json({ ...item.rows[0], recipe: recipe.rows })
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
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
    logger.error(err?.message || 'Server error', { path: req.path })
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
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /api/menu/:id ──────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE menu_items SET available = false, deleted_at = NOW() WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /api/menu/:id/hard — permanent delete ──────────────────────────────
router.delete('/:id/hard', async (req, res) => {
  try {
    await pool.query('DELETE FROM menu_items WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
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
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
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
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
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
    logger.error(err?.message || 'Server error', { path: req.path })
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
    logger.error(err?.message || 'Server error', { path: req.path })
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
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── PATCH /api/menu/:id/recipe/:rid — update ingredient ───────────────────────
router.patch('/:id/recipe/:rid', async (req, res) => {
  const { quantity, unit, cost, inventory_item_id } = req.body
  // inventory_item_id: undefined = leave unchanged, null = clear link, number = set link
  const linkProvided = Object.prototype.hasOwnProperty.call(req.body, 'inventory_item_id')
  try {
    const result = await pool.query(
      `UPDATE recipe_ingredients SET
        quantity=COALESCE($1,quantity),
        unit=COALESCE($2,unit),
        cost=COALESCE($3,cost),
        inventory_item_id=CASE WHEN $6 THEN $7 ELSE inventory_item_id END
       WHERE id=$4 AND menu_item_id=$5 RETURNING *`,
      [quantity !== undefined ? parseFloat(quantity) : null,
       unit || null,
       cost !== undefined ? parseFloat(cost) : null,
       req.params.rid, req.params.id,
       linkProvided, inventory_item_id ? parseInt(inventory_item_id) : null]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    await pool.query(
      `UPDATE menu_items SET food_cost=(
        SELECT COALESCE(SUM(cost*quantity),0) FROM recipe_ingredients WHERE menu_item_id=$1
      ) WHERE id=$1`,
      [req.params.id]
    )
    res.json(result.rows[0])
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
