import express from 'express'
import { pool, recordStockMovement } from '../db.js'
import { broadcast } from '../events.js'
import { validate } from '../middleware/validate.js'
import { orderCreateSchema, orderStatusSchema } from '../validators.js'

const router = express.Router()

async function getSettings(client) {
  const r = await client.query("SELECT key, value FROM settings WHERE key IN ('tax_rate','loyalty_points_per_omr')")
  const s = {}
  for (const row of r.rows) s[row.key] = row.value
  return {
    taxRate: parseFloat(s.tax_rate || '11') / 100,
    loyaltyPerDollar: parseInt(s.loyalty_points_per_omr || '1')
  }
}

const ORDERS_SELECT = `
  SELECT o.*,
    u.name AS staff_name,
    COUNT(oi.id) AS items_count,
    COALESCE(
      json_agg(
        json_build_object(
          'id', oi.id,
          'menu_item_id', oi.menu_item_id,
          'name', oi.name,
          'quantity', oi.quantity,
          'price', oi.price,
          'notes', oi.notes,
          'modifiers', COALESCE(oi.modifiers, '[]'::jsonb)
        ) ORDER BY oi.id
      ) FILTER (WHERE oi.id IS NOT NULL),
      '[]'
    ) AS items
  FROM orders o
  LEFT JOIN users u ON u.id = o.user_id
  LEFT JOIN order_items oi ON oi.order_id = o.id
`

