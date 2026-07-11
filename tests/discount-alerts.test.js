// Discount alerts — when a cashier applies a discount the system must:
//   1. emit a discount_applied broadcast (verified via audit_log method='DISCOUNT')
//   2. write a persistent audit_log entry with the computed discount details
//   3. NOT create a DISCOUNT audit_log entry when no discount is applied
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `discalert_${Date.now()}`
const CASHIER_EMAIL = `${TAG}_cashier@test.local`
const PASSWORD = 'TestPass123'
const ids = { cashier: null, menu: null }
const orderIds = []

let cashier

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const u = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} Cashier`, CASHIER_EMAIL, hash, 'cashier']
  )
  ids.cashier = u.rows[0].id

  const menu = await pool.query(
    "INSERT INTO menu_items (name,category,price,available) VALUES ($1,'test',20.000,true) RETURNING id",
    [`${TAG} Dish`]
  )
  ids.menu = menu.rows[0].id

  cashier = request.agent(app)
  const r = await cashier.post('/api/auth/login').send({ email: CASHIER_EMAIL, password: PASSWORD })
  expect(r.status).toBe(200)
})

afterAll(async () => {
  for (const oid of orderIds) {
    await pool.query('DELETE FROM order_items WHERE order_id=$1', [oid])
    await pool.query('DELETE FROM orders WHERE id=$1', [oid])
  }
  await pool.query(`DELETE FROM audit_log WHERE user_id=$1 AND method='DISCOUNT'`, [ids.cashier])
  if (ids.menu) await pool.query('DELETE FROM menu_items WHERE id=$1', [ids.menu])
  await pool.query('DELETE FROM users WHERE id=$1', [ids.cashier])
  await pool.end()
})

async function waitForAuditLog(orderId, maxMs = 800) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const r = await pool.query(
      `SELECT * FROM audit_log WHERE method='DISCOUNT' AND path=$1 ORDER BY created_at DESC LIMIT 1`,
      [`/api/orders/${orderId}/discount`]
    )
    if (r.rows.length) return r.rows[0]
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return null
}

describe('POST /api/orders — discount_applied audit log', () => {
  it('writes a DISCOUNT audit_log entry when a percent discount is applied at creation', async () => {
    const res = await cashier.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 1 }],
      discount: 10,
      discount_type: 'percent',
    })
    expect(res.status).toBe(201)
    orderIds.push(res.body.id)

    const row = await waitForAuditLog(res.body.id)
    expect(row).not.toBeNull()
    const details = row.details
    expect(details.orderId).toBe(res.body.id)
    expect(details.discountType).toBe('percent')
    expect(details.discountAmt).toBeGreaterThan(0)
    // 10% of 20.000 = 2.000
    expect(details.discountAmt).toBeCloseTo(2.0, 2)
    expect(details.discountInput).toBe(10)
    expect(row.user_id).toBe(ids.cashier)
    expect(row.user_email).toBe(CASHIER_EMAIL)
  })

  it('writes a DISCOUNT audit_log entry when a fixed discount is applied at creation', async () => {
    const res = await cashier.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 2 }],
      discount: 5,
      discount_type: 'fixed',
    })
    expect(res.status).toBe(201)
    orderIds.push(res.body.id)

    const row = await waitForAuditLog(res.body.id)
    expect(row).not.toBeNull()
    const details = row.details
    expect(details.discountType).toBe('fixed')
    expect(details.discountAmt).toBeCloseTo(5.0, 2)
  })

  it('does NOT write a DISCOUNT audit_log entry when no discount is applied', async () => {
    const res = await cashier.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 1 }],
    })
    expect(res.status).toBe(201)
    orderIds.push(res.body.id)

    // Give it a moment then check it was NOT logged
    await new Promise(resolve => setTimeout(resolve, 300))
    const r = await pool.query(
      `SELECT * FROM audit_log WHERE method='DISCOUNT' AND path=$1`,
      [`/api/orders/${res.body.id}/discount`]
    )
    expect(r.rows.length).toBe(0)
  })

  it('response includes the server-computed discount amount', async () => {
    const res = await cashier.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 1 }],
      discount: 50,
      discount_type: 'percent',
    })
    expect(res.status).toBe(201)
    orderIds.push(res.body.id)
    // 50% of 20 = 10; discounted sub = 10; discount stored = 10.000
    expect(parseFloat(res.body.discount)).toBeCloseTo(10.0, 2)
    expect(res.body.discount_type).toBe('percent')
  })
})

describe('PATCH /api/orders/:id/discount — discount_applied audit log', () => {
  it('writes a DISCOUNT audit_log entry when a percent discount is patched onto an order', async () => {
    // Create an order without discount first
    const create = await cashier.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 1 }],
    })
    expect(create.status).toBe(201)
    const orderId = create.body.id
    orderIds.push(orderId)

    const res = await cashier.patch(`/api/orders/${orderId}/discount`).send({
      discount: 15,
      discount_type: 'percent',
    })
    expect(res.status).toBe(200)
    expect(parseFloat(res.body.discount)).toBeCloseTo(3.0, 2) // 15% of 20

    const row = await waitForAuditLog(orderId)
    expect(row).not.toBeNull()
    const details = row.details
    expect(details.orderId).toBe(orderId)
    expect(details.discountType).toBe('percent')
    expect(details.discountAmt).toBeCloseTo(3.0, 2)
    expect(row.user_id).toBe(ids.cashier)
  })

  it('writes a DISCOUNT audit_log entry when a fixed discount is patched onto an order', async () => {
    const create = await cashier.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 1 }],
    })
    expect(create.status).toBe(201)
    const orderId = create.body.id
    orderIds.push(orderId)

    const res = await cashier.patch(`/api/orders/${orderId}/discount`).send({
      discount: 3.5,
      discount_type: 'fixed',
    })
    expect(res.status).toBe(200)

    const row = await waitForAuditLog(orderId)
    expect(row).not.toBeNull()
    const details = row.details
    expect(details.discountAmt).toBeCloseTo(3.5, 2)
    expect(details.discountType).toBe('fixed')
    expect(details.discountInput).toBe(3.5)
  })

  it('does NOT write a DISCOUNT audit_log entry when discount is zero', async () => {
    const create = await cashier.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 1 }],
    })
    expect(create.status).toBe(201)
    const orderId = create.body.id
    orderIds.push(orderId)

    const res = await cashier.patch(`/api/orders/${orderId}/discount`).send({
      discount: 0,
      discount_type: 'fixed',
    })
    expect(res.status).toBe(200)

    await new Promise(resolve => setTimeout(resolve, 300))
    const r = await pool.query(
      `SELECT * FROM audit_log WHERE method='DISCOUNT' AND path=$1`,
      [`/api/orders/${orderId}/discount`]
    )
    expect(r.rows.length).toBe(0)
  })

  it('broadcast payload includes cashier identity and computed discount amount', async () => {
    // Verify the audit_log details (which mirrors the broadcast payload) contains
    // all fields required by the feature spec: cashier identity, order id,
    // discount amount/type, and branch.
    const create = await cashier.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, quantity: 1 }],
      discount: 20,
      discount_type: 'percent',
    })
    expect(create.status).toBe(201)
    const orderId = create.body.id
    orderIds.push(orderId)

    const row = await waitForAuditLog(orderId)
    expect(row).not.toBeNull()
    const d = row.details
    // All spec-required fields must be present in the payload
    expect(d).toHaveProperty('orderId')
    expect(d).toHaveProperty('cashierName')
    expect(d).toHaveProperty('cashierEmail')
    expect(d).toHaveProperty('discountAmt')
    expect(d).toHaveProperty('discountType')
    expect(d).toHaveProperty('discountInput')
    expect(d).toHaveProperty('branchId')
    expect(d.cashierEmail).toBe(CASHIER_EMAIL)
    expect(d.orderId).toBe(orderId)
    expect(d.discountAmt).toBeCloseTo(4.0, 2) // 20% of 20
  })
})
