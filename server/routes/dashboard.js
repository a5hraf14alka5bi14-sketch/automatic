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
      monthRevenue,
      avgOrder,
      customersToday,
      lowStock,
      menuItems,
      tablesSetting
    ] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total),0) AS val, COUNT(*) AS cnt FROM orders WHERE DATE(created_at)=CURRENT_DATE AND status!='cancelled'`),
      pool.query(`SELECT COUNT(*) AS val FROM orders WHERE status IN ('pending','preparing','ready')`),
      pool.query(`SELECT COUNT(*) AS val FROM orders WHERE status='pending'`),
      pool.query(`SELECT COALESCE(SUM(total),0) AS val FROM orders WHERE DATE_TRUNC('month',created_at)=DATE_TRUNC('month',CURRENT_DATE) AND status!='cancelled'`),
      pool.query(`SELECT COALESCE(AVG(total),0) AS val FROM orders WHERE DATE(created_at)=CURRENT_DATE AND status!='cancelled'`),
      pool.query(`SELECT COUNT(DISTINCT customer_id) AS val FROM orders WHERE DATE(created_at)=CURRENT_DATE AND customer_id IS NOT NULL`),
      pool.query(`SELECT COUNT(*) AS val FROM inventory WHERE quantity<=min_quantity`),
      pool.query(`SELECT COUNT(*) AS val FROM menu_items WHERE available=true`),
      pool.query(`SELECT value FROM settings WHERE key='tables_count'`)
    ])

    const totalTables = parseInt(tablesSetting.rows[0]?.value || '10')
    const activeDineIn = parseInt(activeOrders.rows[0].val)

    res.json({
      todayRevenue:    parseFloat(todayRevenue.rows[0].val),
      todayOrders:     parseInt(todayRevenue.rows[0].cnt),
      activeOrders:    activeDineIn,
      pendingOrders:   parseInt(pendingOrders.rows[0].val),
      monthRevenue:    parseFloat(monthRevenue.rows[0].val),
      avgOrderValue:   parseFloat(parseFloat(avgOrder.rows[0].val).toFixed(2)),
      customersToday:  parseInt(customersToday.rows[0].val),
      lowStockCount:   parseInt(lowStock.rows[0].val),
      menuItems:       parseInt(menuItems.rows[0].val),
      totalTables,
      tablesOccupied:  Math.min(activeDineIn, totalTables)
    })
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