router.get('/', async (req, res) => {
  try {
    const { status, limit } = req.query
    let query = ORDERS_SELECT
    const params = []
    if (status) {
      query += ` WHERE o.status = ANY($1::text[])`
      params.push(status.split(','))
    }
    query += ` GROUP BY o.id, u.name ORDER BY o.created_at DESC`
    if (limit) { query += ` LIMIT $${params.length + 1}`; params.push(parseInt(limit)) }
    res.json((await pool.query(query, params)).rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.get('/:id', async (req, res) => {
  try {
    const order = await pool.query(
      `${ORDERS_SELECT} WHERE o.id=$1 GROUP BY o.id, u.name`,
      [req.params.id]
    )
    if (!order.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(order.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.get('/customer/:customerId', async (req, res) => {
  try {
    const result = await pool.query(
      `${ORDERS_SELECT} WHERE o.customer_id=$1 GROUP BY o.id, u.name ORDER BY o.created_at DESC LIMIT 20`,
      [req.params.customerId]
    )
    res.json(result.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.post('/', validate(orderCreateSchema), async (req, res) => {
  const { type, table_number, items, subtotal, tax, total, customer_id, notes } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const orderResult = await client.query(
      'INSERT INTO orders (type, table_number, status, subtotal, tax, total, customer_id, notes, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [type || 'dine-in', table_number || null, 'pending', subtotal || 0, tax || 0, total || 0, customer_id || null, notes || null, req.user?.id || null]
    )
    const order = orderResult.rows[0]
    for (const item of items) {
      let itemName = item.name
      if (!itemName && item.menu_item_id) {
        const m = await client.query('SELECT name FROM menu_items WHERE id=$1', [item.menu_item_id])
        itemName = m.rows[0]?.name
      }
      await client.query(
        'INSERT INTO order_items (order_id, menu_item_id, quantity, price, name, notes, modifiers) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [order.id, item.menu_item_id || null, item.quantity || 1, item.price || 0, itemName || 'Item', item.notes || null,
         JSON.stringify(Array.isArray(item.modifiers) ? item.modifiers : [])]
      )
    }
    await client.query('COMMIT')
    broadcast('order_created', { id: order.id, type: order.type, table_number: order.table_number, status: 'pending' })
    res.status(201).json(order)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

router.patch('/:id/status', validate(orderStatusSchema), async (req, res) => {
  const { status, payment_method, loyalty_redemption_points } = req.body

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const prev = await client.query('SELECT status, total, customer_id FROM orders WHERE id=$1', [req.params.id])
    if (!prev.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }) }
    const { status: prevStatus, total: orderTotal, customer_id } = prev.rows[0]
    const wasCompleted = prevStatus === 'completed'

    const extraFields = status === 'completed' && payment_method
      ? 'payment_method=$3, paid_at=NOW(),'
      : ''
    const params = status === 'completed' && payment_method
      ? [status, req.params.id, payment_method]
      : [status, req.params.id]

    const result = await client.query(
      `UPDATE orders SET status=$1, ${extraFields} updated_at=NOW() WHERE id=$2 RETURNING *`,
      params
    )

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
          const upd = await client.query(
            `WITH prev AS (SELECT quantity AS q FROM inventory WHERE id=$2)
             UPDATE inventory SET quantity = GREATEST(0, quantity - $1), updated_at=NOW()
             WHERE id=$2
             RETURNING quantity AS new_q, (SELECT q FROM prev) AS old_q`,
            [deduct, ri.inventory_item_id]
          )
          const row = upd.rows[0]
          const actualDelta = row ? parseFloat(row.new_q) - parseFloat(row.old_q) : 0
          if (actualDelta !== 0) {
            await recordStockMovement(client, {
              inventoryItemId: ri.inventory_item_id,
              change: actualDelta,
              quantityAfter: row.new_q,
              movementType: 'sale',
              referenceType: 'order',
              referenceId: parseInt(req.params.id)
            })
          }
        }
      }

      if (customer_id) {
        const { loyaltyPerDollar } = await getSettings(client)
        const pointsEarned = Math.floor(parseFloat(orderTotal) * loyaltyPerDollar)

        // Apply loyalty redemption if requested
        const pointsToRedeem = loyalty_redemption_points && loyalty_redemption_points > 0
          ? parseInt(loyalty_redemption_points) : 0
        const loyaltyDiscount = loyaltyPerDollar > 0
          ? parseFloat((pointsToRedeem / loyaltyPerDollar).toFixed(3)) : 0

        if (loyaltyDiscount > 0) {
          await client.query(
            'UPDATE orders SET loyalty_discount=$1 WHERE id=$2',
            [loyaltyDiscount, req.params.id]
          )
        }

        await client.query(
          `UPDATE customers SET
            total_orders = total_orders + 1,
            total_spent = total_spent + $1,
            loyalty_points = GREATEST(0, loyalty_points + $2 - $3),
            updated_at = NOW()
           WHERE id = $4`,
          [parseFloat(orderTotal), pointsEarned, pointsToRedeem, customer_id]
        )
      }
    }

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
          const upd = await client.query(
            `WITH prev AS (SELECT quantity AS q FROM inventory WHERE id=$2)
             UPDATE inventory SET quantity = quantity + $1, updated_at=NOW()
             WHERE id=$2
             RETURNING quantity AS new_q, (SELECT q FROM prev) AS old_q`,
            [restock, ri.inventory_item_id]
          )
          const row = upd.rows[0]
          const actualDelta = row ? parseFloat(row.new_q) - parseFloat(row.old_q) : 0
          if (actualDelta !== 0) {
            await recordStockMovement(client, {
              inventoryItemId: ri.inventory_item_id,
              change: actualDelta,
              quantityAfter: row.new_q,
              movementType: 'cancellation',
              referenceType: 'order',
              referenceId: parseInt(req.params.id)
            })
          }
        }
      }

      if (customer_id && !wasCompleted) {
        const orderTotal2 = prev.rows[0].total
        const { loyaltyPerDollar } = await getSettings(client)
        const pointsToDeduct = Math.floor(parseFloat(orderTotal2) * loyaltyPerDollar)
        await client.query(
          `UPDATE customers SET
            total_orders = GREATEST(0, total_orders - 1),
            total_spent = GREATEST(0, total_spent - $1),
            loyalty_points = GREATEST(0, loyalty_points - $2),
            updated_at = NOW()
           WHERE id = $3`,
          [parseFloat(orderTotal2), pointsToDeduct, customer_id]
        )
      }
    }

    await client.query('COMMIT')
    broadcast('order_updated', { id: parseInt(req.params.id), status })
    res.json(result.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

export default router
