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
    const cancel = await admin.patch(`/api/orders/${ids.order}/status`).send({ status: 'cancelled', void_reason: 'Test cleanup' })
    expect(cancel.status).toBe(200)
    const after = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.invItem])
    expect(parseFloat(after.rows[0].quantity)).toBeCloseTo(10, 3)
  })
})

describe('Order status reversal symmetry (stock + loyalty)', () => {
  it('reverting a completed order restores stock and loyalty, and re-completing does not double-deduct', async () => {
    // Give the customer a loyalty balance so we can exercise redemption refunds.
    await pool.query('UPDATE customers SET loyalty_points=100, total_orders=0, total_spent=0 WHERE id=$1', [ids.customer])
    const snap = async () => {
      const c = (await pool.query('SELECT loyalty_points, total_orders, total_spent FROM customers WHERE id=$1', [ids.customer])).rows[0]
      const inv = parseFloat((await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.invItem])).rows[0].quantity)
      return {
        loyalty: parseInt(c.loyalty_points), orders: parseInt(c.total_orders),
        spent: parseFloat(c.total_spent), inv,
      }
    }

    const base = await snap()
    expect(base.inv).toBeCloseTo(10, 3) // previous order was cancelled → back to 10 kg

    const create = await admin.post('/api/orders').send({
      type: 'takeaway', customer_id: ids.customer,
      items: [{ menu_item_id: ids.menuItem, name: `${TAG} Manoushe`, quantity: 1, price: 2.5 }],
      subtotal: 2.5, tax: 0, total: 2.5,
    })
    expect(create.status).toBe(201)
    const oid = create.body.id

    // Complete, redeeming 5 points.
    const done = await admin.patch(`/api/orders/${oid}/status`).send({ status: 'completed', payment_method: 'cash', loyalty_redemption_points: 5 })
    expect(done.status).toBe(200)
    const afterComplete = await snap()
    expect(afterComplete.inv).toBeCloseTo(9.8, 3) // 200 g deducted from 10 kg

    // Revert to an active status (NOT cancelled) — stock and loyalty must fully reverse.
    const revert = await admin.patch(`/api/orders/${oid}/status`).send({ status: 'pending', void_reason: 'Reversal test' })
    expect(revert.status).toBe(200)
    const afterRevert = await snap()
    expect(afterRevert.inv).toBeCloseTo(10, 3)
    expect(afterRevert.loyalty).toBe(base.loyalty) // earned removed AND redeemed refunded
    expect(afterRevert.orders).toBe(base.orders)
    expect(afterRevert.spent).toBeCloseTo(base.spent, 3)

    // Completing again must deduct exactly once more (not stack on the reverted sale).
    const done2 = await admin.patch(`/api/orders/${oid}/status`).send({ status: 'completed', payment_method: 'cash' })
    expect(done2.status).toBe(200)
    const afterRecomplete = await snap()
    expect(afterRecomplete.inv).toBeCloseTo(9.8, 3) // single deduction, not 9.6

    // Clean up this test's order + its movements.
    await pool.query("DELETE FROM stock_movements WHERE reference_type='order' AND reference_id=$1", [oid])
    await pool.query('DELETE FROM order_items WHERE order_id=$1', [oid])
    await pool.query('DELETE FROM orders WHERE id=$1', [oid])
  })
})

describe('Stock availability endpoint', () => {
  it('reports max sellable per dish from linked ingredients only', async () => {
    // invItem currently 9.8 kg, recipe uses 200 g/item → floor(9800/200) = 49
    const res = await admin.get('/api/menu/stock-availability')
    expect(res.status).toBe(200)
    expect(res.body[ids.menuItem]).toBe(49)
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

// ── Regression: PO double-receive guard ──────────────────────────────────────
describe('PO double-receive guard', () => {
  it('returns 409 when the same PO is received a second time', async () => {
    const suppRes = await admin.post('/api/suppliers').send({ name: `${TAG} DoubleRecv Supplier` })
    expect(suppRes.status).toBe(201)
    const suppId = suppRes.body.id

    const poRes = await admin.post('/api/suppliers/purchase-orders').send({
      supplier_id: suppId,
      items: [{ item_name: `${TAG} Widget`, quantity: 10, unit: 'kg', unit_cost: 2 }],
    })
    expect(poRes.status).toBe(201)
    const poId = poRes.body.id

    const r1 = await admin.post(`/api/suppliers/purchase-orders/${poId}/receive`)
    expect(r1.status).toBe(200)

    const r2 = await admin.post(`/api/suppliers/purchase-orders/${poId}/receive`)
    expect(r2.status).toBe(409)

    await pool.query('DELETE FROM purchase_order_items WHERE purchase_order_id=$1', [poId])
    await pool.query('DELETE FROM purchase_orders WHERE id=$1', [poId])
    await pool.query('DELETE FROM suppliers WHERE id=$1', [suppId])
  })
})

// ── Regression: must_change_password propagates on token refresh ──────────────
describe('must_change_password propagation', () => {
  it('blocks API access after admin sets must_change_password and token is refreshed', async () => {
    const email = `${TAG}_mcp@test.local`
    const uid = await seedUser(email, 'staff')
    const agent = await login(email)

    const preRes = await agent.get('/api/menu/all')
    expect(preRes.status).toBe(200)

    await pool.query('UPDATE users SET must_change_password = true WHERE id = $1', [uid])

    const refreshRes = await agent.post('/api/auth/refresh')
    expect(refreshRes.status).toBe(200)

    const postRes = await agent.get('/api/menu/all')
    expect(postRes.status).toBe(403)

    await pool.query('DELETE FROM users WHERE id=$1', [uid])
  })
})

// ── Regression: kitchen role order field filtering ────────────────────────────
describe('Kitchen role order financial field filtering', () => {
  let kitchen
  const KITCHEN_EMAIL = `${TAG}_kitchen@test.local`

  beforeAll(async () => {
    await seedUser(KITCHEN_EMAIL, 'kitchen')
    kitchen = await login(KITCHEN_EMAIL)
  })

  it('strips financial fields from orders for kitchen role', async () => {
    const menu = await pool.query(
      "INSERT INTO menu_items (name, category, price, available) VALUES ($1,'test',5.0,true) RETURNING id",
      [`${TAG} KitchenTestDish`]
    )
    const mId = menu.rows[0].id

    const orderRes = await admin.post('/api/orders').send({
      type: 'dine-in', table_number: 1,
      items: [{ menu_item_id: mId, quantity: 1, price: 5.0, name: `${TAG} KitchenTestDish` }],
    })
    expect(orderRes.status).toBe(201)
    const oId = orderRes.body.id

    const res = await kitchen.get(`/api/orders/${oId}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(oId)
    expect(res.body.items).toBeDefined()
    expect(res.body.total).toBeUndefined()
    expect(res.body.subtotal).toBeUndefined()
    expect(res.body.payment_method).toBeUndefined()
    expect(res.body.void_reason).toBeUndefined()

    await pool.query('DELETE FROM order_items WHERE order_id=$1', [oId])
    await pool.query('DELETE FROM orders WHERE id=$1', [oId])
    await pool.query('DELETE FROM menu_items WHERE id=$1', [mId])
  })
})
