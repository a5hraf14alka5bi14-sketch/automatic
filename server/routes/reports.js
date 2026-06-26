import express from 'express'
import { pool } from '../db.js'

const router = express.Router()

router.get('/', async (req, res) => {
  const { period = 'today' } = req.query
  let dateFilter
  if (period === 'today') dateFilter = `DATE(o.created_at) = CURRENT_DATE`
  else if (period === 'week') dateFilter = `o.created_at >= NOW() - INTERVAL '7 days'`
  else if (period === 'month') dateFilter = `DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', CURRENT_DATE)`
  else dateFilter = `DATE(o.created_at) = CURRENT_DATE`

  try {
    const [revenue, ordersByType, topItems, ordersByStatus] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(total), 0) as revenue,
          COALESCE(SUM(tax), 0) as tax_collected,
          COUNT(*) as total_orders,
          COALESCE(AVG(total), 0) as avg_order_value,
          COUNT(DISTINCT customer_id) as customers_served
        FROM orders o
        WHERE ${dateFilter} AND o.status != 'cancelled'
      `),
      pool.query(`
        SELECT type, COUNT(*) as count
        FROM orders o
        WHERE ${dateFilter}
        GROUP BY type
      `),
      pool.query(`
        SELECT oi.name, SUM(oi.quantity) as qty
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE ${dateFilter} AND o.status != 'cancelled'
        GROUP BY oi.name
        ORDER BY qty DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT status, COUNT(*) as count
        FROM orders o
        WHERE ${dateFilter}
        GROUP BY status
      `)
    ])

    const r = revenue.rows[0]
    res.json({
      revenue: parseFloat(r.revenue),
      taxCollected: parseFloat(r.tax_collected),
      totalOrders: parseInt(r.total_orders),
      avgOrderValue: parseFloat(r.avg_order_value),
      customersServed: parseInt(r.customers_served),
      ordersByType: ordersByType.rows.map(row => ({ type: row.type, count: parseInt(row.count) })),
      topItems: topItems.rows.map(row => ({ name: row.name, qty: parseInt(row.qty) })),
      ordersByStatus: ordersByStatus.rows.map(row => ({ status: row.status, count: parseInt(row.count) }))
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
