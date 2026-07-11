// Concurrency tests — multiple cashiers + kitchen screens, no double-deduction,
// no race conditions on stock, idempotent order status transitions.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `conc_${Date.now()}`
const CASHIER_COUNT = 3
const PASSWORD = 'TestPass123'

const ids = { inv: null, menu: null, users: [], orders: [] }

async function seedUser(email, role) {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const r = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [email.split('@')[0], email, hash, role]
  )
  return r.rows[0].id
}

async function loginAs(email) {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD })
  expect(res.status).toBe(200)
  return agent
}

let cashiers = []
let adminAgent

beforeAll(async () => {
  // Seed inventory with known quantity
  const inv = await pool.query(
    "INSERT INTO inventory (name,category,quantity,unit,min_quantity,cost) VALUES ($1,'test',10,'kg',0,5) RETURNING id",
    [`${TAG} Rice`]
  )
  ids.inv = inv.rows[0].id

  const menu = await pool.query(
    "INSERT INTO menu_items (name,category,price,available) VALUES ($1,'test',2.0,true) RETURNING id",
    [`${TAG} Rice Plate`]
  )
  ids.menu = menu.rows[0].id

  // Each dish uses 500 g of Rice → 10 kg → 20 max dishes
  await pool.query(
    "INSERT INTO recipe_ingredients (menu_item_id,inventory_item_id,ingredient_name,quantity,unit) VALUES ($1,$2,$3,500,'g')",
    [ids.menu, ids.inv, `${TAG} Rice`]
  )

  // Seed admin + N cashiers
  const adminEmail = `${TAG}_admin@test.local`
  const adminId = await seedUser(adminEmail, 'admin')
  ids.users.push(adminId)
  adminAgent = await loginAs(adminEmail)

  for (let i = 0; i < CASHIER_COUNT; i++) {
    const email = `${TAG}_cashier${i}@test.local`
    const uid = await seedUser(email, 'cashier')
    ids.users.push(uid)
    cashiers.push(await loginAs(email))
  }
})

afterAll(async () => {
  for (const oid of ids.orders) {
    await pool.query("DELETE FROM stock_movements WHERE reference_type='order' AND reference_id=$1", [oid])
    await pool.query('DELETE FROM order_items WHERE order_id=$1', [oid])
    await pool.query('DELETE FROM orders WHERE id=$1', [oid])
  }
  await pool.query('DELETE FROM recipe_ingredients WHERE menu_item_id=$1', [ids.menu])
  await pool.query('DELETE FROM menu_items WHERE id=$1', [ids.menu])
  await pool.query('DELETE FROM inventory WHERE id=$1', [ids.inv])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids.users])
  await pool.end()
})

// ── 1. Concurrent order creation ─────────────────────────────────────────────
describe('Concurrent order creation from multiple cashiers', () => {
  it('all cashiers can create orders simultaneously without conflict', async () => {
    const results = await Promise.all(
      cashiers.map((c, i) =>
        c.post('/api/orders').send({
          type: 'takeaway',
          items: [{ menu_item_id: ids.menu, name: `${TAG} Rice Plate`, quantity: 2, price: 2 }],
          subtotal: 4, tax: 0, total: 4,
        })
      )
    )
    for (const res of results) {
      expect(res.status).toBe(201)
      ids.orders.push(res.body.id)
    }
    expect(ids.orders.length).toBe(CASHIER_COUNT)
  })

  it('all orders appear as pending', async () => {
    const res = await adminAgent.get('/api/orders?status=pending')
    expect(res.status).toBe(200)
    const pendingIds = res.body.map(o => o.id)
    for (const oid of ids.orders) {
      expect(pendingIds).toContain(oid)
    }
  })
})

