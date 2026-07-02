// Integration tests — exercise the real Express app + PostgreSQL.
// Self-contained: every row created here is tagged with a unique run id and
// removed in afterAll, so the suite is safe to run against the dev database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `itest_${Date.now()}`
const ADMIN_EMAIL = `${TAG}_admin@test.local`
const STAFF_EMAIL = `${TAG}_staff@test.local`
const PASSWORD = 'TestPass123'

const ids = { adminUser: null, staffUser: null, menuItem: null, invItem: null, invItem2: null, recipe: null, customer: null, order: null }

async function seedUser(email, role) {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const r = await pool.query(
    'INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} ${role}`, email, hash, role]
  )
  return r.rows[0].id
}

async function login(email) {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD })
  expect(res.status).toBe(200)
  return agent
}

let admin, staff

beforeAll(async () => {
  ids.adminUser = await seedUser(ADMIN_EMAIL, 'admin')
  ids.staffUser = await seedUser(STAFF_EMAIL, 'staff')

  // Inventory item stored in kg; recipe expressed in g -> exercises conversion.
  const inv = await pool.query(
    "INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,'test',10,'kg',1,5) RETURNING id",
    [`${TAG} Flour`]
  )
  ids.invItem = inv.rows[0].id

  const inv2 = await pool.query(
    "INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,'test',3,'pcs',1,2) RETURNING id",
    [`${TAG} Napkins`]
  )
  ids.invItem2 = inv2.rows[0].id

  const menu = await pool.query(
    "INSERT INTO menu_items (name, category, price, available) VALUES ($1,'test',2.5,true) RETURNING id",
    [`${TAG} Manoushe`]
  )
  ids.menuItem = menu.rows[0].id

  const rec = await pool.query(
    "INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, ingredient_name, quantity, unit) VALUES ($1,$2,$3,200,'g') RETURNING id",
    [ids.menuItem, ids.invItem, `${TAG} Flour`]
  )
  ids.recipe = rec.rows[0].id

  const cust = await pool.query(
    'INSERT INTO customers (name, email) VALUES ($1,$2) RETURNING id',
    [`${TAG} Diner`, `${TAG}_cust@test.local`]
  )
  ids.customer = cust.rows[0].id

  admin = await login(ADMIN_EMAIL)
  staff = await login(STAFF_EMAIL)
})

afterAll(async () => {
  if (ids.order) await pool.query('DELETE FROM orders WHERE id=$1', [ids.order])
  await pool.query('DELETE FROM recipe_ingredients WHERE id=$1', [ids.recipe])
  await pool.query('DELETE FROM menu_items WHERE id=$1', [ids.menuItem])
  await pool.query('DELETE FROM inventory WHERE id = ANY($1)', [[ids.invItem, ids.invItem2].filter(Boolean)])
  await pool.query('DELETE FROM customers WHERE id=$1', [ids.customer])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[ids.adminUser, ids.staffUser].filter(Boolean)])
  await pool.end()
})

describe('Auth', () => {
  it('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/api/inventory')
    expect(res.status).toBe(401)
  })

  it('allows authenticated access', async () => {
    const res = await admin.get('/api/inventory')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('RBAC', () => {
  it('forbids staff from creating inventory (403)', async () => {
    const res = await staff.post('/api/inventory').send({ name: `${TAG} X`, quantity: 1, unit: 'kg' })
    expect(res.status).toBe(403)
  })

  it('lets staff read inventory (GET allowed)', async () => {
    const res = await staff.get('/api/inventory')
    expect(res.status).toBe(200)
  })

  it('lets admin create+delete inventory', async () => {
    const created = await admin.post('/api/inventory').send({ name: `${TAG} Temp`, quantity: 1, unit: 'kg' })
    expect(created.status).toBe(201)
    const del = await admin.delete(`/api/inventory/${created.body.id}`)
    expect(del.status).toBe(200)
    await pool.query('DELETE FROM inventory WHERE id=$1', [created.body.id])
  })
})

describe('Inventory deduction on order completion', () => {
  it('deducts converted quantity when an order is completed', async () => {
    const create = await admin.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menuItem, name: `${TAG} Manoushe`, quantity: 2, price: 2.5 }],
      subtotal: 5, tax: 0, total: 5,
    })
    expect(create.status).toBe(201)
    ids.order = create.body.id

    const before = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.invItem])
    expect(parseFloat(before.rows[0].quantity)).toBe(10)

    const complete = await admin.patch(`/api/orders/${ids.order}/status`).send({ status: 'completed', payment_method: 'cash' })
    expect(complete.status).toBe(200)

    // 200 g/item * 2 items = 400 g = 0.4 kg deducted from a 10 kg stock -> 9.6 kg
    const after = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.invItem])
    expect(parseFloat(after.rows[0].quantity)).toBeCloseTo(9.6, 3)

    // A stock movement of type 'sale' should have been logged.
    const mov = await pool.query(
      "SELECT * FROM stock_movements WHERE inventory_item_id=$1 AND movement_type='sale'",
      [ids.invItem]
    )
    expect(mov.rows.length).toBeGreaterThan(0)
  })

  it('restocks when a completed order is cancelled', async () => {
    const cancel = await admin.patch(`/api/orders/${ids.order}/status`).send({ status: 'cancelled' })
    expect(cancel.status).toBe(200)
    const after = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.invItem])
    expect(parseFloat(after.rows[0].quantity)).toBeCloseTo(10, 3)
  })
})

describe('Soft delete', () => {
  it('hides a deleted inventory item from the list but keeps the row', async () => {
    const del = await admin.delete(`/api/inventory/${ids.invItem2}`)
    expect(del.status).toBe(200)

    const list = await admin.get('/api/inventory?limit=500')
    expect(list.body.find(i => i.id === ids.invItem2)).toBeUndefined()

    const row = await pool.query('SELECT deleted_at FROM inventory WHERE id=$1', [ids.invItem2])
    expect(row.rows.length).toBe(1)
    expect(row.rows[0].deleted_at).not.toBeNull()
  })

  it('hides a deleted customer from the list but keeps the row', async () => {
    const del = await admin.delete(`/api/customers/${ids.customer}`)
    expect(del.status).toBe(200)

    const list = await admin.get('/api/customers?limit=500')
    expect(list.body.find(c => c.id === ids.customer)).toBeUndefined()

    const row = await pool.query('SELECT deleted_at FROM customers WHERE id=$1', [ids.customer])
    expect(row.rows[0].deleted_at).not.toBeNull()
  })

  it('hides a deleted menu item from /all but keeps the row', async () => {
    const del = await admin.delete(`/api/menu/${ids.menuItem}`)
    expect(del.status).toBe(200)

    const list = await admin.get('/api/menu/all')
    expect(list.body.find(m => m.id === ids.menuItem)).toBeUndefined()

    const row = await pool.query('SELECT deleted_at FROM menu_items WHERE id=$1', [ids.menuItem])
    expect(row.rows[0].deleted_at).not.toBeNull()
  })
})
