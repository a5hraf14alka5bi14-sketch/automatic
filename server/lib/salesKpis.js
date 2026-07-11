import { pool } from '../db.js'

// Authoritative sales KPIs computed straight from the DB for the given period.
// Shared by the AI executive-insights route (/api/ai/insights) and the daily
// OpenAI summary route (/api/integrations/openai/summary) so their financial
// math (revenue, food cost, gross profit/margin) can never drift apart.
//
// period: 'today' | 'week' | 'month' | 'year'
//   'today' uses a calendar-day window (DATE(created_at) = CURRENT_DATE),
//   the others use a rolling N-day window.
const DAY_COUNTS = { today: 1, week: 7, month: 30, year: 365 }

export async function computeSalesKpis(period = 'month') {
  const isToday = period === 'today'
  const days = DAY_COUNTS[period] || DAY_COUNTS.month
  const dateFilter = isToday
    ? 'DATE(o.created_at) = CURRENT_DATE'
    : "o.created_at >= NOW() - ($1::int * INTERVAL '1 day')"
  const params = isToday ? [] : [days]

  const [salesRes, topItemsRes, lowStockRes] = await Promise.all([
    pool.query(`
      SELECT
        COALESCE(SUM(o.total), 0)                                              AS revenue,
        COUNT(*)::int                                                          AS total_orders,
        COALESCE(AVG(o.total), 0)                                              AS avg_order_value,
        COUNT(DISTINCT o.customer_id) FILTER (WHERE o.customer_id IS NOT NULL)::int AS customers_served,
        COALESCE(SUM(oi_fc.food_cost), 0)                                      AS total_food_cost
      FROM orders o
      LEFT JOIN (
        SELECT oi.order_id, SUM(COALESCE(mi.food_cost, 0) * oi.quantity) AS food_cost
        FROM order_items oi
        LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        GROUP BY oi.order_id
      ) oi_fc ON oi_fc.order_id = o.id
      WHERE o.status != 'cancelled' AND ${dateFilter}
    `, params),
    pool.query(`
      SELECT oi.name, MAX(mi.name_ar) AS name_ar, SUM(oi.quantity)::int AS qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      WHERE o.status != 'cancelled' AND ${dateFilter}
      GROUP BY oi.name, oi.menu_item_id ORDER BY qty DESC LIMIT 5
    `, params),
    pool.query(`
      SELECT name FROM inventory
      WHERE quantity <= min_quantity AND deleted_at IS NULL
      ORDER BY (min_quantity - quantity) DESC LIMIT 10
    `),
  ])

  const s = salesRes.rows[0]
  const revenue     = parseFloat(s.revenue)
  const foodCost    = parseFloat(s.total_food_cost)
  const grossProfit = revenue - foodCost
  const grossMargin = revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0
  return {
    revenue,
    totalOrders:     s.total_orders,
    avgOrderValue:   parseFloat(parseFloat(s.avg_order_value).toFixed(3)),
    customersServed: s.customers_served,
    totalFoodCost:   parseFloat(foodCost.toFixed(3)),
    grossProfit:     parseFloat(grossProfit.toFixed(3)),
    grossMargin,
    topItems:        topItemsRes.rows,
    lowStock:        lowStockRes.rows,
  }
}
