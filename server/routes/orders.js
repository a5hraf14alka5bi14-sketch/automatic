import express from 'express'
import { pool, recordStockMovement } from '../db.js'
import { computeDeductAmount } from '../lib/inventory.js'
import { broadcast } from '../events.js'
import { validate } from '../middleware/validate.js'
import { requireRole } from '../middleware/auth.js'
import {
  orderCreateSchema, orderStatusSchema,
  orderDiscountSchema, orderRushSchema, orderItemDoneSchema
} from '../validators.js'
import { logger } from '../logger.js'

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
          'item_notes', oi.item_notes,
          'modifiers', COALESCE(oi.modifiers, '[]'::jsonb),
          'done', COALESCE(oi.done, false),
          'station', COALESCE(oi.station, 'kitchen')
        ) ORDER BY oi.id
      ) FILTER (WHERE oi.id IS NOT NULL),
      '[]'
    ) AS items
  FROM orders o
  LEFT JOIN users u ON u.id = o.user_id
  LEFT JOIN order_items oi ON oi.order_id = o.id
`

// Fields containing pricing/payment/void data — stripped for kitchen & staff roles.
// These roles need operational detail (items, table, status, rush) but not financial data.
const FINANCIAL_FIELDS = ['subtotal', 'tax', 'total', 'discount', 'discount_type',
  'payment_method', 'loyalty_discount', 'void_reason', 'voided_by', 'voided_at']

function filterOrderFields(rows, role) {
  if (role !== 'kitchen' && role !== 'staff') return rows
  return rows.map(row => {
    const r = { ...row }
    for (const f of FINANCIAL_FIELDS) delete r[f]
    return r
  })
}

// GET all orders
router.get('/', async (req, res) => {
  try {
    const { status, limit, station } = req.query
    let query = ORDERS_SELECT
    const params = []
    const where = []
    if (status) {
      params.push(status.split(','))
      where.push(`o.status = ANY($${params.length}::text[])`)
    }
    if (station && station !== 'all') {
      params.push(station)
      where.push(`o.station = $${params.length}`)
    }
    if (where.length) query += ' WHERE ' + where.join(' AND ')
    query += ` GROUP BY o.id, u.name ORDER BY o.rush DESC, o.created_at DESC`
    if (limit) { query += ` LIMIT $${params.length + 1}`; params.push(parseInt(limit)) }
    res.json(filterOrderFields((await pool.query(query, params)).rows, req.user?.role))
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// GET active order(s) for a specific table — must be before /:id
router.get('/table/:n', async (req, res) => {
  try {
    const n = parseInt(req.params.n)
    if (isNaN(n)) return res.status(400).json({ error: 'Invalid table number' })
    const result = await pool.query(
      `${ORDERS_SELECT}
       WHERE o.table_number=$1 AND o.status NOT IN ('completed','cancelled') AND o.type='dine-in'
       GROUP BY o.id, u.name ORDER BY o.created_at DESC`,
      [n]
    )
    res.json(filterOrderFields(result.rows, req.user?.role))
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// GET orders by customer — must be before /:id
router.get('/customer/:customerId', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const result = await pool.query(
      `${ORDERS_SELECT} WHERE o.customer_id=$1 GROUP BY o.id, u.name ORDER BY o.created_at DESC LIMIT 20`,
      [req.params.customerId]
    )
    res.json(filterOrderFields(result.rows, req.user?.role))
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// GET single order — after all named sub-routes
router.get('/:id', async (req, res) => {
  try {
    const order = await pool.query(
      `${ORDERS_SELECT} WHERE o.id=$1 GROUP BY o.id, u.name`,
      [req.params.id]
    )
    if (!order.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(filterOrderFields([order.rows[0]], req.user?.role)[0])
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// POST create order
router.post('/', validate(orderCreateSchema), async (req, res) => {
  // NOTE: client-supplied subtotal / tax / total are intentionally ignored.
  // The server recomputes all financial values from authoritative DB records.
  const { type, table_number, items, customer_id, notes, discount, discount_type, rush, station } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Fetch authoritative tax rate from settings
    const { taxRate } = await getSettings(client)

    // Reprice every line item from authoritative menu / modifier data
    const repricedItems = []
    let rawSubtotal = 0

    for (const item of items) {
      let unitPrice = 0
      let itemName = item.name || null

      if (item.menu_item_id) {
        const m = await client.query(
          'SELECT name, price FROM menu_items WHERE id=$1 AND deleted_at IS NULL',
          [item.menu_item_id]
        )
        if (!m.rows.length) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: `Menu item ${item.menu_item_id} not found` })
        }
        unitPrice = parseFloat(m.rows[0].price)
        itemName = itemName || m.rows[0].name

        // Validate and sum modifier price-deltas from authoritative source.
        // Each submitted modifier id is verified to belong to a modifier_group
        // that is linked to this menu_item_id.  Any modifier id that is
        // missing, belongs to a different menu item, or is otherwise
        // unrecognised causes the entire order to be rejected so an
        // attacker cannot present a real menu_item_id while omitting valid
        // modifier ids to undercharge the order.
        const mods = Array.isArray(item.modifiers) ? item.modifiers : []
        for (const mod of mods) {
          if (!mod.id) continue // modifiers without an id carry no price (display-only)
          const modRow = await client.query(
            `SELECT m.price_delta
               FROM modifiers m
               JOIN modifier_groups mg ON mg.id = m.group_id
              WHERE m.id = $1 AND mg.menu_item_id = $2`,
            [mod.id, item.menu_item_id]
          )
          if (!modRow.rows.length) {
            await client.query('ROLLBACK')
            return res.status(400).json({
              error: `Modifier ${mod.id} is not valid for menu item ${item.menu_item_id}`
            })
          }
          unitPrice += parseFloat(modRow.rows[0].price_delta || 0)
        }
      } else {
        // Custom / open-priced item (no menu_item_id) — no authoritative source; clamp to ≥ 0
        unitPrice = Math.max(0, parseFloat(item.price || 0))
      }

      rawSubtotal += unitPrice * (item.quantity || 1)
      repricedItems.push({ ...item, _authPrice: unitPrice, name: itemName || 'Item' })
    }

    // Apply discount server-side (cap fixed discount to subtotal)
    const discountVal = Math.max(0, parseFloat(discount || 0))
    const discountType = discount_type === 'percent' ? 'percent' : 'fixed'
    const discountAmt = discountType === 'percent'
      ? rawSubtotal * discountVal / 100
      : Math.min(discountVal, rawSubtotal)
    const discountedSub = Math.max(0, rawSubtotal - discountAmt)
    const serverTax   = parseFloat((discountedSub * taxRate).toFixed(3))
    const serverTotal = parseFloat((discountedSub + serverTax).toFixed(3))

    const orderResult = await client.query(
      `INSERT INTO orders
         (type, table_number, status, subtotal, tax, total, customer_id, notes,
          discount, discount_type, rush, station, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        type || 'dine-in', table_number || null, 'pending',
        parseFloat(discountedSub.toFixed(3)), serverTax, serverTotal,
        customer_id || null, notes || null,
        parseFloat(discountAmt.toFixed(3)), discountType,
        rush || false, station || 'kitchen',
        req.user?.id || null
      ]
    )
    const order = orderResult.rows[0]

    for (const item of repricedItems) {
      await client.query(
        `INSERT INTO order_items
           (order_id, menu_item_id, quantity, price, name, notes, item_notes, modifiers, station)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          order.id, item.menu_item_id || null, item.quantity || 1,
          item._authPrice, item.name,
          item.notes || null, item.item_notes || null,
          JSON.stringify(Array.isArray(item.modifiers) ? item.modifiers : []),
          item.station || 'kitchen'
        ]
      )
    }

    await client.query('COMMIT')
    broadcast('order_created', { id: order.id, type: order.type, table_number: order.table_number, status: 'pending', rush: order.rush })
    res.status(201).json(order)
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// PATCH toggle rush flag
router.patch('/:id/rush', validate(orderRushSchema), async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE orders SET rush=$1, updated_at=NOW() WHERE id=$2 RETURNING id, rush',
      [req.body.rush, req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    broadcast('order_updated', { id: parseInt(req.params.id), rush: req.body.rush })
    res.json(result.rows[0])
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// PATCH apply/remove discount
router.patch('/:id/discount', validate(orderDiscountSchema), async (req, res) => {
  const { discount, discount_type } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Sum original item prices to recalculate totals
    const items = await client.query(
      'SELECT SUM(price * quantity) AS raw_subtotal FROM order_items WHERE order_id=$1',
      [req.params.id]
    )
    const rawSubtotal = parseFloat(items.rows[0]?.raw_subtotal || 0)
    const { taxRate } = await getSettings(client)
    const discountAmt = discount_type === 'percent'
      ? rawSubtotal * discount / 100
      : discount
    const discountedSub = Math.max(0, rawSubtotal - discountAmt)
    const newTax = parseFloat((discountedSub * taxRate).toFixed(3))
    const newTotal = parseFloat((discountedSub + newTax).toFixed(3))
    const result = await client.query(
      `UPDATE orders SET
         discount=$1, discount_type=$2,
         subtotal=$3, tax=$4, total=$5,
         updated_at=NOW()
       WHERE id=$6 AND status NOT IN ('completed','cancelled') RETURNING *`,
      [parseFloat(discountAmt.toFixed(3)), discount_type, parseFloat(discountedSub.toFixed(3)), newTax, newTotal, req.params.id]
    )
    if (!result.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Order not found or already completed' })
    }
    await client.query('COMMIT')
    res.json(result.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// PATCH toggle individual item done in kitchen
router.patch('/:id/items/:itemId/done', validate(orderItemDoneSchema), async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE order_items SET done=$1 WHERE id=$2 AND order_id=$3 RETURNING id, done',
      [req.body.done, req.params.itemId, req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' })
    broadcast('order_updated', { id: parseInt(req.params.id), type: 'item_done' })
    res.json(result.rows[0])
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// PATCH update order status
router.patch('/:id/status', validate(orderStatusSchema), async (req, res) => {
  const { status, payment_method, loyalty_redemption_points, void_reason, void_manager_pin } = req.body

  // Every cancellation requires an explicit reason
  if (status === 'cancelled' && !void_reason?.trim()) {
    return res.status(400).json({ error: 'A reason is required when cancelling an order.' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // FOR UPDATE locks the row so concurrent status transitions serialize — prevents double-deduction
    const prev = await client.query('SELECT status, total, customer_id, loyalty_discount FROM orders WHERE id=$1 FOR UPDATE', [req.params.id])
    if (!prev.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }) }
    const { status: prevStatus, total: orderTotal, customer_id, loyalty_discount: prevLoyaltyDiscount } = prev.rows[0]
    const wasCompleted = prevStatus === 'completed'

    // Voiding a COMPLETED order requires manager/admin role or the correct override PIN
    if (status === 'cancelled' && wasCompleted) {
      if (!['admin', 'manager'].includes(req.user?.role)) {
        const pinRow = await client.query("SELECT value FROM settings WHERE key='void_manager_pin'")
        const storedPin = pinRow.rows[0]?.value
        if (storedPin && (!void_manager_pin || void_manager_pin !== storedPin)) {
          await client.query('ROLLBACK')
          return res.status(403).json({ error: 'Manager override PIN required to void a completed order.' })
        }
      }
    }

    // Build UPDATE dynamically to include void/payment fields only when relevant
    const sets   = []
    const params = [status, req.params.id]

    if (status === 'completed' && payment_method) {
      params.push(payment_method)
      sets.push(`payment_method=$${params.length}`, 'paid_at=NOW()')
    }
    if (status === 'cancelled') {
      params.push(void_reason.trim())
      sets.push(`void_reason=$${params.length}`)
      params.push(req.user?.id ?? null)
      sets.push(`voided_by=$${params.length}`, 'voided_at=NOW()')
    }

    const extraSQL = sets.length ? sets.join(', ') + ', ' : ''
    const result = await client.query(
      `UPDATE orders SET status=$1, ${extraSQL}updated_at=NOW() WHERE id=$2 RETURNING *`,
      params
    )

    if (status === 'completed' && !wasCompleted) {
      const orderItems = await client.query(
        'SELECT menu_item_id, quantity FROM order_items WHERE order_id=$1 AND menu_item_id IS NOT NULL',
        [req.params.id]
      )
      for (const oi of orderItems.rows) {
        const recipe = await client.query(
          `SELECT ri.inventory_item_id, ri.quantity AS ing_qty, ri.unit AS recipe_unit, i.unit AS inv_unit
           FROM recipe_ingredients ri
           JOIN inventory i ON i.id = ri.inventory_item_id
           WHERE ri.menu_item_id=$1 AND ri.inventory_item_id IS NOT NULL`,
          [oi.menu_item_id]
        )
        for (const ri of recipe.rows) {
          const deduct = computeDeductAmount({
            ingQty: ri.ing_qty, recipeUnit: ri.recipe_unit,
            invUnit: ri.inv_unit, orderQty: oi.quantity,
          })
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
              inventoryItemId: ri.inventory_item_id, change: actualDelta,
              quantityAfter: row.new_q, movementType: 'sale',
              referenceType: 'order', referenceId: parseInt(req.params.id)
            })
          }
        }
      }

      if (customer_id) {
        const { loyaltyPerDollar } = await getSettings(client)
        const pointsEarned = Math.floor(parseFloat(orderTotal) * loyaltyPerDollar)

        // Cap redemption points to (a) the customer's actual balance and
        // (b) the maximum points that can be absorbed by the order total.
        // Both caps operate on the point count so the stored monetary discount
        // stays perfectly consistent with the deducted points — ensuring the
        // reversal path can reconstruct the exact point count from the stored
        // discount without rounding drift.
        let requestedRedemption = loyalty_redemption_points && loyalty_redemption_points > 0
          ? parseInt(loyalty_redemption_points) : 0
        if (requestedRedemption > 0) {
          const custRow = await client.query(
            'SELECT loyalty_points FROM customers WHERE id=$1',
            [customer_id]
          )
          const actualBalance = parseInt(custRow.rows[0]?.loyalty_points ?? 0)
          // Cap 1: never redeem more than the customer actually has
          requestedRedemption = Math.min(requestedRedemption, Math.max(0, actualBalance))
          // Cap 2: never redeem more points than the order total can absorb
          const maxRedeemable = loyaltyPerDollar > 0
            ? Math.floor(parseFloat(orderTotal) * loyaltyPerDollar) : 0
          requestedRedemption = Math.min(requestedRedemption, maxRedeemable)
        }
        const pointsToRedeem = requestedRedemption

        // Monetary discount derived directly from capped pointsToRedeem so
        // round-tripping (points → discount → points) is always exact.
        const loyaltyDiscount = loyaltyPerDollar > 0
          ? parseFloat((pointsToRedeem / loyaltyPerDollar).toFixed(3)) : 0

        if (loyaltyDiscount > 0) {
          await client.query('UPDATE orders SET loyalty_discount=$1 WHERE id=$2', [loyaltyDiscount, req.params.id])
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

    // Restock whenever an order LEAVES the completed state (cancelled, or reverted
    // back to an active status). This keeps stock symmetric with the deduction
    // above and prevents double-deduction if the order is completed again later.
    if (wasCompleted && status !== 'completed') {
      const movementType = status === 'cancelled' ? 'cancellation' : 'reversal'
      // Reverse EXACTLY what this order applied to stock by replaying its recorded
      // movement deltas (net per ingredient). This stays symmetric even when the
      // completion deduction was clamped at zero — recomputing from the recipe
      // would otherwise over-restock above the pre-sale level.
      const net = await client.query(
        `SELECT inventory_item_id, SUM(change) AS net
         FROM stock_movements
         WHERE reference_type='order' AND reference_id=$1 AND inventory_item_id IS NOT NULL
         GROUP BY inventory_item_id
         HAVING SUM(change) <> 0`,
        [parseInt(req.params.id)]
      )
      for (const r of net.rows) {
        const restore = -parseFloat(r.net) // net is negative when stock was consumed
        if (restore === 0) continue
        const upd = await client.query(
          `WITH prev AS (SELECT quantity AS q FROM inventory WHERE id=$2)
           UPDATE inventory SET quantity = GREATEST(0, quantity + $1), updated_at=NOW()
           WHERE id=$2
           RETURNING quantity AS new_q, (SELECT q FROM prev) AS old_q`,
          [restore, r.inventory_item_id]
        )
        const row = upd.rows[0]
        const actualDelta = row ? parseFloat(row.new_q) - parseFloat(row.old_q) : 0
        if (actualDelta !== 0) {
          await recordStockMovement(client, {
            inventoryItemId: r.inventory_item_id, change: actualDelta,
            quantityAfter: row.new_q, movementType,
            referenceType: 'order', referenceId: parseInt(req.params.id)
          })
        }
      }
      if (customer_id) {
        const { loyaltyPerDollar } = await getSettings(client)
        // Reverse the completion's loyalty effect exactly: it added
        // (earned - redeemed), so we subtract earned and refund redeemed.
        const pointsEarned = Math.floor(parseFloat(orderTotal) * loyaltyPerDollar)
        const redeemedPoints = Math.round(parseFloat(prevLoyaltyDiscount || 0) * loyaltyPerDollar)
        await client.query(
          `UPDATE customers SET
            total_orders = GREATEST(0, total_orders - 1),
            total_spent = GREATEST(0, total_spent - $1),
            loyalty_points = GREATEST(0, loyalty_points - $2 + $3),
            updated_at = NOW()
           WHERE id = $4`,
          [parseFloat(orderTotal), pointsEarned, redeemedPoints, customer_id]
        )
      }
    }

    await client.query('COMMIT')
    broadcast('order_updated', { id: parseInt(req.params.id), status })
    res.json(result.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// ── POST /api/orders/:id/split-payment ────────────────────────────────────────
router.post('/:id/split-payment', async (req, res, next) => {
  const { method, amount, notes } = req.body
  const METHODS = ['cash', 'card', 'other']
  if (!method || !METHODS.includes(method)) return res.status(400).json({ error: 'Invalid payment method' })
  const amt = parseFloat(amount)
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be positive' })
  try {
    const order = await pool.query('SELECT id, total FROM orders WHERE id=$1', [req.params.id])
    if (!order.rows.length) return res.status(404).json({ error: 'Order not found' })
    const r = await pool.query(
      'INSERT INTO split_payments (order_id, method, amount, notes) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, method, amt.toFixed(3), notes || null]
    )
    // Check if order is now fully paid → auto-complete
    const paid = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS total_paid FROM split_payments WHERE order_id=$1',
      [req.params.id]
    )
    const totalPaid = parseFloat(paid.rows[0].total_paid)
    const orderTotal = parseFloat(order.rows[0].total)
    if (totalPaid >= orderTotal - 0.001) {
      await pool.query(
        "UPDATE orders SET status='completed', paid_at=NOW(), payment_method=$1 WHERE id=$2",
        ['split', req.params.id]
      )
    }
    res.status(201).json({ payment: r.rows[0], total_paid: totalPaid, order_total: orderTotal })
  } catch (err) { next(err) }
})

export default router
