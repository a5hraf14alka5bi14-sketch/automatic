// Order integrity hardening (Task: Order Integrity) — split-payment path must
// not bypass completion side effects, must reject payments on closed orders,
// and must cap payments to the outstanding balance. Discount PATCH is capped.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `ointeg_${Date.now()}`
const ADMIN_EMAIL = `${TAG}_admin@test.local`
const PASSWORD = 'TestPass123'
const ids = { admin: null, menu: null, inv: null, customer: null }
const orderIds = []

let admin

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const u = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} admin`, ADMIN_EMAIL, hash, 'admin']
  )
  ids.admin = u.rows[0].id
  admin = request.agent(app)
  const r = await admin.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD })
  expect(r.status).toBe(200)

  const menu = await pool.query(
    "INSERT INTO menu_items (name,category,price,available) VALUES ($1,'test',10.000,true) RETURNING id",
    [`${TAG} Dish`]
  )
  ids.menu = menu.rows[0].id

  const inv = await pool.query(
    "INSERT INTO inventory (name,category,quantity,unit) VALUES ($1,'test',100,'pcs') RETURNING id",
    [`${TAG} Ingredient`]
  )
  ids.inv = inv.rows[0].id
  await pool.query(
    "INSERT INTO recipe_ingredients (menu_item_id,inventory_item_id,ingredient_name,quantity,unit) VALUES ($1,$2,$3,2,'pcs')",
    [ids.menu, ids.inv, `${TAG} Ingredient`]
  )

  const cust = await pool.query(
    'INSERT INTO customers (name,loyalty_points) VALUES ($1,50) RETURNING id',
    [`${TAG} Customer`]
  )
  ids.customer = cust.rows[0].id
})

afterAll(async () => {
  for (const oid of orderIds) {
    await pool.query("DELETE FROM stock_movements WHERE reference_type='order' AND reference_id=$1", [oid])
    await pool.query('DELETE FROM split_payments WHERE order_id=$1', [oid])
    await pool.query('DELETE FROM order_items WHERE order_id=$1', [oid])
    await pool.query('DELETE FROM orders WHERE id=$1', [oid])
  }
  await pool.query('DELETE FROM recipe_ingredients WHERE menu_item_id=$1', [ids.menu])
  if (ids.menu) await pool.query('DELETE FROM menu_items WHERE id=$1', [ids.menu])
  if (ids.inv) await pool.query('DELETE FROM inventory WHERE id=$1', [ids.inv])
  if (ids.customer) await pool.query('DELETE FROM customers WHERE id=$1', [ids.customer])
  await pool.query('DELETE FROM users WHERE id=$1', [ids.admin])
  await pool.end()
})

async function createOrder(extras = {}) {
  const res = await admin.post('/api/orders').send({
    type: 'takeaway',
    items: [{ menu_item_id: ids.menu, quantity: 1 }],
    ...extras,
  })
  expect(res.status).toBe(201)
  orderIds.push(res.body.id)
  return res.body
}

async function invQty() {
  const r = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.inv])
  return parseFloat(r.rows[0].quantity)
}

describe('Split-payment integrity', () => {
  it('rejects a payment exceeding the remaining balance', async () => {
    const order = await createOrder()
    const total = parseFloat(order.total)
    const res = await admin.post(`/api/orders/${order.id}/split-payment`).send({
      method: 'cash', amount: total + 5,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/remaining balance/i)
  })

  it('full split payment completes the order AND deducts inventory (no side-effect bypass)', async () => {
    const before = await invQty()
    const order = await createOrder()
    const total = parseFloat(order.total)
    const res = await admin.post(`/api/orders/${order.id}/split-payment`).send({
      method: 'cash', amount: total,
    })
    expect(res.status).toBe(201)
    const o = await pool.query('SELECT status, payment_method FROM orders WHERE id=$1', [order.id])
    expect(o.rows[0].status).toBe('completed')
    expect(o.rows[0].payment_method).toBe('split')
    // Recipe deduction ran: 2 pcs per dish
    expect(await invQty()).toBeCloseTo(before - 2, 3)
    // Movement recorded for symmetry with the status-route path
    const mv = await pool.query(
      "SELECT SUM(change) AS net FROM stock_movements WHERE reference_type='order' AND reference_id=$1",
      [order.id]
    )
    expect(parseFloat(mv.rows[0].net)).toBeCloseTo(-2, 3)
  })

  it('full split payment updates customer accounting (total_spent, loyalty earn)', async () => {
    const before = await pool.query('SELECT total_spent, loyalty_points, total_orders FROM customers WHERE id=$1', [ids.customer])
    const order = await createOrder({ customer_id: ids.customer })
    const total = parseFloat(order.total)
    const res = await admin.post(`/api/orders/${order.id}/split-payment`).send({ method: 'card', amount: total })
    expect(res.status).toBe(201)
    const after = await pool.query('SELECT total_spent, loyalty_points, total_orders FROM customers WHERE id=$1', [ids.customer])
    expect(parseFloat(after.rows[0].total_spent)).toBeCloseTo(parseFloat(before.rows[0].total_spent) + total, 3)
    expect(after.rows[0].total_orders).toBe(before.rows[0].total_orders + 1)
    expect(after.rows[0].loyalty_points).toBeGreaterThanOrEqual(before.rows[0].loyalty_points)
  })

  it('rejects split payments on a completed order', async () => {
    const order = await createOrder()
    const done = await admin.patch(`/api/orders/${order.id}/status`).send({ status: 'completed', payment_method: 'cash' })
    expect(done.status).toBe(200)
    const res = await admin.post(`/api/orders/${order.id}/split-payment`).send({ method: 'cash', amount: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/already completed/i)
  })

  it('rejects split payments on a cancelled order', async () => {
    const order = await createOrder()
    const c = await admin.patch(`/api/orders/${order.id}/status`).send({ status: 'cancelled', void_reason: 'test' })
    expect(c.status).toBe(200)
    const res = await admin.post(`/api/orders/${order.id}/split-payment`).send({ method: 'cash', amount: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/already cancelled/i)
  })

  it('partial payment leaves the order open', async () => {
    const order = await createOrder()
    const total = parseFloat(order.total)
    const res = await admin.post(`/api/orders/${order.id}/split-payment`).send({ method: 'cash', amount: total / 2 })
    expect(res.status).toBe(201)
    const o = await pool.query('SELECT status FROM orders WHERE id=$1', [order.id])
    expect(o.rows[0].status).toBe('pending')
  })
})

describe('Loyalty reversal symmetry across completion cycles', () => {
  it('re-completion with zero redemption does not over-refund stale loyalty_discount', async () => {
    // Give the customer a known balance
    await pool.query('UPDATE customers SET loyalty_points=50 WHERE id=$1', [ids.customer])
    const order = await createOrder({ customer_id: ids.customer })

    // 1. Complete with a 10-point redemption
    const c1 = await admin.patch(`/api/orders/${order.id}/status`).send({
      status: 'completed', payment_method: 'cash', loyalty_redemption_points: 10,
    })
    expect(c1.status).toBe(200)

    // 2. Revert to pending — the 10 redeemed points are refunded, marker cleared
    const rev = await admin.patch(`/api/orders/${order.id}/status`).send({ status: 'pending' })
    expect(rev.status).toBe(200)
    const afterRevert = await pool.query('SELECT loyalty_discount FROM orders WHERE id=$1', [order.id])
    expect(parseFloat(afterRevert.rows[0].loyalty_discount || 0)).toBeCloseTo(0, 3)
    const balAfterRevert = (await pool.query('SELECT loyalty_points FROM customers WHERE id=$1', [ids.customer])).rows[0].loyalty_points

    // 3. Complete again with ZERO redemption, then revert again —
    //    the customer must end at exactly the same balance (no over-refund).
    const c2 = await admin.patch(`/api/orders/${order.id}/status`).send({
      status: 'completed', payment_method: 'cash',
    })
    expect(c2.status).toBe(200)
    const stored = await pool.query('SELECT loyalty_discount FROM orders WHERE id=$1', [order.id])
    expect(parseFloat(stored.rows[0].loyalty_discount || 0)).toBeCloseTo(0, 3)

    const rev2 = await admin.patch(`/api/orders/${order.id}/status`).send({ status: 'pending' })
    expect(rev2.status).toBe(200)
    const balFinal = (await pool.query('SELECT loyalty_points FROM customers WHERE id=$1', [ids.customer])).rows[0].loyalty_points
    expect(balFinal).toBe(balAfterRevert)
  })
})

describe('Discount PATCH caps', () => {
  it('caps a fixed discount at the order subtotal', async () => {
    const order = await createOrder()
    const res = await admin.patch(`/api/orders/${order.id}/discount`).send({ discount: 9999, discount_type: 'fixed' })
    expect(res.status).toBe(200)
    // discount can never exceed the raw item subtotal (10.000)
    expect(parseFloat(res.body.discount)).toBeCloseTo(10, 3)
    expect(parseFloat(res.body.total)).toBeCloseTo(0, 3)
    expect(parseFloat(res.body.total)).toBeGreaterThanOrEqual(0)
  })

  it('caps a percent discount at 100%', async () => {
    const order = await createOrder()
    const res = await admin.patch(`/api/orders/${order.id}/discount`).send({ discount: 500, discount_type: 'percent' })
    expect(res.status).toBe(200)
    expect(parseFloat(res.body.discount)).toBeCloseTo(10, 3)
    expect(parseFloat(res.body.subtotal)).toBeCloseTo(0, 3)
  })
})

describe('Server-side order repricing (POST /api/orders)', () => {
  it('ignores client-supplied item price and reprices from the menu', async () => {
    // Menu item costs 10.000; client sends 0.001 — server must use 10.000
    const res = await admin.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 1, price: 0.001 }],
    })
    expect(res.status).toBe(201)
    orderIds.push(res.body.id)
    // Subtotal must reflect the real menu price (10.000), not the forged 0.001
    expect(parseFloat(res.body.subtotal)).toBeCloseTo(10, 3)
    expect(parseFloat(res.body.total)).toBeGreaterThan(0)
  })

  it('ignores client-supplied subtotal / tax / total fields', async () => {
    // Client sends forged totals of 0 alongside a real menu item worth 10.000
    const res = await admin.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 1 }],
      subtotal: 0,
      tax: 0,
      total: 0,
    })
    expect(res.status).toBe(201)
    orderIds.push(res.body.id)
    // Server must recompute from authoritative data — total must NOT be 0
    expect(parseFloat(res.body.subtotal)).toBeGreaterThan(0)
    expect(parseFloat(res.body.total)).toBeGreaterThan(0)
  })

  it('rejects an order whose modifier id does not belong to the menu item', async () => {
    const res = await admin.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 1, modifiers: [{ id: 999999 }] }],
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not valid for menu item/i)
  })

  it('caps a percent discount at 100% on order creation', async () => {
    // Sending discount: 500% should not produce a negative total or a stored
    // discount amount larger than the item subtotal
    const res = await admin.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 1 }],
      discount: 500,
      discount_type: 'percent',
    })
    expect(res.status).toBe(201)
    orderIds.push(res.body.id)
    expect(parseFloat(res.body.discount)).toBeCloseTo(10, 3)
    expect(parseFloat(res.body.total)).toBeCloseTo(0, 3)
    expect(parseFloat(res.body.total)).toBeGreaterThanOrEqual(0)
  })
})

describe('Loyalty redemption caps at completion', () => {
  it('caps loyalty redemption to the customer actual balance', async () => {
    // Give customer a known low balance (5 points)
    await pool.query('UPDATE customers SET loyalty_points=5 WHERE id=$1', [ids.customer])
    const before = (await pool.query('SELECT loyalty_points FROM customers WHERE id=$1', [ids.customer])).rows[0].loyalty_points

    const order = await createOrder({ customer_id: ids.customer })

    // Request redemption of 1000 points — customer only has 5
    const res = await admin.patch(`/api/orders/${order.id}/status`).send({
      status: 'completed', payment_method: 'cash', loyalty_redemption_points: 1000,
    })
    expect(res.status).toBe(200)

    const after = (await pool.query('SELECT loyalty_points FROM customers WHERE id=$1', [ids.customer])).rows[0].loyalty_points
    // Balance must not go below zero (GREATEST guard in SQL) and the server
    // must not have deducted more than the customer had
    expect(after).toBeGreaterThanOrEqual(0)
    // Customer started with 5 pts; they cannot have lost more than 5
    expect(before - after).toBeLessThanOrEqual(5)
  })

  it('caps loyalty redemption to the points the order total can absorb', async () => {
    // Ensure customer has a large balance
    await pool.query('UPDATE customers SET loyalty_points=9999 WHERE id=$1', [ids.customer])

    const order = await createOrder({ customer_id: ids.customer })
    const orderTotal = parseFloat(order.total)

    // The loyalty_points_per_omr setting determines the max redeemable points.
    // Request far more points than the order is worth
    const res = await admin.patch(`/api/orders/${order.id}/status`).send({
      status: 'completed', payment_method: 'cash', loyalty_redemption_points: 9999,
    })
    expect(res.status).toBe(200)

    // The stored loyalty_discount must never exceed the order total
    const row = (await pool.query('SELECT loyalty_discount, total FROM orders WHERE id=$1', [order.id])).rows[0]
    expect(parseFloat(row.loyalty_discount)).toBeLessThanOrEqual(orderTotal + 0.001)
  })
})