// ── 2. Concurrent status transitions ─────────────────────────────────────────
describe('Concurrent KDS status updates (preparing) — idempotent', () => {
  it('two kitchen screens patching same order to "preparing" both succeed or 200', async () => {
    const oid = ids.orders[0]
    const [r1, r2] = await Promise.all([
      adminAgent.patch(`/api/orders/${oid}/status`).send({ status: 'preparing' }),
      adminAgent.patch(`/api/orders/${oid}/status`).send({ status: 'preparing' }),
    ])
    expect([200, 409]).toContain(r1.status)
    expect([200, 409]).toContain(r2.status)
    // At least one must succeed
    expect(r1.status === 200 || r2.status === 200).toBe(true)
  })
})

// ── 3. Concurrent completions — no double-deduction ─────────────────────────
describe('Concurrent completions — stock deduction idempotency', () => {
  it('completing the same order twice does not double-deduct stock', async () => {
    const oid = ids.orders[0]
    // Advance to ready first
    await adminAgent.patch(`/api/orders/${oid}/status`).send({ status: 'preparing' })
    await adminAgent.patch(`/api/orders/${oid}/status`).send({ status: 'ready' })

    const before = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.inv])
    const beforeQty = parseFloat(before.rows[0].quantity)

    // Two concurrent completion attempts
    const [c1, c2] = await Promise.all([
      adminAgent.patch(`/api/orders/${oid}/status`).send({ status: 'completed', payment_method: 'cash' }),
      adminAgent.patch(`/api/orders/${oid}/status`).send({ status: 'completed', payment_method: 'cash' }),
    ])
    expect(c1.status === 200 || c2.status === 200).toBe(true)

    // Stock must have decreased by exactly 1.0 kg (2 × 500 g), not 2.0 kg
    const after = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.inv])
    const afterQty = parseFloat(after.rows[0].quantity)
    expect(beforeQty - afterQty).toBeCloseTo(1.0, 2)
  })
})

// ── 4. Independent completions from all cashiers ─────────────────────────────
describe('All cashier orders completed — aggregate stock check', () => {
  it('completing N orders deducts exactly N×1.0 kg from inventory', async () => {
    // orders[1..] are still pending; complete each
    const remaining = ids.orders.slice(1)
    for (const oid of remaining) {
      // Advance through KDS
      await adminAgent.patch(`/api/orders/${oid}/status`).send({ status: 'preparing' })
      await adminAgent.patch(`/api/orders/${oid}/status`).send({ status: 'ready' })
      await adminAgent.patch(`/api/orders/${oid}/status`).send({ status: 'completed', payment_method: 'cash' })
    }

    // Total completed: CASHIER_COUNT orders × 2 dishes × 0.5 kg = CASHIER_COUNT kg deducted
    const after = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.inv])
    const afterQty = parseFloat(after.rows[0].quantity)
    // Started at 10 kg, each order uses 1 kg → 10 - CASHIER_COUNT
    expect(afterQty).toBeCloseTo(10 - CASHIER_COUNT, 1)
  })
})

// ── 5. Stock movements are symmetric ─────────────────────────────────────────
describe('Stock movements — sum consistency', () => {
  it('sum of all sale movements = total deducted from starting qty', async () => {
    const starting = 10
    const cur = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.inv])
    const current = parseFloat(cur.rows[0].quantity)
    const deducted = starting - current

    const mov = await pool.query(
      "SELECT COALESCE(SUM(change),0) AS total FROM stock_movements WHERE inventory_item_id=$1 AND movement_type='sale'",
      [ids.inv]
    )
    const totalMovements = Math.abs(parseFloat(mov.rows[0].total))
    expect(totalMovements).toBeCloseTo(deducted, 2)
  })
})

// ── 6. Admin endpoints under load ────────────────────────────────────────────
describe('Admin health + metrics under concurrent reads', () => {
  it('health and metrics endpoints handle 4 parallel requests without error', async () => {
    // Keep concurrency modest in test env — ECONNRESET can occur with too many simultaneous HTTP clients
    const results = await Promise.all([
      adminAgent.get('/api/admin/health'),
      adminAgent.get('/api/admin/health'),
      adminAgent.get('/api/admin/metrics'),
      adminAgent.get('/api/admin/metrics'),
    ])
    for (const r of results) {
      expect([200, 503]).toContain(r.status)
    }
  })
})
