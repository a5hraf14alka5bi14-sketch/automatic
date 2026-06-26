import express from 'express'
import { pool } from '../db.js'

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
      menuItems
    ] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total),0) as val, COUNT(*) as cnt FROM orders WHERE DATE(created_at) = CURRENT_DATE AND status != 'cancelled'`),
      pool.query(`SELECT COUNT(*) as val FROM orders WHERE status IN ('pending','preparing','ready')`),
      pool.query(`SELECT COUNT(*) as val FROM orders WHERE status = 'pending'`),
      pool.query(`SELECT COALESCE(SUM(total),0) as val FROM orders WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) AND status != 'cancelled'`),
      pool.query(`SELECT COALESCE(AVG(total),0) as val FROM orders WHERE DATE(created_at) = CURRENT_DATE AND status != 'cancelled'`),
      pool.query(`SELECT COUNT(DISTINCT customer_id) as val FROM orders WHERE DATE(created_at) = CURRENT_DATE AND customer_id IS NOT NULL`),
      pool.query(`SELECT COUNT(*) as val FROM inventory WHERE quantity <= min_quantity`),
      pool.query(`SELECT COUNT(*) as val FROM menu_items WHERE available = true`)
    ])

    res.json({
      todayRevenue: parseFloat(todayRevenue.rows[0].val),
      todayOrders: parseInt(todayRevenue.rows[0].cnt),
      activeOrders: parseInt(activeOrders.rows[0].val),
      pendingOrders: parseInt(pendingOrders.rows[0].val),
      monthRevenue: parseFloat(monthRevenue.rows[0].val),
      avgOrderValue: parseFloat(avgOrder.rows[0].val),
      customersToday: parseInt(customersToday.rows[0].val),
      lowStockCount: parseInt(lowStock.rows[0].val),
      menuItems: parseInt(menuItems.rows[0].val),
      totalTables: 10,
      tablesOccupied: Math.min(parseInt(activeOrders.rows[0].val), 10)
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
