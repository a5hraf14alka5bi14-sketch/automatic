// Split-payment batch endpoint — pay-later collection flow.
// Tests POST /api/orders/:id/pay, covering:
//   • single-method payment completes the order correctly
//   • split across two methods (cash+card) completes and records both rows
//   • GET order response includes split_payments after completion
//   • sum-mismatch (too low, too high) returns 400
//   • already-completed order is rejected
//   • invalid payment method is rejected

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `splpay_${Date.now()}`
const ADMIN_EMAIL = `${TAG}_admin@test.local`
const CASHIER_EMAIL = `${TAG}_cashier@test.local`
const KITCHEN_EMAIL = `${TAG}_kitchen@test.local`
const PASSWORD = 'TestPass123!'

const ids = { admin: null, cashier: null, kitchen: null, menu: null }
let admin
let cashier
let kitchen

// ── Helpers ───────────────────────────────────────────────────────────────────

// Split a total into N parts summing exactly to total (3-decimal arithmetic).
// The last part absorbs any rounding remainder.
function splitEvenly(total, n) {
  const base = Math.floor(total * 1000 / n) / 1000
  const rest = parseFloat((total - base * (n - 1)).toFixed(3))
  return [
    ...Array(n - 1).fill(base),
    rest,
  ]
}

async function createOrder(agent, overrides = {}) {
  const r = await agent.post('/api/orders').send({
    type: 'dine-in',
    table_number: 42,
    items: [{ menu_item_id: ids.menu, quantity: 1, price: 10.000 }],
    notes: TAG,
    ...overrides,
  })
  expect(r.status, `create order: ${JSON.stringify(r.body)}`).toBe(201)
  return r.body
}

