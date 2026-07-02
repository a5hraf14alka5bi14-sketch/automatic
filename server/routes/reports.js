import express from 'express'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { logger } from '../logger.js'

const router = express.Router()

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateFilter(period, alias = 'o') {
  if (period === 'week')  return `${alias}.created_at >= NOW() - INTERVAL '7 days'`
  if (period === 'month') return `DATE_TRUNC('month', ${alias}.created_at) = DATE_TRUNC('month', CURRENT_DATE)`
  return `DATE(${alias}.created_at) = CURRENT_DATE`
}

// ── GET /api/reports ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { period = 'today' } = req.query
  const df = dateFilter(period)

  try {
    const [revenue, foodCost, ordersByType, topByQty, topByRevenue, ordersByStatus, categoryPerf, lowStock, heatmap, trend] = await Promise.all([

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

      pool.query(`
        SELECT COALESCE(SUM(m.food_cost * oi.quantity), 0) AS total_food_cost
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_items  m  ON m.id = oi.menu_item_id
        WHERE ${df} AND o.status = 'completed'
      `),

      pool.query(`
        SELECT type, COUNT(*) AS count, COALESCE(SUM(total),0) AS revenue
        FROM orders o WHERE ${df} GROUP BY type
      `),

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
        ORDER BY qty DESC LIMIT 8
      `),

      pool.query(`
        SELECT oi.name, SUM(oi.quantity * oi.price) AS revenue, SUM(oi.quantity) AS qty
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE ${df} AND o.status != 'cancelled'
        GROUP BY oi.name ORDER BY revenue DESC LIMIT 5
      `),

      pool.query(`SELECT status, COUNT(*) AS count FROM orders o WHERE ${df} GROUP BY status`),

      pool.query(`
        SELECT m.category,
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
        GROUP BY m.category ORDER BY revenue DESC
      `),

      pool.query(`
        SELECT name, quantity, min_quantity, unit, category
        FROM inventory
        WHERE quantity <= min_quantity
        ORDER BY (quantity / NULLIF(min_quantity,0)) ASC, name
      `),

      // ── Hourly sales heatmap (day-of-week × hour-of-day) ─────────────────
      pool.query(`
        SELECT
          EXTRACT(DOW FROM created_at)::int  AS dow,
          EXTRACT(HOUR FROM created_at)::int AS hour,
          COUNT(*)::int                       AS orders,
          COALESCE(SUM(total), 0)::float      AS revenue
        FROM orders o
        WHERE ${df} AND status != 'cancelled'
        GROUP BY dow, hour
        ORDER BY dow, hour
      `),

      // ── Daily cost trend ──────────────────────────────────────────────────
      pool.query(`
        SELECT
          DATE(o.created_at)                     AS date,
          COALESCE(SUM(o.total), 0)::float       AS revenue,
          COALESCE(SUM(m.food_cost * oi.quantity), 0)::float AS food_cost,
          COUNT(DISTINCT o.id)::int              AS orders
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN menu_items m   ON m.id = oi.menu_item_id
        WHERE ${df} AND o.status != 'cancelled'
        GROUP BY DATE(o.created_at)
        ORDER BY date ASC
      `)
    ])

    const r = revenue.rows[0]
    const fc = parseFloat(foodCost.rows[0].total_food_cost)
    const rev = parseFloat(r.revenue)
    const netRevenue = rev - parseFloat(r.tax_collected)
    const grossProfit = netRevenue - fc
    const grossMargin = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 100 * 10) / 10 : 0

    const heatmapGrid = heatmap.rows.map(row => ({
      dow: row.dow, hour: row.hour, orders: row.orders, revenue: parseFloat(row.revenue.toFixed(3))
    }))

    const trendData = trend.rows.map(row => ({
      date:     row.date,
      revenue:  parseFloat(row.revenue.toFixed(3)),
      foodCost: parseFloat(row.food_cost.toFixed(3)),
      orders:   row.orders,
      profit:   parseFloat((row.revenue - row.food_cost).toFixed(3))
    }))

    res.json({
      revenue:         rev,
      taxCollected:    parseFloat(r.tax_collected),
      netRevenue:      parseFloat(netRevenue.toFixed(2)),
      totalOrders:     parseInt(r.total_orders),
      avgOrderValue:   parseFloat(parseFloat(r.avg_order_value).toFixed(2)),
      customersServed: parseInt(r.customers_served),
      totalFoodCost:   parseFloat(fc.toFixed(2)),
      grossProfit:     parseFloat(grossProfit.toFixed(2)),
      grossMargin,
      ordersByType:    ordersByType.rows.map(row => ({ type: row.type, count: parseInt(row.count), revenue: parseFloat(row.revenue) })),
      topItems:        topByQty.rows.map(row => ({ name: row.name, qty: parseInt(row.qty), revenue: parseFloat(parseFloat(row.revenue).toFixed(2)), foodCost: parseFloat(parseFloat(row.food_cost).toFixed(2)) })),
      topByRevenue:    topByRevenue.rows.map(row => ({ name: row.name, revenue: parseFloat(parseFloat(row.revenue).toFixed(2)), qty: parseInt(row.qty) })),
      ordersByStatus:  ordersByStatus.rows.map(row => ({ status: row.status, count: parseInt(row.count) })),
      categoryPerf:    categoryPerf.rows.map(row => ({
        category: row.category, orders: parseInt(row.orders), qtySold: parseInt(row.qty_sold),
        revenue: parseFloat(parseFloat(row.revenue).toFixed(2)),
        foodCost: parseFloat(parseFloat(row.food_cost || 0).toFixed(2)),
        marginPct: parseFloat(row.margin_pct || 0)
      })),
      lowStock:  lowStock.rows,
      heatmap:   heatmapGrid,
      trend:     trendData,
    })
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/reports/export?period=today&format=csv ──────────────────────────
router.get('/export', async (req, res) => {
  const { period = 'today' } = req.query
  const df = dateFilter(period)

  try {
    const [orders, items] = await Promise.all([
      pool.query(`
        SELECT o.id, o.type, o.status, o.total, o.tax, o.payment_method, o.table_number,
               c.name AS customer_name, o.created_at
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE ${df}
        ORDER BY o.created_at DESC
      `),
      pool.query(`
        SELECT oi.order_id, oi.name AS item_name, oi.quantity, oi.price,
               COALESCE(m.food_cost, 0) AS food_cost
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN menu_items m ON m.id = oi.menu_item_id
        WHERE ${df}
        ORDER BY oi.order_id DESC
      `)
    ])

    const itemsByOrder = {}
    for (const i of items.rows) {
      if (!itemsByOrder[i.order_id]) itemsByOrder[i.order_id] = []
      itemsByOrder[i.order_id].push(i)
    }

    const rows = []
    rows.push(['Order ID','Date','Type','Status','Payment','Table','Customer','Item','Qty','Unit Price','Item Total','Food Cost','Order Total','Tax'].join(','))

    for (const o of orders.rows) {
      const ois = itemsByOrder[o.id] || []
      if (ois.length === 0) {
        rows.push([o.id, new Date(o.created_at).toISOString(), o.type, o.status, o.payment_method || '', o.table_number || '', o.customer_name || 'Walk-in', '', '', '', '', '', o.total, o.tax].join(','))
      } else {
        for (const [idx, oi] of ois.entries()) {
          rows.push([
            idx === 0 ? o.id : '',
            idx === 0 ? new Date(o.created_at).toISOString() : '',
            idx === 0 ? o.type : '',
            idx === 0 ? o.status : '',
            idx === 0 ? (o.payment_method || '') : '',
            idx === 0 ? (o.table_number || '') : '',
            idx === 0 ? (o.customer_name || 'Walk-in') : '',
            `"${oi.item_name}"`,
            oi.quantity,
            parseFloat(oi.price).toFixed(3),
            (parseFloat(oi.price) * parseFloat(oi.quantity)).toFixed(3),
            parseFloat(oi.food_cost).toFixed(3),
            idx === 0 ? parseFloat(o.total).toFixed(3) : '',
            idx === 0 ? parseFloat(o.tax).toFixed(3) : '',
          ].join(','))
        }
      }
    }

    const filename = `report-${period}-${new Date().toISOString().slice(0,10)}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send('\uFEFF' + rows.join('\n'))
  } catch (err) {
    logger.error(err?.message || 'Export failed', { path: req.path }); res.status(500).json({ error: 'Export failed' })
  }
})

