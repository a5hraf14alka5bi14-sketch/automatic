import express from 'express'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { logger } from '../logger.js'

const router = express.Router()

// Reports expose aggregated business data — management only (backend authority
// for the frontend route guard on /reports).
router.use(requireRole('admin', 'manager'))

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateFilter(period, alias = 'o') {
  const a = alias
  switch (period) {
    case 'yesterday':     return `DATE(${a}.created_at) = CURRENT_DATE - 1`
    case 'week':          return `${a}.created_at >= NOW() - INTERVAL '7 days'`
    case 'last_week':     return `${a}.created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND ${a}.created_at < DATE_TRUNC('week', CURRENT_DATE)`
    case 'month':         return `DATE_TRUNC('month', ${a}.created_at) = DATE_TRUNC('month', CURRENT_DATE)`
    case 'last_month':    return `DATE_TRUNC('month', ${a}.created_at) = DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'`
    case 'this_quarter':  return `DATE_TRUNC('quarter', ${a}.created_at) = DATE_TRUNC('quarter', CURRENT_DATE)`
    case 'last_quarter':  return `DATE_TRUNC('quarter', ${a}.created_at) = DATE_TRUNC('quarter', CURRENT_DATE) - INTERVAL '3 months'`
    case 'this_year':     return `DATE_TRUNC('year', ${a}.created_at) = DATE_TRUNC('year', CURRENT_DATE)`
    case 'last_year':     return `DATE_TRUNC('year', ${a}.created_at) = DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year'`
    default:              return `DATE(${a}.created_at) = CURRENT_DATE`
  }
}

function prevDateFilter(period, alias = 'o') {
  const a = alias
  switch (period) {
    case 'yesterday':     return `DATE(${a}.created_at) = CURRENT_DATE - 2`
    case 'week':          return `${a}.created_at >= NOW() - INTERVAL '14 days' AND ${a}.created_at < NOW() - INTERVAL '7 days'`
    case 'last_week':     return `${a}.created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '14 days' AND ${a}.created_at < DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'`
    case 'month':         return `DATE_TRUNC('month', ${a}.created_at) = DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'`
    case 'last_month':    return `DATE_TRUNC('month', ${a}.created_at) = DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months'`
    case 'this_quarter':  return `DATE_TRUNC('quarter', ${a}.created_at) = DATE_TRUNC('quarter', CURRENT_DATE) - INTERVAL '3 months'`
    case 'last_quarter':  return `DATE_TRUNC('quarter', ${a}.created_at) = DATE_TRUNC('quarter', CURRENT_DATE) - INTERVAL '6 months'`
    case 'this_year':     return `DATE_TRUNC('year', ${a}.created_at) = DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year'`
    case 'last_year':     return `DATE_TRUNC('year', ${a}.created_at) = DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '2 years'`
    default:              return `DATE(${a}.created_at) = CURRENT_DATE - 1`
  }
}

