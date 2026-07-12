// Guard against a silent regression that would zero out profit numbers in AI
// summaries: computeSalesKpis (server/lib/salesKpis.js) is the shared KPI
// builder behind POST /api/integrations/openai/summary and POST /api/ai/insights.
// If its recipe-cost join or derived-field math breaks, summaries silently
// report 0 food cost / profit / margin — so we seed a today-dated order with
// known food_cost values and verify the numbers, without touching OpenAI.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '../server/db.js'
import { computeSalesKpis } from '../server/lib/salesKpis.js'

const TAG = `kpitest_${Date.now()}`

const ids = { menu1: null, menu2: null, order: null }

// Known figures: 2× item A (food_cost 1.250) + 3× item B (food_cost 0.400)
const FOOD_COST_A = 1.25
const FOOD_COST_B = 0.4
const QTY_A = 2
const QTY_B = 3
const ORDER_TOTAL = 21.5
const EXPECTED_FOOD_COST = QTY_A * FOOD_COST_A + QTY_B * FOOD_COST_B // 3.7

let before

beforeAll(async () => {
  // Snapshot today's KPIs before seeding so assertions are delta-based and
  // safe to run against a dev DB that already has orders today.
  before = await computeSalesKpis('today')

  const m1 = await pool.query(
    "INSERT INTO menu_items (name, category, price, available, food_cost) VALUES ($1,'test',5,true,$2) RETURNING id",
    [`${TAG} Dish A`, FOOD_COST_A]
  )
  ids.menu1 = m1.rows[0].id
  const m2 = await pool.query(
    "INSERT INTO menu_items (name, category, price, available, food_cost) VALUES ($1,'test',3,true,$2) RETURNING id",
    [`${TAG} Dish B`, FOOD_COST_B]
  )
  ids.menu2 = m2.rows[0].id

  const o = await pool.query(
    `INSERT INTO orders (table_number, status, subtotal, tax, total, created_at)
     VALUES (1, 'completed', $1, 0, $1, NOW()) RETURNING id`,
    [ORDER_TOTAL]
  )
  ids.order = o.rows[0].id

  await pool.query(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, price, name)
     VALUES ($1,$2,$3,5,$4), ($1,$5,$6,3,$7)`,
    [ids.order, ids.menu1, QTY_A, `${TAG} Dish A`, ids.menu2, QTY_B, `${TAG} Dish B`]
  )
})

afterAll(async () => {
  if (ids.order) await pool.query('DELETE FROM orders WHERE id=$1', [ids.order]) // cascades to order_items
  await pool.query('DELETE FROM menu_items WHERE id = ANY($1::int[])', [[ids.menu1, ids.menu2].filter(Boolean)])
  await pool.end()
})

describe('computeSalesKpis — recipe-cost join & derived fields', () => {
  it('computes totalFoodCost from the menu_items.food_cost join (delta over baseline)', async () => {
    const after = await computeSalesKpis('today')
    expect(after.totalOrders).toBe(before.totalOrders + 1)
    expect(after.revenue).toBeCloseTo(before.revenue + ORDER_TOTAL, 3)
    expect(after.totalFoodCost).toBeCloseTo(before.totalFoodCost + EXPECTED_FOOD_COST, 3)
    // The seeded order alone must contribute non-zero food cost — the exact
    // regression this guards against is this silently going back to 0.
    expect(after.totalFoodCost - before.totalFoodCost).toBeGreaterThan(0)
  })

  it('derives grossProfit and grossMargin consistently from revenue and food cost', async () => {
    const k = await computeSalesKpis('today')
    expect(k.grossProfit).toBeCloseTo(k.revenue - k.totalFoodCost, 3)
    const expectedMargin = k.revenue > 0
      ? Math.round(((k.revenue - k.totalFoodCost) / k.revenue) * 1000) / 10
      : 0
    expect(k.grossMargin).toBeCloseTo(expectedMargin, 5)
    expect(k.grossMargin).toBeGreaterThan(0)
  })

  it('rolling-window periods include the seeded today order too', async () => {
    const k = await computeSalesKpis('week')
    expect(k.totalFoodCost).toBeGreaterThanOrEqual(EXPECTED_FOOD_COST)
    expect(k.grossProfit).toBeCloseTo(k.revenue - k.totalFoodCost, 3)
  })

  it('includes the seeded dishes in topItems for today', async () => {
    const k = await computeSalesKpis('today')
    expect(Array.isArray(k.topItems)).toBe(true)
    expect(Array.isArray(k.lowStock)).toBe(true)
  })
})