// ── GET /api/reports/staff?period=today ──────────────────────────────────────
router.get('/staff', requireRole('admin', 'manager'), async (req, res) => {
  const { period = 'today' } = req.query
  const df = dateFilter(period, 'o')

  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.role,
        COUNT(DISTINCT o.id)::int                          AS orders,
        COALESCE(SUM(o.total), 0)::float                  AS revenue,
        COALESCE(AVG(o.total), 0)::float                  AS avg_ticket,
        COALESCE(SUM(ic.item_count), 0)::int              AS items_sold
      FROM users u
      LEFT JOIN orders o
        ON o.user_id = u.id
        AND ${df}
        AND o.status != 'cancelled'
      LEFT JOIN (
        SELECT order_id, COUNT(*)::int AS item_count
        FROM order_items
        GROUP BY order_id
      ) ic ON ic.order_id = o.id
      GROUP BY u.id, u.name, u.role
      ORDER BY revenue DESC, orders DESC
    `)

    res.json(result.rows.map(r => ({
      id:         r.id,
      name:       r.name,
      role:       r.role,
      orders:     r.orders,
      revenue:    parseFloat(parseFloat(r.revenue).toFixed(3)),
      avgTicket:  parseFloat(parseFloat(r.avg_ticket).toFixed(3)),
      itemsSold:  r.items_sold,
    })))
  } catch (err) {
    logger.error(err?.message || 'Staff report error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
