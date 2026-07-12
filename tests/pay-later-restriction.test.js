// Pay-later order restriction — for orders where payment_method IS NULL (pay-later),
// only the kitchen role may transition status to 'preparing' or 'ready'.
// Cashier role must receive 403 for those transitions.
// Other transitions (cancel, complete) and non-pay-later orders are unaffected.
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `paylater_${Date.now()}`
const CASHIER_EMAIL = `${TAG}_cashier@test.local`
const KITCHEN_EMAIL = `${TAG}_kitchen@test.local`
const PASSWORD = 'TestPass123'
const ids = { cashier: null, kitchen: null, menu: null }
const orderIds = []

let cashier, kitchen

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10)

  const cu = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} Cashier`, CASHIER_EMAIL, hash, 'cashier']
  )
  ids.cashier = cu.rows[0].id

  const ku = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} Kitchen`, KITCHEN_EMAIL, hash, 'kitchen']
  )
  ids.kitchen = ku.rows[0].id

  const menu = await pool.query(
    "INSERT INTO menu_items (name,category,price,available) VALUES ($1,'test',10.000,true) RETURNING id",
    [`${TAG} Dish`]
  )
  ids.menu = menu.rows[0].id

  cashier = request.agent(app)
  const cr = await cashier.post('/api/auth/login').send({ email: CASHIER_EMAIL, password: PASSWORD })
  expect(cr.status).toBe(200)

  kitchen = request.agent(app)
  const kr = await kitchen.post('/api/auth/login').send({ email: KITCHEN_EMAIL, password: PASSWORD })
  expect(kr.status).toBe(200)
})

afterAll(async () => {
  for (const oid of orderIds) {
    await pool.query('DELETE FROM order_items WHERE order_id=$1', [oid])
    await pool.query('DELETE FROM orders WHERE id=$1', [oid])
  }
  if (ids.menu) await pool.query('DELETE FROM menu_items WHERE id=$1', [ids.menu])
  await pool.query('DELETE FROM users WHERE id IN ($1,$2)', [ids.cashier, ids.kitchen])
  await pool.end()
})

async function createPayLaterOrder(agent) {
  const res = await agent.post('/api/orders').send({
    type: 'takeaway',
    items: [{ menu_item_id: ids.menu, quantity: 1 }],
  })
  expect(res.status).toBe(201)
  orderIds.push(res.body.id)
  return res.body
}

async function setStatus(agent, orderId, status, extra = {}) {
  return agent.patch(`/api/orders/${orderId}/status`).send({ status, ...extra })
}

describe('Pay-later order restriction', () => {
  it('kitchen role CAN move a pay-later order from pending → preparing', async () => {
    const order = await createPayLaterOrder(cashier)
    const res = await setStatus(kitchen, order.id, 'preparing')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('preparing')
  })

  it('kitchen role CAN move a pay-later order from preparing → ready', async () => {
    const order = await createPayLaterOrder(cashier)
    await setStatus(kitchen, order.id, 'preparing')
    const res = await setStatus(kitchen, order.id, 'ready')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
  })

  it('cashier role CANNOT move a pay-later order from pending → preparing (403)', async () => {
    const order = await createPayLaterOrder(cashier)
    const res = await setStatus(cashier, order.id, 'preparing')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/pay.later|kitchen/i)
  })

  it('cashier role CANNOT move a pay-later order from preparing → ready (403)', async () => {
    const order = await createPayLaterOrder(cashier)
    await setStatus(kitchen, order.id, 'preparing')
    const res = await setStatus(cashier, order.id, 'ready')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/pay.later|kitchen/i)
  })

  it('cashier CAN still cancel a pay-later order (restriction is only for preparing/ready)', async () => {
    const order = await createPayLaterOrder(cashier)
    const res = await setStatus(cashier, order.id, 'cancelled', { void_reason: 'customer changed mind' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cancelled')
  })

  it('cashier CAN complete a pay-later order that is already ready (collecting deferred payment)', async () => {
    const order = await createPayLaterOrder(cashier)
    await setStatus(kitchen, order.id, 'preparing')
    await setStatus(kitchen, order.id, 'ready')
    const res = await setStatus(cashier, order.id, 'completed', { payment_method: 'cash' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('completed')
  })

  it('cashier CAN move a PAID order to preparing (restriction only applies when payment_method IS NULL)', async () => {
    const order = await createPayLaterOrder(cashier)
    await pool.query('UPDATE orders SET payment_method=$1 WHERE id=$2', ['cash', order.id])
    const res = await setStatus(cashier, order.id, 'preparing')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('preparing')
  })

  it('kitchen CAN still perform all transitions on non-pay-later orders (no over-restriction)', async () => {
    const order = await createPayLaterOrder(cashier)
    await pool.query('UPDATE orders SET payment_method=$1 WHERE id=$2', ['card', order.id])
    const r1 = await setStatus(kitchen, order.id, 'preparing')
    expect(r1.status).toBe(200)
    const r2 = await setStatus(kitchen, order.id, 'ready')
    expect(r2.status).toBe(200)
  })
})