// Create a fresh pending order (server computes total from settings tax rate)
async function mkOrder() {
  return createOrder(admin)
}

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10)

  const aRes = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} admin`, ADMIN_EMAIL, hash, 'admin']
  )
  ids.admin = aRes.rows[0].id

  const cRes = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} cashier`, CASHIER_EMAIL, hash, 'cashier']
  )
  ids.cashier = cRes.rows[0].id

  const kRes = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} kitchen`, KITCHEN_EMAIL, hash, 'kitchen']
  )
  ids.kitchen = kRes.rows[0].id

  const mRes = await pool.query(
    "INSERT INTO menu_items (name,category,price,available) VALUES ($1,'test',10.000,true) RETURNING id",
    [`${TAG} item`]
  )
  ids.menu = mRes.rows[0].id

  admin = request.agent(app)
  const ar = await admin.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD })
  expect(ar.status).toBe(200)

  cashier = request.agent(app)
  const cr = await cashier.post('/api/auth/login').send({ email: CASHIER_EMAIL, password: PASSWORD })
  expect(cr.status).toBe(200)

  kitchen = request.agent(app)
  const kr = await kitchen.post('/api/auth/login').send({ email: KITCHEN_EMAIL, password: PASSWORD })
  expect(kr.status).toBe(200)
})

afterAll(async () => {
  // Cleanup in dependency order
  await pool.query(
    `DELETE FROM split_payments WHERE order_id IN (SELECT id FROM orders WHERE notes=$1)`, [TAG]
  ).catch(() => {})
  await pool.query(
    `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE notes=$1)`, [TAG]
  ).catch(() => {})
  await pool.query('DELETE FROM orders WHERE notes=$1', [TAG]).catch(() => {})
  await pool.query('DELETE FROM menu_items WHERE name=$1', [`${TAG} item`]).catch(() => {})
  await pool.query(
    'DELETE FROM users WHERE email IN ($1,$2,$3)',
    [ADMIN_EMAIL, CASHIER_EMAIL, KITCHEN_EMAIL]
  ).catch(() => {})
  await pool.end()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/orders/:id/pay — single method', () => {
  it('completes the order and sets payment_method to the given method', async () => {
    const order = await mkOrder()
    const total = parseFloat(order.total)

    const r = await cashier.post(`/api/orders/${order.id}/pay`).send({
      splits: [{ method: 'cash', amount: total }],
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.order.status).toBe('completed')
    expect(r.body.order.payment_method).toBe('cash')
    expect(r.body.split_payments).toHaveLength(1)
    expect(r.body.split_payments[0].method).toBe('cash')
    expect(parseFloat(r.body.split_payments[0].amount)).toBeCloseTo(total, 2)
  })

  it('works with card method', async () => {
    const order = await mkOrder()
    const total = parseFloat(order.total)

    const r = await cashier.post(`/api/orders/${order.id}/pay`).send({
      splits: [{ method: 'card', amount: total }],
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.order.payment_method).toBe('card')
    expect(r.body.order.status).toBe('completed')
  })
})

describe('POST /api/orders/:id/pay — split across methods', () => {
  it('completes order, sets payment_method=split, inserts two split_payments rows', async () => {
    const order = await mkOrder()
    const total = parseFloat(order.total)
    const [part1, part2] = splitEvenly(total, 2)

    const r = await cashier.post(`/api/orders/${order.id}/pay`).send({
      splits: [
        { method: 'cash', amount: part1 },
        { method: 'card', amount: part2 },
      ],
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.order.status).toBe('completed')
    expect(r.body.order.payment_method).toBe('split')
    expect(r.body.split_payments).toHaveLength(2)

    const methods = r.body.split_payments.map(p => p.method)
    expect(methods).toContain('cash')
    expect(methods).toContain('card')

    const paidTotal = r.body.split_payments.reduce((s, p) => s + parseFloat(p.amount), 0)
    expect(paidTotal).toBeCloseTo(total, 2)
  })

  it('three-way split (cash + card + other) is accepted', async () => {
    const order = await mkOrder()
    const total = parseFloat(order.total)
    const [p1, p2, p3] = splitEvenly(total, 3)

    const r = await cashier.post(`/api/orders/${order.id}/pay`).send({
      splits: [
        { method: 'cash', amount: p1 },
        { method: 'card', amount: p2 },
        { method: 'other', amount: p3 },
      ],
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.split_payments).toHaveLength(3)
    expect(r.body.order.payment_method).toBe('split')
  })
})

describe('GET /api/orders/:id — response includes split_payments after batch pay', () => {
  it('split_payments array is present and matches the recorded splits', async () => {
    const order = await mkOrder()
    const total = parseFloat(order.total)
    const [p1, p2] = splitEvenly(total, 2)

    const payRes = await cashier.post(`/api/orders/${order.id}/pay`).send({
      splits: [
        { method: 'cash', amount: p1 },
        { method: 'card', amount: p2 },
      ],
    })
    expect(payRes.status, JSON.stringify(payRes.body)).toBe(200)

    const r = await admin.get(`/api/orders/${order.id}`)
    expect(r.status).toBe(200)
    expect(r.body.payment_method).toBe('split')
    expect(Array.isArray(r.body.split_payments)).toBe(true)
    expect(r.body.split_payments).toHaveLength(2)
  })
})

describe('POST /api/orders/:id/pay — validation errors', () => {
  it('returns 400 when payment sum is less than order total', async () => {
    const order = await mkOrder()
    const total = parseFloat(order.total)
    // Send only 50% of the total
    const r = await cashier.post(`/api/orders/${order.id}/pay`).send({
      splits: [{ method: 'cash', amount: parseFloat((total * 0.5).toFixed(3)) }],
    })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/total/i)
  })

  it('returns 400 when payment sum exceeds order total', async () => {
    const order = await mkOrder()
    const total = parseFloat(order.total)
    const r = await cashier.post(`/api/orders/${order.id}/pay`).send({
      splits: [{ method: 'cash', amount: total + 50 }],
    })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/total/i)
  })

  it('returns 400 for an invalid payment method', async () => {
    const order = await mkOrder()
    const total = parseFloat(order.total)
    const r = await cashier.post(`/api/orders/${order.id}/pay`).send({
      splits: [{ method: 'crypto', amount: total }],
    })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/method/i)
  })

  it('returns 400 when splits array is missing', async () => {
    const order = await mkOrder()
    const r = await cashier.post(`/api/orders/${order.id}/pay`).send({})
    expect(r.status).toBe(400)
  })

  it('returns 400 when splits is an empty array', async () => {
    const order = await mkOrder()
    const r = await cashier.post(`/api/orders/${order.id}/pay`).send({ splits: [] })
    expect(r.status).toBe(400)
  })
})

describe('POST /api/orders/:id/pay — already closed orders', () => {
  it('returns 400 when order is already completed', async () => {
    const order = await mkOrder()
    const total = parseFloat(order.total)

    // Complete the order
    const first = await cashier.post(`/api/orders/${order.id}/pay`).send({
      splits: [{ method: 'cash', amount: total }],
    })
    expect(first.status, 'first payment should succeed').toBe(200)

    // Try to pay again — should be rejected
    const r = await cashier.post(`/api/orders/${order.id}/pay`).send({
      splits: [{ method: 'card', amount: total }],
    })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/completed/i)
  })

  it('returns 404 for a non-existent order id', async () => {
    const r = await admin.post('/api/orders/999999999/pay').send({
      splits: [{ method: 'cash', amount: 1.000 }],
    })
    expect(r.status).toBe(404)
  })
})

describe('RBAC — POST /api/orders/:id/pay', () => {
  it('returns 403 for kitchen role (role not allowed to collect payment)', async () => {
    const order = await mkOrder()
    const total = parseFloat(order.total)

    const r = await kitchen.post(`/api/orders/${order.id}/pay`).send({
      splits: [{ method: 'cash', amount: total }],
    })
    expect(r.status).toBe(403)
  })
})
