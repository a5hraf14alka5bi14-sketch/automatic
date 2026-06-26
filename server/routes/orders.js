import express from 'express'
import { pool } from '../db.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const { status, limit } = req.query
    let query = `
      SELECT o.*,
        COUNT(oi.id) AS items_count
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
    `
    const params = []
    if (status) {
      const statuses = status.split(',')
      query += ` WHERE o.status = ANY($1::text[])`
      params.push(statuses)
    }
    query += ` GROUP BY o.id ORDER BY o.created_at DESC`
    if (limit) {
      query += ` LIMIT $${params.length + 1}`
      params.push(parseInt(limit))
    }
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id])
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id])
    res.json({ ...orderResult.rows[0], items: itemsResult.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

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
        const menuItem = await client.query('SELECT name FROM menu_items WHERE id = $1', [item.menu_item_id])
        itemName = menuItem.rows[0]?.name
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
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body
  const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled']
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' })
  try {
    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
