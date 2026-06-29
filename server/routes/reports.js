import express from 'express'
import { pool } from '../db.js'

const router = express.Router()

function dateFilter(period, alias = 'o') {
  if (period === 'week') return `${alias}.created_at >= NOW() - INTERVAL '7 days'`
  if (period === 'month') return `DATE_TRUNC('month', ${alias}.created_at) = DATE_TRUNC('month', CURRENT_DATE)`
  return `DATE(${alias}.created_at) = CURRENT_DATE` // default: today
}

router.get('/', async (req, res) => {
  const { period = 'today' } = req.query
  const df = dateFilter(period)

  try {
    const [revenue, foodCost, ordersByType, topByQty, topByRevenue, ordersByStatus, categoryPerf, lowStock] = await Promise.all([

      // ── Revenue & order KPIs ─────────────────────────────────────────────
      pool.query(`
        SELECT
          COALESCE(SUM(total), 0)          AS revenue,
          COALESCE(SUM(tax), 0)            AS tax_collected,
          COUNT(*)                          AS total_orders,
          COALESCE(AVG(total), 0)           AS avg_order_value,
          COUNT(DISTINCT customer_id)       AS customers_served
        FROM orders o
        WHERE ${df} AND o.status != 'cancelled'
      `),

      // ── Food cost of completed orders ────────────────────────────────────
      pool.query(`
        SELECT
          COALESCE(SUM(m.food_cost * oi.quantity), 0) AS total_food_cost
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_items  m  ON m.id = oi.menu_item_id
        WHERE ${df} AND o.status = 'completed'
      `),

      // ── Orders by type ───────────────────────────────────────────────────
      pool.query(`
        SELECT type, COUNT(*) AS count, COALESCE(SUM(total),0) AS revenue
        FROM orders o
        WHERE ${df}
        GROUP BY type
      `),

      // ── Top items by quantity ────────────────────────────────────────────
      pool.query(`
        SELECT oi.name, oi.menu_item_id,
          SUM(oi.quantity)            AS qty,
          SUM(oi.quantity * oi.price) AS revenue,
          COALESCE(AVG(m.food_cost),0) AS food_cost
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN menu_items m ON m.id = oi.menu_item_id
        WHERE ${df} AND o.status != 'cancelled'
        GROUP BY oi.name, oi.menu_item_id
        ORDER BY qty DESC
        LIMIT 8
      `),

      // ── Top items by revenue ─────────────────────────────────────────────
      pool.query(`
        SELECT oi.name,
          SUM(oi.quantity * oi.price) AS revenue,
          SUM(oi.quantity)            AS qty
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE ${df} AND o.status != 'cancelled'
        GROUP BY oi.name
        ORDER BY revenue DESC
        LIMIT 5
      `),

      // ── Orders by status ─────────────────────────────────────────────────
      pool.query(`
        SELECT status, COUNT(*) AS count
        FROM orders o
        WHERE ${df}
        GROUP BY status
      `),

      // ── Category performance ─────────────────────────────────────────────
      pool.query(`
        SELECT
          m.category,
          COUNT(DISTINCT o.id)                AS orders,
          SUM(oi.quantity)                    AS qty_sold,
          SUM(oi.quantity * oi.price)         AS revenue,
          SUM(m.food_cost * oi.quantity)      AS food_cost,
          ROUND(
            CASE WHEN SUM(oi.quantity * oi.price) > 0
              THEN (1 - SUM(m.food_cost * oi.quantity) / SUM(oi.quantity * oi.price)) * 100
              ELSE 0 END
          , 1) AS margin_pct
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN menu_items m ON m.id = oi.menu_item_id
        WHERE ${df} AND o.status != 'cancelled'
        GROUP BY m.category
        ORDER BY revenue DESC
      `),

      // ── Low stock items ──────────────────────────────────────────────────
      pool.query(`
        SELECT name, quantity, min_quantity, unit, category
        FROM inventory
        WHERE quantity <= min_quantity
        ORDER BY (quantity / NULLIF(min_quantity,0)) ASC, name
      `)
    ])

    const r = revenue.rows[0]
    const fc = parseFloat(foodCost.rows[0].total_food_cost)
    const rev = parseFloat(r.revenue)
    const netRevenue = rev - parseFloat(r.tax_collected)
    const grossProfit = netRevenue - fc
    const grossMargin = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 100 * 10) / 10 : 0

    res.json({
      // Revenue KPIs
      revenue:          rev,
      taxCollected:     parseFloat(r.tax_collected),
      netRevenue:       parseFloat(netRevenue.toFixed(2)),
      totalOrders:      parseInt(r.total_orders),
      avgOrderValue:    parseFloat(parseFloat(r.avg_order_value).toFixed(2)),
      customersServed:  parseInt(r.customers_served),

      // Profitability
      totalFoodCost:    parseFloat(fc.toFixed(2)),
      grossProfit:      parseFloat(grossProfit.toFixed(2)),
      grossMargin:      grossMargin,

      // Breakdowns
      ordersByType:     ordersByType.rows.map(row => ({
        type: row.type, count: parseInt(row.count), revenue: parseFloat(row.revenue)
      })),
      topItems:         topByQty.rows.map(row => ({
        name: row.name, qty: parseInt(row.qty),
        revenue: parseFloat(parseFloat(row.revenue).toFixed(2)),
        foodCost: parseFloat(parseFloat(row.food_cost).toFixed(2))
      })),
      topByRevenue:     topByRevenue.rows.map(row => ({
        name: row.name, revenue: parseFloat(parseFloat(row.revenue).toFixed(2)), qty: parseInt(row.qty)
      })),
      ordersByStatus:   ordersByStatus.rows.map(row => ({ status: row.status, count: parseInt(row.count) })),
      categoryPerf:     categoryPerf.rows.map(row => ({
        category: row.category,
        orders: parseInt(row.orders),
        qtySold: parseInt(row.qty_sold),
        revenue: parseFloat(parseFloat(row.revenue).toFixed(2)),
        foodCost: parseFloat(parseFloat(row.food_cost || 0).toFixed(2)),
        marginPct: parseFloat(row.margin_pct || 0)
      })),
      lowStock: lowStock.rows
    })
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' })
  }
})

export default router
