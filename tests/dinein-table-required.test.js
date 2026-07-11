// Dine-in orders must carry an explicit table_number (server-side rule).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'
import { hashPassword } from '../server/lib/password.js'

const TAG = `dttest_${Date.now()}`
const EMAIL = `${TAG}_cashier@test.local`
const PASSWORD = 'TestPass123'
const ids = { user: null, menuItem: null, orders: [] }

let agent

beforeAll(async () => {
  const hash = await hashPassword(PASSWORD)
  const u = await pool.query(
    "INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,'cashier',false) RETURNING id",
    [`${TAG} cashier`, EMAIL, hash]
  )
  ids.user = u.rows[0].id
  const m = await pool.query(
    "INSERT INTO menu_items (name, category, price, available) VALUES ($1,'test',2.5,true) RETURNING id",
    [`${TAG} Dish`]
  )
  ids.menuItem = m.rows[0].id
  agent = request.agent(app)
  const res = await agent.post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })
  expect(res.status).toBe(200)
})

afterAll(async () => {
  if (ids.orders.length) {
    await pool.query('DELETE FROM order_items WHERE order_id = ANY($1::int[])', [ids.orders])
    await pool.query('DELETE FROM orders WHERE id = ANY($1::int[])', [ids.orders])
  }
  await pool.query('DELETE FROM menu_items WHERE id = $1', [ids.menuItem])
  await pool.query('DELETE FROM audit_log WHERE user_email = $1', [EMAIL])
  await pool.query('DELETE FROM users WHERE id = $1', [ids.user])
})

const item = () => ({ menu_item_id: ids.menuItem, quantity: 1, price: 2.5, name: 'Dish' })

describe('POST /api/orders — dine-in table requirement', () => {
  it('rejects dine-in without a table_number', async () => {
    const res = await agent.post('/api/orders').send({ type: 'dine-in', items: [item()] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/table_number/)
  })

  it('rejects an omitted type (defaults to dine-in) without a table_number', async () => {
    const res = await agent.post('/api/orders').send({ items: [item()] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/table_number/)
  })

  it('rejects dine-in with table_number 0', async () => {
    const res = await agent.post('/api/orders').send({ type: 'dine-in', table_number: 0, items: [item()] })
    expect(res.status).toBe(400)
  })

  it('rejects an unknown order type', async () => {
    const res = await agent.post('/api/orders').send({ type: 'drive-thru', items: [item()] })
    expect(res.status).toBe(400)
  })

  it('accepts dine-in with a valid table_number', async () => {
    const res = await agent.post('/api/orders').send({ type: 'dine-in', table_number: 3, items: [item()] })
    expect(res.status).toBe(201)
    expect(res.body.table_number).toBe(3)
    ids.orders.push(res.body.id)
  })

  it('accepts takeaway without a table_number', async () => {
    const res = await agent.post('/api/orders').send({ type: 'takeaway', items: [item()] })
    expect(res.status).toBe(201)
    ids.orders.push(res.body.id)
  })
})
