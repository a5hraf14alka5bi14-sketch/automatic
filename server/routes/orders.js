import express from 'express'
import { pool } from '../db.js'

const router = express.Router()

// ── GET /api/orders ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, limit } = req.query
    let query = `
      SELECT o.*, COUNT(oi.id) AS items_count
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
    `
    const params = []
    if (status) {
      query += ` WHERE o.status = ANY($1::text[])`
      params.push(status.split(','))
    }
    query += ` GROUP BY o.id ORDER BY o.created_at DESC`
    if (limit) { query += ` LIMIT $${params.length + 1}`; params.push(parseInt(limit)) }
    res.json((await pool.query(query, params)).rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const order = await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.id])
    if (!order.rows.length) return res.status(404).json({ error: 'Not found' })
    const items = await pool.query(
      `SELECT oi.*, m.food_cost AS item_food_cost
       FROM order_items oi
       LEFT JOIN menu_items m ON m.id = oi.menu_item_id
       WHERE oi.order_id=$1`,
      [req.params.id]
    )
    res.json({ ...order.rows[0], items: items.rows })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ── POST /api/orders ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { type, table_number, items, subtotal, tax, total, customer_id } = req.body
  if (!items || items.length === 0) return res.status(400).json({ error: 'Items required' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const orderResult = await client.query(
      'INSERT INTO orders (type, table_number, status, subtotal, tax, total, customer_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [type || 'dine-in', table_number || null, 'pending', subtotal || 0, tax || 0, total || 0, customer_id || null]
    )
    const order = orderResult.rows[0]
    for (const item of items) {
      let itemName = item.name
      if (!itemName && item.menu_item_id) {
        const m = await client.query('SELECT name FROM menu_items WHERE id=$1', [item.menu_item_id])
        itemName = m.rows[0]?.name
      }
      await client.query(
        'INSERT INTO order_items (order_id, menu_item_id, quantity, price, name) VALUES ($1,$2,$3,$4,$5)',
        [order.id, item.menu_item_id || null, item.quantity || 1, item.price || 0, itemName || 'Item']
      )
    }
    await client.query('COMMIT')
    res.status(201).json(order)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// ── PATCH /api/orders/:id/status ─────────────────────────────────────────────
// When order is completed → auto-deduct recipe ingredients from inventory
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body
  const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled']
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Get previous status to avoid double-deduction
    const prev = await client.query('SELECT status FROM orders WHERE id=$1', [req.params.id])
    if (!prev.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }) }
    const wasCompleted = prev.rows[0].status === 'completed'

    const result = await client.query(
      'UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    )

    // Deduct inventory only when transitioning TO completed (not already completed)
    if (status === 'completed' && !wasCompleted) {
      const orderItems = await client.query(
        'SELECT menu_item_id, quantity FROM order_items WHERE order_id=$1 AND menu_item_id IS NOT NULL',
        [req.params.id]
      )
      for (const oi of orderItems.rows) {
        const recipe = await client.query(
          `SELECT ri.inventory_item_id, ri.quantity AS ing_qty
           FROM recipe_ingredients ri
           WHERE ri.menu_item_id=$1 AND ri.inventory_item_id IS NOT NULL`,
          [oi.menu_item_id]
        )
        for (const ri of recipe.rows) {
          const deduct = parseFloat(ri.ing_qty) * parseInt(oi.quantity)
          await client.query(
            'UPDATE inventory SET quantity = GREATEST(0, quantity - $1), updated_at=NOW() WHERE id=$2',
            [deduct, ri.inventory_item_id]
          )
        }
      }
    }

    // Re-stock if cancelled from completed
    if (status === 'cancelled' && wasCompleted) {
      const orderItems = await client.query(
        'SELECT menu_item_id, quantity FROM order_items WHERE order_id=$1 AND menu_item_id IS NOT NULL',
        [req.params.id]
      )
      for (const oi of orderItems.rows) {
        const recipe = await client.query(
          `SELECT ri.inventory_item_id, ri.quantity AS ing_qty
           FROM recipe_ingredients ri
           WHERE ri.menu_item_id=$1 AND ri.inventory_item_id IS NOT NULL`,
          [oi.menu_item_id]
        )
        for (const ri of recipe.rows) {
          const restock = parseFloat(ri.ing_qty) * parseInt(oi.quantity)
          await client.query(
            'UPDATE inventory SET quantity = quantity + $1, updated_at=NOW() WHERE id=$2',
            [restock, ri.inventory_item_id]
          )
        }
      }
    }

    await client.query('COMMIT')
    res.json(result.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

export default router
