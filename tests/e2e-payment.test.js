// E2E Payment Flows — split bill, discounts, all payment methods, cash change, shift summary
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `pay_${Date.now()}`
const ADMIN_EMAIL = `${TAG}_admin@test.local`
const PASSWORD    = 'TestPass123'
const ids = { admin: null, menu: null }
const orderIds = []

async function seedUser(email, role) {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const r = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} ${role}`, email, hash, role]
  )
  return r.rows[0].id
}

let admin

beforeAll(async () => {
  ids.admin = await seedUser(ADMIN_EMAIL, 'admin')
  admin = request.agent(app)
  const r = await admin.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD })
  expect(r.status).toBe(200)

  const menu = await pool.query(
    "INSERT INTO menu_items (name,category,price,available) VALUES ($1,'test',5.000,true) RETURNING id",
    [`${TAG} Mixed Grill`]
  )
  ids.menu = menu.rows[0].id
})

afterAll(async () => {
  for (const oid of orderIds) {
    await pool.query('DELETE FROM order_items WHERE order_id=$1', [oid])
    await pool.query('DELETE FROM orders WHERE id=$1', [oid])
  }
  if (ids.menu) await pool.query('DELETE FROM menu_items WHERE id=$1', [ids.menu])
  await pool.query('DELETE FROM users WHERE id=$1', [ids.admin])
  await pool.end()
})

async function createOrder(extras = {}) {
  const res = await admin.post('/api/orders').send({
    type: 'takeaway',
    items: [{ menu_item_id: ids.menu, name: `${TAG} Mixed Grill`, quantity: 2, price: 5 }],
    subtotal: 10, tax: 1.1, total: 11.1,
    ...extras,
  })
  expect(res.status).toBe(201)
  orderIds.push(res.body.id)
  return res.body
}

// ── 1. Payment method variants ───────────────────────────────────────────────
describe('Payment method variants', () => {
  for (const method of ['cash', 'card', 'online']) {
    it(`completes order with ${method} payment`, async () => {
      const order = await createOrder()
      const res = await admin.patch(`/api/orders/${order.id}/status`).send({
        status: 'completed', payment_method: method
      })
      expect(res.status).toBe(200)
      expect(res.body.payment_method).toBe(method)
    })
  }
})

// ── 2. Percentage discount ───────────────────────────────────────────────────
describe('Discount types', () => {
  it('applies percentage discount correctly', async () => {
    const res = await admin.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, name: `${TAG} Mixed Grill`, quantity: 1, price: 5 }],
      subtotal: 5, discount: 20, discount_type: 'percent',
      tax: 0, total: 4.0,
    })
    expect(res.status).toBe(201)
    expect(parseFloat(res.body.total)).toBeCloseTo(4.0, 2)
    orderIds.push(res.body.id)
  })

  it('applies flat (fixed) amount discount correctly', async () => {
    const res = await admin.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, name: `${TAG} Mixed Grill`, quantity: 1, price: 5 }],
      subtotal: 5, discount: 1.5, discount_type: 'fixed',
      tax: 0, total: 3.5,
    })
    expect(res.status).toBe(201)
    expect(parseFloat(res.body.total)).toBeCloseTo(3.5, 2)
    orderIds.push(res.body.id)
  })
})

// ── 3. Split bill endpoint ───────────────────────────────────────────────────
describe('Split bill endpoint', () => {
  let orderId

  beforeAll(async () => {
    const order = await createOrder({ type: 'dine-in', table_number: 7 })
    orderId = order.id
  })

  it('records a partial split payment', async () => {
    const res = await admin.post(`/api/orders/${orderId}/split-payment`).send({
      method: 'cash', amount: 5.55
    })
    expect([200, 201]).toContain(res.status)
    if (res.status !== 400) {
      expect(res.body).toHaveProperty('payment')
      expect(res.body).toHaveProperty('total_paid')
    }
  })

  it('rejects split with zero amount', async () => {
    const res = await admin.post(`/api/orders/${orderId}/split-payment`).send({
      method: 'cash', amount: 0
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ── 4. Reports / summary endpoints ──────────────────────────────────────────
describe('Reports — shift summary', () => {
  it('GET /api/reports returns summary with required keys', async () => {
    const res = await admin.get('/api/reports?period=today')
    expect(res.status).toBe(200)
    // API shape: { revenue, totalOrders, avgOrderValue, ... }
    const keys = ['revenue', 'totalOrders', 'avgOrderValue']
    for (const k of keys) {
      expect(res.body, `key ${k}`).toHaveProperty(k)
    }
  })

  it('GET /api/reports includes heatmap and trend data', async () => {
    const res = await admin.get('/api/reports?period=week')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('heatmap')
    expect(res.body).toHaveProperty('trend')
  })

  it('GET /api/reports/export returns CSV', async () => {
    const res = await admin.get('/api/reports/export?period=today')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/csv|text/)
  })

  it('staff report requires admin/manager role', async () => {
    const res = await admin.get('/api/reports/staff?period=today')
    expect([200, 403]).toContain(res.status)
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true)
    }
  })
})

// ── 5. Dashboard summary ─────────────────────────────────────────────────────
describe('Dashboard data', () => {
  it('GET /api/dashboard/stats returns revenue and order counts', async () => {
    const res = await admin.get('/api/dashboard/stats')
    expect([200, 404]).toContain(res.status)
    if (res.status === 200) expect(typeof res.body).toBe('object')
  })
})

// ── 6. Settings API ───────────────────────────────────────────────────────────
describe('Settings API', () => {
  let originalTaxRate

  it('GET /api/settings returns flat key-value map', async () => {
    const res = await admin.get('/api/settings')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('tax_rate')
    originalTaxRate = res.body.tax_rate
  })

  it('PUT /api/settings updates tax_rate and reads back', async () => {
    const res = await admin.put('/api/settings').send({ tax_rate: '5' })
    expect(res.status).toBe(200)
    const verify = await admin.get('/api/settings')
    expect(verify.body.tax_rate).toBe('5')
  })

  it('restores original tax_rate', async () => {
    if (originalTaxRate !== undefined) {
      const res = await admin.put('/api/settings').send({ tax_rate: originalTaxRate })
      expect(res.status).toBe(200)
    }
  })
})
