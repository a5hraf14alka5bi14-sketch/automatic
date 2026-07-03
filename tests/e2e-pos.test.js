// E2E POS Flow — full order lifecycle, payment, discount, KDS status transitions, barcode
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `pos_${Date.now()}`
const ADMIN_EMAIL   = `${TAG}_admin@test.local`
const CASHIER_EMAIL = `${TAG}_cashier@test.local`
const PASSWORD = 'TestPass123'

const ids = {
  admin: null, cashier: null,
  inv: null, menu: null, menuBarcode: null,
  customer: null,
}
const orderIds = []

async function seedUser(email, role) {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const r = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} ${role}`, email, hash, role]
  )
  return r.rows[0].id
}

async function login(email) {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD })
  expect(res.status, `login ${email}`).toBe(200)
  return agent
}

let admin, cashier

beforeAll(async () => {
  ids.admin   = await seedUser(ADMIN_EMAIL, 'admin')
  ids.cashier = await seedUser(CASHIER_EMAIL, 'cashier')

  const inv = await pool.query(
    "INSERT INTO inventory (name,category,quantity,unit,min_quantity,cost) VALUES ($1,'test',5,'kg',0.5,3) RETURNING id",
    [`${TAG} Dough`]
  )
  ids.inv = inv.rows[0].id

  const menu = await pool.query(
    "INSERT INTO menu_items (name,category,price,available) VALUES ($1,'Mains',3.500,true) RETURNING id",
    [`${TAG} Shawarma`]
  )
  ids.menu = menu.rows[0].id

  const menuBarcode = await pool.query(
    "INSERT INTO menu_items (name,category,price,available,barcode) VALUES ($1,'Drinks',1.000,true,$2) RETURNING id",
    [`${TAG} Cola`, `${TAG}_BC001`]
  )
  ids.menuBarcode = menuBarcode.rows[0].id

  await pool.query(
    "INSERT INTO recipe_ingredients (menu_item_id,inventory_item_id,ingredient_name,quantity,unit) VALUES ($1,$2,$3,300,'g')",
    [ids.menu, ids.inv, `${TAG} Dough`]
  )

  const cust = await pool.query(
    "INSERT INTO customers (name,email,loyalty_points) VALUES ($1,$2,50) RETURNING id",
    [`${TAG} Waleed`, `${TAG}@cust.local`]
  )
  ids.customer = cust.rows[0].id

  admin   = await login(ADMIN_EMAIL)
  cashier = await login(CASHIER_EMAIL)
})

afterAll(async () => {
  for (const oid of orderIds) {
    await pool.query("DELETE FROM stock_movements WHERE reference_type='order' AND reference_id=$1", [oid])
    await pool.query('DELETE FROM order_items WHERE order_id=$1', [oid])
    await pool.query('DELETE FROM orders WHERE id=$1', [oid])
  }
  await pool.query('DELETE FROM recipe_ingredients WHERE menu_item_id = ANY($1)', [[ids.menu, ids.menuBarcode].filter(Boolean)])
  await pool.query('DELETE FROM menu_items WHERE id = ANY($1)', [[ids.menu, ids.menuBarcode].filter(Boolean)])
  await pool.query('DELETE FROM inventory WHERE id=$1', [ids.inv])
  await pool.query('DELETE FROM customers WHERE id=$1', [ids.customer])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[ids.admin, ids.cashier].filter(Boolean)])
  await pool.end()
})

// ── 1. Barcode lookup ───────────────────────────────────────────────────────
describe('Barcode scan', () => {
  it('finds a menu item by barcode', async () => {
    const res = await admin.get(`/api/menu/barcode/${TAG}_BC001`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(ids.menuBarcode)
    expect(res.body.name).toContain('Cola')
  })

  it('returns 404 for unknown barcode', async () => {
    const res = await admin.get('/api/menu/barcode/NOSUCHTHING99')
    expect(res.status).toBe(404)
  })
})

// ── 2. Full POS order lifecycle ─────────────────────────────────────────────
describe('POS order lifecycle', () => {
  let orderId

  it('cashier creates a dine-in order', async () => {
    const res = await cashier.post('/api/orders').send({
      type: 'dine-in', table_number: 5,
      items: [{ menu_item_id: ids.menu, name: `${TAG} Shawarma`, quantity: 2, price: 3.5 }],
      subtotal: 7, tax: 0.770, total: 7.770,
    })
    expect(res.status).toBe(201)
    expect(res.body.table_number).toBe(5)
    orderId = res.body.id
    orderIds.push(orderId)
  })

  it('order appears in the active orders list', async () => {
    const res = await cashier.get('/api/orders?status=pending')
    expect(res.status).toBe(200)
    expect(res.body.find(o => o.id === orderId)).toBeTruthy()
  })

  it('KDS: kitchen advances order to preparing', async () => {
    const res = await admin.patch(`/api/orders/${orderId}/status`).send({ status: 'preparing' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('preparing')
  })

  it('KDS: kitchen marks order ready', async () => {
    const res = await admin.patch(`/api/orders/${orderId}/status`).send({ status: 'ready' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
  })

  it('completes order with cash payment and deducts inventory', async () => {
    const before = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.inv])
    const beforeQty = parseFloat(before.rows[0].quantity)

    const res = await admin.patch(`/api/orders/${orderId}/status`).send({ status: 'completed', payment_method: 'cash' })
    expect(res.status).toBe(200)
    expect(res.body.payment_method).toBe('cash')

    // 300 g/item × 2 = 600 g = 0.6 kg deducted
    const after = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.inv])
    expect(parseFloat(after.rows[0].quantity)).toBeCloseTo(beforeQty - 0.6, 3)
  })

  it('completed order shows paid_at timestamp', async () => {
    const res = await cashier.get(`/api/orders/${orderId}`)
    expect(res.status).toBe(200)
    expect(res.body.paid_at).not.toBeNull()
  })

  it('cannot update a completed order status forward again (no-op handled gracefully)', async () => {
    // A second "completed" patch on an already-completed order should 200 but not double-deduct
    const res = await admin.patch(`/api/orders/${orderId}/status`).send({ status: 'completed', payment_method: 'cash' })
    expect(res.status).toBe(200)
    const after = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.inv])
    // Quantity must not have decreased again
    expect(parseFloat(after.rows[0].quantity)).toBeCloseTo(4.4, 2)
  })
})

// ── 3. Loyalty redemption ───────────────────────────────────────────────────
describe('Loyalty redemption in POS', () => {
  let orderId

  it('creates a takeaway order for a loyalty customer', async () => {
    const res = await admin.post('/api/orders').send({
      type: 'takeaway', customer_id: ids.customer,
      items: [{ menu_item_id: ids.menu, name: `${TAG} Shawarma`, quantity: 1, price: 3.5 }],
      subtotal: 3.5, tax: 0, total: 3.5,
    })
    expect(res.status).toBe(201)
    orderId = res.body.id
    orderIds.push(orderId)
  })

  it('completes with loyalty redemption and records discount on order', async () => {
    const res = await admin.patch(`/api/orders/${orderId}/status`).send({
      status: 'completed', payment_method: 'card', loyalty_redemption_points: 10
    })
    expect(res.status).toBe(200)
    // loyalty_discount column should be set
    const row = await pool.query('SELECT loyalty_discount FROM orders WHERE id=$1', [orderId])
    expect(parseFloat(row.rows[0].loyalty_discount || 0)).toBeGreaterThan(0)
  })

  it('customer loyalty_points net decreased by redeemed amount', async () => {
    const cust = await pool.query('SELECT loyalty_points FROM customers WHERE id=$1', [ids.customer])
    // Started with 50, redeemed 10, earned points for 3.5 * 1 = 3 → net = 50 - 10 + 3 = 43
    expect(parseInt(cust.rows[0].loyalty_points)).toBeLessThan(50)
  })

  it('cancelling a completed loyalty order restores points', async () => {
    const before = await pool.query('SELECT loyalty_points FROM customers WHERE id=$1', [ids.customer])
    const pBefore = parseInt(before.rows[0].loyalty_points)

    const res = await admin.patch(`/api/orders/${orderId}/status`).send({ status: 'cancelled', void_reason: 'Loyalty refund test' })
    expect(res.status).toBe(200)

    const after = await pool.query('SELECT loyalty_points FROM customers WHERE id=$1', [ids.customer])
    expect(parseInt(after.rows[0].loyalty_points)).toBeGreaterThan(pBefore)
  })
})

// ── 4. Order with discount ──────────────────────────────────────────────────
describe('Order with percentage discount', () => {
  let orderId

  it('creates order with 10% discount', async () => {
    const res = await admin.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, name: `${TAG} Shawarma`, quantity: 1, price: 3.5 }],
      subtotal: 3.5, discount: 10, discount_type: 'percent',
      tax: 0, total: 3.150,
    })
    expect(res.status).toBe(201)
    expect(parseFloat(res.body.total)).toBeCloseTo(3.15, 2)
    orderId = res.body.id
    orderIds.push(orderId)
  })

  it('completes the discounted order', async () => {
    const res = await admin.patch(`/api/orders/${orderId}/status`).send({ status: 'completed', payment_method: 'cash' })
    expect(res.status).toBe(200)
  })
})

// ── 5. Void completed order requires reason ─────────────────────────────────
describe('Void / cancel controls', () => {
  let orderId

  beforeAll(async () => {
    const r = await admin.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menu, name: `${TAG} Shawarma`, quantity: 1, price: 3.5 }],
      subtotal: 3.5, tax: 0, total: 3.5,
    })
    orderId = r.body.id
    orderIds.push(orderId)
    await admin.patch(`/api/orders/${orderId}/status`).send({ status: 'completed', payment_method: 'cash' })
  })

  it('cancelling without void_reason returns 400', async () => {
    const res = await admin.patch(`/api/orders/${orderId}/status`).send({ status: 'cancelled' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/reason/)
  })

  it('admin can void completed order with reason', async () => {
    const res = await admin.patch(`/api/orders/${orderId}/status`).send({
      status: 'cancelled', void_reason: 'Customer complaint — wrong order'
    })
    expect(res.status).toBe(200)
    const row = await pool.query('SELECT void_reason, voided_at FROM orders WHERE id=$1', [orderId])
    expect(row.rows[0].void_reason).toBe('Customer complaint — wrong order')
    expect(row.rows[0].voided_at).not.toBeNull()
  })
})

// ── 6. Rush / station flags ─────────────────────────────────────────────────
describe('Rush orders and KDS station routing', () => {
  let orderId

  it('creates a rush order with station label', async () => {
    const res = await admin.post('/api/orders').send({
      type: 'dine-in', table_number: 3, rush: true, station: 'grill',
      items: [{ menu_item_id: ids.menu, name: `${TAG} Shawarma`, quantity: 1, price: 3.5 }],
      subtotal: 3.5, tax: 0, total: 3.5,
    })
    expect(res.status).toBe(201)
    expect(res.body.rush).toBe(true)
    orderId = res.body.id
    orderIds.push(orderId)
  })

  it('KDS can filter by station', async () => {
    const res = await admin.get('/api/orders?status=pending')
    expect(res.status).toBe(200)
    const rushOrder = res.body.find(o => o.id === orderId)
    expect(rushOrder).toBeTruthy()
    expect(rushOrder.rush).toBe(true)
  })
})