// ── GET /api/reports ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { period = 'today', branch_id } = req.query
  const df  = dateFilter(period)
  const pdf = prevDateFilter(period)
  // Safe branch filter: validate to a positive integer, then embed as a literal
  // in SQL (parameterized injection risk is zero since we've already confirmed
  // it's a positive integer, matching the same pattern used by dateFilter()).
  const branchId = branch_id ? parseInt(branch_id, 10) : null
  if (branch_id && (!Number.isInteger(branchId) || branchId < 1)) {
    return res.status(400).json({ error: 'Invalid branch_id' })
  }
  const bf = branchId ? ` AND o.branch_id = ${branchId}` : ''

  try {
    const [revenue, foodCost, ordersByType, topByQty, topByRevenue, ordersByStatus, categoryPerf, lowStock, heatmap, trend,
           prevData, byPayment, prevByType, topTables, monthlyRevenue] = await Promise.all([

      pool.query(`
        SELECT
          COALESCE(SUM(total), 0)                                            AS revenue,
          COALESCE(SUM(tax), 0)                                              AS tax_collected,
          COUNT(*)                                                            AS total_orders,
          COALESCE(AVG(total), 0)                                            AS avg_order_value,
          COUNT(DISTINCT customer_id)                                        AS customers_served,
          COALESCE(SUM(COALESCE(discount,0)),0)                              AS total_discounts,
          COALESCE(SUM(COALESCE(adults_count,0)+COALESCE(kids_count,0)),0)  AS total_pax
        FROM orders o
        WHERE ${df}${bf} AND o.status != 'cancelled'
      `),

      pool.query(`
        SELECT COALESCE(SUM(m.food_cost * oi.quantity), 0) AS total_food_cost
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_items  m  ON m.id = oi.menu_item_id
        WHERE ${df}${bf} AND o.status = 'completed'
      `),

      pool.query(`
        SELECT type, COUNT(*) AS count, COALESCE(SUM(total),0) AS revenue
        FROM orders o WHERE ${df}${bf} GROUP BY type
      `),

      pool.query(`
        SELECT oi.name, oi.menu_item_id,
          MAX(m.name_ar)              AS name_ar,
          SUM(oi.quantity)            AS qty,
          SUM(oi.quantity * oi.price) AS revenue,
          COALESCE(AVG(m.food_cost),0) AS food_cost
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN menu_items m ON m.id = oi.menu_item_id
        WHERE ${df}${bf} AND o.status != 'cancelled'
        GROUP BY oi.name, oi.menu_item_id
        ORDER BY qty DESC LIMIT 8
      `),

      pool.query(`
        SELECT oi.name, MAX(m.name_ar) AS name_ar, SUM(oi.quantity * oi.price) AS revenue, SUM(oi.quantity) AS qty
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        LEFT JOIN menu_items m ON m.id = oi.menu_item_id
        WHERE ${df}${bf} AND o.status != 'cancelled'
        GROUP BY oi.name, oi.menu_item_id ORDER BY revenue DESC LIMIT 5
      `),

      pool.query(`SELECT status, COUNT(*) AS count FROM orders o WHERE ${df}${bf} GROUP BY status`),

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
        WHERE ${df}${bf} AND o.status != 'cancelled'
        GROUP BY m.category ORDER BY revenue DESC
      `),

      pool.query(`
        SELECT name, quantity, min_quantity, unit, category
        FROM inventory
        WHERE quantity <= min_quantity AND deleted_at IS NULL
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
        WHERE ${df}${bf} AND status != 'cancelled'
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
        WHERE ${df}${bf} AND o.status != 'cancelled'
        GROUP BY DATE(o.created_at)
        ORDER BY date ASC
      `),

      // ── Previous-period totals for % comparison ───────────────────────────
      pool.query(`
        SELECT
          COALESCE(SUM(total), 0)::float                                     AS revenue,
          COUNT(*)::int                                                       AS orders,
          COALESCE(SUM(COALESCE(discount,0)),0)::float                       AS discounts,
          COALESCE(SUM(COALESCE(adults_count,0)+COALESCE(kids_count,0)),0)::int AS pax
        FROM orders o
        WHERE ${pdf}${bf} AND o.status != 'cancelled'
      `),

      // ── Revenue by payment method ─────────────────────────────────────────
      pool.query(`
        SELECT
          COALESCE(payment_method, 'other') AS payment_method,
          COUNT(*)::int                     AS count,
          COALESCE(SUM(total),0)::float     AS revenue
        FROM orders o
        WHERE ${df}${bf} AND o.status != 'cancelled' AND payment_method IS NOT NULL
        GROUP BY payment_method
        ORDER BY revenue DESC
      `),

      // ── Previous period revenue by channel ────────────────────────────────
      pool.query(`
        SELECT type, COALESCE(SUM(total),0)::float AS revenue
        FROM orders o
        WHERE ${pdf}${bf} AND o.status != 'cancelled'
        GROUP BY type
      `),

      // ── Top 5 tables by revenue ───────────────────────────────────────────
      pool.query(`
        SELECT
          table_number::text AS table_number,
          COUNT(DISTINCT o.id)::int    AS orders,
          COALESCE(SUM(total),0)::float AS revenue
        FROM orders o
        WHERE ${df}${bf} AND o.status != 'cancelled' AND table_number IS NOT NULL
        GROUP BY table_number
        ORDER BY revenue DESC
        LIMIT 5
      `),

      // ── Monthly revenue for current year (all 12 months) ─────────────────
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') AS month_label,
          EXTRACT(MONTH FROM created_at)::int              AS month_num,
          COALESCE(SUM(total),0)::float                    AS revenue,
          COUNT(*)::int                                    AS orders
        FROM orders o
        WHERE DATE_TRUNC('year', o.created_at) = DATE_TRUNC('year', CURRENT_DATE)
          AND o.status != 'cancelled'
        GROUP BY DATE_TRUNC('month', created_at), EXTRACT(MONTH FROM created_at)
        ORDER BY month_num
      `)
    ])

    const r   = revenue.rows[0]
    const fc  = parseFloat(foodCost.rows[0].total_food_cost)
    const rev = parseFloat(r.revenue)
    const totalDiscounts = parseFloat(r.total_discounts || 0)
    const totalPax       = parseInt(r.total_pax || 0)
    const netRevenue  = rev - parseFloat(r.tax_collected)
    const grossProfit = netRevenue - fc
    const grossMargin = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 100 * 10) / 10 : 0

    const pv = prevData.rows[0]
    const prevPeriod = {
      revenue:   parseFloat(pv.revenue || 0),
      orders:    parseInt(pv.orders || 0),
      discounts: parseFloat(pv.discounts || 0),
      pax:       parseInt(pv.pax || 0),
    }

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

    const prevTypeMap = {}
    for (const row of prevByType.rows) prevTypeMap[row.type] = parseFloat(row.revenue || 0)

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
      totalDiscounts:  parseFloat(totalDiscounts.toFixed(3)),
      totalPax,
      prevPeriod,
      ordersByType:    ordersByType.rows.map(row => ({
        type:    row.type,
        count:   parseInt(row.count),
        revenue: parseFloat(parseFloat(row.revenue).toFixed(2)),
        prevRevenue: parseFloat((prevTypeMap[row.type] || 0).toFixed(2)),
      })),
      byPayment: byPayment.rows.map(row => ({
        method:  row.payment_method,
        count:   row.count,
        revenue: parseFloat(parseFloat(row.revenue).toFixed(2)),
      })),
      topTables: topTables.rows.map(row => ({
        tableNumber: row.table_number,
        orders:      row.orders,
        revenue:     parseFloat(parseFloat(row.revenue).toFixed(2)),
      })),
      monthlyRevenue: monthlyRevenue.rows.map(row => ({
        monthLabel: row.month_label,
        monthNum:   row.month_num,
        revenue:    parseFloat(parseFloat(row.revenue).toFixed(2)),
        orders:     row.orders,
      })),
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
  const { period = 'today', branch_id } = req.query
  const df = dateFilter(period)
  const branchId = branch_id ? parseInt(branch_id, 10) : null
  if (branch_id && (!Number.isInteger(branchId) || branchId < 1)) {
    return res.status(400).json({ error: 'Invalid branch_id' })
  }
  const bf = branchId ? ` AND o.branch_id = ${branchId}` : ''

  try {
    const [orders, items] = await Promise.all([
      pool.query(`
        SELECT o.id, o.type, o.status, o.total, o.tax, o.payment_method, o.table_number,
               c.name AS customer_name, o.created_at
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE ${df}${bf}
        ORDER BY o.created_at DESC
      `),
      pool.query(`
        SELECT oi.order_id, oi.name AS item_name, oi.quantity, oi.price,
               COALESCE(m.food_cost, 0) AS food_cost
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN menu_items m ON m.id = oi.menu_item_id
        WHERE ${df}${bf}
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
  const { period = 'today', branch_id } = req.query
  const df = dateFilter(period, 'o')
  const branchId = branch_id ? parseInt(branch_id, 10) : null
  if (branch_id && (!Number.isInteger(branchId) || branchId < 1)) {
    return res.status(400).json({ error: 'Invalid branch_id' })
  }
  const bfOn = branchId ? ` AND o.branch_id = ${branchId}` : ''

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
        AND ${df}${bfOn}
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

// ── GET /api/reports/menu-matrix?period=month ─────────────────────────────────
router.get('/menu-matrix', requireRole('admin', 'manager'), async (req, res) => {
  const { period = 'month', branch_id } = req.query
  const df = dateFilter(period)
  const branchId = branch_id ? parseInt(branch_id, 10) : null
  if (branch_id && (!Number.isInteger(branchId) || branchId < 1)) {
    return res.status(400).json({ error: 'Invalid branch_id' })
  }
  const bfOn = branchId ? ` AND o.branch_id = ${branchId}` : ''

  try {
    const result = await pool.query(`
      SELECT
        m.id, m.name, m.name_ar, m.category,
        m.price::float                                    AS price,
        COALESCE(m.food_cost, 0)::float                  AS food_cost,
        COALESCE(SUM(oi.quantity), 0)::int               AS qty_sold,
        COALESCE(SUM(oi.quantity * oi.price), 0)::float  AS revenue,
        CASE WHEN m.price > 0
          THEN ROUND((1 - COALESCE(m.food_cost, 0) / m.price) * 100, 1)
          ELSE 0 END::float                              AS margin_pct
      FROM menu_items m
      LEFT JOIN order_items oi ON oi.menu_item_id = m.id
      LEFT JOIN orders o
        ON o.id = oi.order_id AND ${df}${bfOn} AND o.status != 'cancelled'
      WHERE m.available = true
      GROUP BY m.id, m.name, m.name_ar, m.category, m.price, m.food_cost
      ORDER BY qty_sold DESC, revenue DESC
    `)

    const items = result.rows
    if (items.length === 0) {
      return res.json({ items: [], avgQty: 0, avgMargin: 0,
        summary: { stars: 0, plowhorses: 0, puzzles: 0, dogs: 0 } })
    }

    const totalQty  = items.reduce((s, i) => s + Number(i.qty_sold), 0)
    const avgQty    = totalQty / items.length
    const avgMargin = items.reduce((s, i) => s + Number(i.margin_pct), 0) / items.length

    const classified = items.map(i => {
      const qty    = Number(i.qty_sold)
      const margin = Number(i.margin_pct)
      const highPop    = qty >= avgQty
      const highProfit = margin >= avgMargin

      let quadrant, emoji, action
      if      ( highPop &&  highProfit) { quadrant = 'star';      emoji = '⭐'; action = 'Promote actively — high value & demand' }
      else if ( highPop && !highProfit) { quadrant = 'plowhorse'; emoji = '🐴'; action = 'Reduce food cost or raise price slightly' }
      else if (!highPop &&  highProfit) { quadrant = 'puzzle';    emoji = '❓'; action = 'Reposition & market to boost demand' }
      else                              { quadrant = 'dog';       emoji = '🐕'; action = 'Review — consider removal or redesign' }

      return {
        id: i.id, name: i.name, name_ar: i.name_ar, category: i.category,
        price:     parseFloat(Number(i.price).toFixed(3)),
        foodCost:  parseFloat(Number(i.food_cost).toFixed(3)),
        qtySold:   qty,
        revenue:   parseFloat(Number(i.revenue).toFixed(3)),
        marginPct: parseFloat(Number(i.margin_pct).toFixed(1)),
        quadrant, emoji, action,
      }
    })

    res.json({
      items: classified,
      avgQty:    parseFloat(avgQty.toFixed(1)),
      avgMargin: parseFloat(avgMargin.toFixed(1)),
      summary: {
        stars:      classified.filter(i => i.quadrant === 'star').length,
        plowhorses: classified.filter(i => i.quadrant === 'plowhorse').length,
        puzzles:    classified.filter(i => i.quadrant === 'puzzle').length,
        dogs:       classified.filter(i => i.quadrant === 'dog').length,
      }
    })
  } catch (err) {
    logger.error(err?.message || 'Menu matrix error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/reports/forecast ─────────────────────────────────────────────────
router.get('/forecast', async (req, res) => {
  try {
    const histResult = await pool.query(`
      SELECT
        DATE(created_at)               AS date,
        COALESCE(SUM(total), 0)::float AS revenue,
        COUNT(*)::int                  AS orders
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '90 days'
        AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `)

    const history = histResult.rows.map(r => ({
      date:    String(r.date).slice(0, 10),
      revenue: parseFloat(Number(r.revenue).toFixed(3)),
      orders:  r.orders,
    }))

    if (history.length < 3) {
      return res.json({ history, forecast: [], stats: null,
        message: 'Need at least 3 days of data for forecasting' })
    }

    const n  = history.length
    const xs = history.map((_, i) => i)
    const ys = history.map(r => r.revenue)

    const sumX  = xs.reduce((a, b) => a + b, 0)
    const sumY  = ys.reduce((a, b) => a + b, 0)
    const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
    const sumX2 = xs.reduce((s, x) => s + x * x, 0)
    const denom = n * sumX2 - sumX * sumX
    const slope     = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
    const intercept = (sumY - slope * sumX) / n

    const dowSums   = Array(7).fill(0)
    const dowCounts = Array(7).fill(0)
    for (const r of history) {
      const dow = new Date(r.date + 'T12:00:00').getDay()
      dowSums[dow] += r.revenue; dowCounts[dow]++
    }
    const globalAvg = sumY / n
    const dowFactor = dowSums.map((s, i) =>
      dowCounts[i] > 0 ? (s / dowCounts[i]) / (globalAvg || 1) : 1)

    const lastDate = new Date(history[history.length - 1].date + 'T12:00:00')
    const forecast = []
    for (let i = 1; i <= 30; i++) {
      const d = new Date(lastDate)
      d.setDate(d.getDate() + i)
      const dow   = d.getDay()
      const trend = Math.max(0, intercept + slope * (n + i - 1))
      const adj   = trend * (0.6 + 0.4 * dowFactor[dow])
      forecast.push({
        date:    d.toISOString().slice(0, 10),
        revenue: parseFloat(Math.max(0, adj).toFixed(3)),
        lower:   parseFloat(Math.max(0, adj * 0.82).toFixed(3)),
        upper:   parseFloat((adj * 1.18).toFixed(3)),
        trend:   parseFloat(Math.max(0, trend).toFixed(3)),
      })
    }

    const recent7 = ys.slice(-7).reduce((a, b) => a + b, 0)
    const prev7   = ys.slice(-14, -7).reduce((a, b) => a + b, 0)

    res.json({
      history,
      forecast,
      stats: {
        avgDailyRevenue: parseFloat((sumY / n).toFixed(3)),
        trendSlope:      parseFloat(slope.toFixed(4)),
        weeklyGrowthPct: prev7 > 0
          ? parseFloat(((recent7 - prev7) / prev7 * 100).toFixed(1)) : 0,
        forecast30Total: parseFloat(forecast.reduce((s, r) => s + r.revenue, 0).toFixed(3)),
        dataPoints:      n,
      }
    })
  } catch (err) {
    logger.error(err?.message || 'Forecast error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/reports/voids — cancelled-order audit report ────────────────────
router.get('/voids', async (req, res) => {
  const { period = 'today' } = req.query
  const df = dateFilter(period)
  try {
    const rows = await pool.query(`
      SELECT
        o.id, o.total, o.subtotal, o.discount, o.status,
        o.void_reason, o.voided_at, o.updated_at, o.paid_at,
        o.created_at, o.payment_method,
        u.name AS voided_by_name,
        (o.paid_at IS NOT NULL OR o.payment_method IS NOT NULL) AS was_completed
      FROM orders o
      LEFT JOIN users u ON u.id = o.voided_by
      WHERE o.status = 'cancelled'
        AND ${df}
      ORDER BY COALESCE(o.voided_at, o.updated_at) DESC
      LIMIT 500
    `)

    const orders = rows.rows

    // summary
    const total_voids     = orders.length
    const voided_value    = orders.reduce((s, r) => s + parseFloat(r.total || 0), 0)
    const with_reason     = orders.filter(r => r.void_reason).length
    const completed_voids = orders.filter(r => r.was_completed).length

    // top reasons
    const reasonMap = {}
    for (const r of orders) {
      const key = r.void_reason?.trim() || ''
      reasonMap[key] = (reasonMap[key] || 0) + 1
    }
    const by_reason = Object.entries(reasonMap)
      .map(([reason, count]) => ({
        reason: reason || null,
        count,
        pct: total_voids ? Math.round(count / total_voids * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    res.json({
      summary: { total_voids, voided_value: parseFloat(voided_value.toFixed(3)), with_reason, completed_voids, by_reason },
      orders,
    })
  } catch (err) {
    logger.error(err?.message, { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/reports/vat ──────────────────────────────────────────────────────
// VAT reconciliation: output VAT (charged on sales) vs input VAT (paid on purchases).
// period: today|week|month. Output VAT uses order created_at; input VAT uses
// PO received_at so we only count VAT on goods actually received.
router.get('/vat', async (req, res, next) => {
  const { period = 'today' } = req.query

  let oFilter, iFilter
  if (period === 'week') {
    oFilter = `o.created_at >= NOW() - INTERVAL '7 days'`
    iFilter = `po.received_at >= NOW() - INTERVAL '7 days'`
  } else if (period === 'month') {
    oFilter = `DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', CURRENT_DATE)`
    iFilter = `DATE_TRUNC('month', po.received_at) = DATE_TRUNC('month', CURRENT_DATE)`
  } else {
    oFilter = `DATE(o.created_at) = CURRENT_DATE`
    iFilter = `DATE(po.received_at) = CURRENT_DATE`
  }

  try {
    const [outputRes, inputRes] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(tax), 0) AS output_vat
        FROM orders o
        WHERE ${oFilter} AND o.status != 'cancelled'
      `),
      pool.query(`
        SELECT
          COALESCE(SUM(poi.input_vat_amount), 0) AS input_vat,
          COALESCE(SUM(poi.quantity * poi.net_unit_cost), 0) AS net_purchases,
          COALESCE(SUM(poi.quantity * poi.unit_cost), 0) AS gross_purchases,
          COUNT(DISTINCT po.id) AS po_count
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.purchase_order_id
        WHERE ${iFilter}
          AND po.status IN ('received', 'partially_received')
      `),
    ])
    const outputVat = parseFloat(outputRes.rows[0].output_vat)
    const inputVat  = parseFloat(inputRes.rows[0].input_vat)
    res.json({
      output_vat:      outputVat,
      input_vat:       inputVat,
      net_vat_payable: parseFloat((outputVat - inputVat).toFixed(3)),
      net_purchases:   parseFloat(inputRes.rows[0].net_purchases),
      gross_purchases: parseFloat(inputRes.rows[0].gross_purchases),
      po_count:        parseInt(inputRes.rows[0].po_count),
    })
  } catch (err) { next(err) }
})

export default router
