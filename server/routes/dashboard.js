import express from 'express'
import { pool } from '../db.js'
import { logger } from '../logger.js'

const router = express.Router()

router.get('/stats', async (req, res) => {
  try {
    const [
      todayRevenue,
      activeOrders,
      pendingOrders,
      tablesOccupied,
      monthRevenue,
      avgOrder,
      customersToday,
      lowStock,
      menuItems,
      tablesSetting,
      deliveryCounts,
      takeawayCounts,
    ] = await Promise.all([
      // Revenue = money actually collected → only PAID orders (payment_method set).
      // A pay-later order the kitchen completed but that hasn't been paid yet
      // must NOT inflate revenue.
      pool.query(`SELECT COALESCE(SUM(total),0) AS val, COUNT(*) AS cnt FROM orders WHERE DATE(created_at)=CURRENT_DATE AND status!='cancelled' AND payment_method IS NOT NULL`),
      // Active orders: how many are in progress + how much they're worth (unpaid, in-flight).
      pool.query(`SELECT COUNT(*) AS val, COALESCE(SUM(total),0) AS amt FROM orders WHERE status IN ('pending','preparing','ready')`),
      pool.query(`SELECT COUNT(*) AS val FROM orders WHERE status='pending'`),
      // Tables occupied = DISTINCT dine-in tables with an active order (matches the
      // POS Table View), NOT the number of active orders — two orders on one table
      // still occupy a single table.
      pool.query(`SELECT COUNT(DISTINCT table_number) AS val FROM orders WHERE status IN ('pending','preparing','ready') AND type='dine-in' AND table_number IS NOT NULL`),
      pool.query(`SELECT COALESCE(SUM(total),0) AS val FROM orders WHERE DATE_TRUNC('month',created_at)=DATE_TRUNC('month',CURRENT_DATE) AND status!='cancelled' AND payment_method IS NOT NULL`),
      pool.query(`SELECT COALESCE(AVG(total),0) AS val FROM orders WHERE DATE(created_at)=CURRENT_DATE AND status!='cancelled' AND payment_method IS NOT NULL`),
      pool.query(`SELECT COUNT(DISTINCT customer_id) AS val FROM orders WHERE DATE(created_at)=CURRENT_DATE AND customer_id IS NOT NULL`),
      pool.query(`SELECT COUNT(*) AS val FROM inventory WHERE quantity<=min_quantity AND deleted_at IS NULL`),
      pool.query(`SELECT COUNT(*) AS val FROM menu_items WHERE available=true AND deleted_at IS NULL`),
      pool.query(`SELECT value FROM settings WHERE key='tables_count'`),
      // Delivery: new (pending) + in-progress (preparing/ready)
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE status='pending')                      AS new_count,
        COUNT(*) FILTER (WHERE status IN ('preparing','ready'))       AS active_count
        FROM orders WHERE type='delivery' AND status IN ('pending','preparing','ready')`),
      // Takeaway: new (pending) + in-progress (preparing/ready)
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE status='pending')                      AS new_count,
        COUNT(*) FILTER (WHERE status IN ('preparing','ready'))       AS active_count
        FROM orders WHERE type='takeaway' AND status IN ('pending','preparing','ready')`),
    ])

    const totalTables = parseInt(tablesSetting.rows[0]?.value || '10')

    const stats = {
      todayRevenue:      parseFloat(todayRevenue.rows[0].val),
      todayOrders:       parseInt(todayRevenue.rows[0].cnt),
      activeOrders:      parseInt(activeOrders.rows[0].val),
      activeOrdersValue: parseFloat(activeOrders.rows[0].amt),
      pendingOrders:     parseInt(pendingOrders.rows[0].val),
      monthRevenue:      parseFloat(monthRevenue.rows[0].val),
      avgOrderValue:     parseFloat(parseFloat(avgOrder.rows[0].val).toFixed(2)),
      customersToday:    parseInt(customersToday.rows[0].val),
      lowStockCount:     parseInt(lowStock.rows[0].val),
      menuItems:         parseInt(menuItems.rows[0].val),
      totalTables,
      tablesOccupied:    Math.min(parseInt(tablesOccupied.rows[0].val), totalTables),
      deliveryNew:       parseInt(deliveryCounts.rows[0].new_count || 0),
      deliveryActive:    parseInt(deliveryCounts.rows[0].active_count || 0),
      takeawayNew:       parseInt(takeawayCounts.rows[0].new_count || 0),
      takeawayActive:    parseInt(takeawayCounts.rows[0].active_count || 0),
    }

    // Same policy as order financial-field filtering: kitchen/staff see
    // operational counts but not revenue figures. Cashier handles payments,
    // so day-level revenue stays visible to them (intentional).
    if (req.user?.role === 'kitchen' || req.user?.role === 'staff') {
      delete stats.todayRevenue
      delete stats.monthRevenue
      delete stats.avgOrderValue
      delete stats.activeOrdersValue
    }

    res.json(stats)
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/dashboard/hourly — today's revenue bucketed by hour (0-23)
// Kitchen/staff receive empty array (no revenue visibility).
router.get('/hourly', async (req, res) => {
  const role = req.user?.role
  if (role === 'kitchen' || role === 'staff') return res.json([])

  try {
    const { rows } = await pool.query(`
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
             COALESCE(SUM(total), 0)            AS revenue
      FROM   orders
      WHERE  DATE(created_at) = CURRENT_DATE
        AND  status            != 'cancelled'
        AND  payment_method    IS NOT NULL
      GROUP  BY 1
      ORDER  BY 1
    `)

    const LABEL = h =>
      h === 0  ? '12a'
      : h < 12 ? `${h}a`
      : h === 12 ? '12p'
      : `${h - 12}p`

    // Build full 0-23 array; fill in DB rows
    const map = {}
    for (const r of rows) map[r.hour] = parseFloat(r.revenue)

    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h, label: LABEL(h), revenue: map[h] || 0,
    }))

    res.json(hourly)
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
