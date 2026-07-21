// @vitest-environment node
/**
 * tests/po-conversion-e2e.test.js
 * E2E: purchase-unit conversion (pack-size) when receiving a PO.
 *
 * Verifies:
 *  1. conversion_factor is snapshotted on purchase_order_items at creation
 *  2. receiving 1 carton of an item with factor=30 adds 30 base units to stock
 *  3. partial receive of 1 carton (from a 2-carton PO) adds exactly 30 base units
 *  4. items without entered_in_purchase_unit get no conversion (raw qty)
 *  5. entered_in_purchase_unit=false → conversion_factor is NULL (not snapshotted)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

let managerCookie, managerEmail
const ts = Date.now()
const cleanupInventory = []
const cleanupPOs = []
const cleanupUsers = []

async function loginAs(role) {
  const email = `itest_conv_${role}_${ts}@test.local`
  const { hashPassword } = await import('../server/lib/password.js')
  const hash = await hashPassword('Test1234!')
  await pool.query(
    `INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,$4,false)`,
    [`Conv ${role} ${ts}`, email, hash, role]
  )
  cleanupUsers.push(email)
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Test1234!' })
  return res.headers['set-cookie']
}

beforeAll(async () => {
  managerCookie = await loginAs('manager')
})

afterAll(async () => {
  for (const poId of cleanupPOs) {
    await pool.query('DELETE FROM purchase_order_items WHERE purchase_order_id=$1', [poId])
    await pool.query('DELETE FROM purchase_orders WHERE id=$1', [poId])
  }
  for (const invId of cleanupInventory) {
    await pool.query('DELETE FROM stock_movements WHERE inventory_item_id=$1', [invId])
    await pool.query('DELETE FROM inventory WHERE id=$1', [invId])
  }
  for (const email of cleanupUsers) {
    await pool.query('DELETE FROM users WHERE email=$1', [email])
  }
})

// Helper: create a test inventory item with pack-size configured
async function createInvItem({ name, unit, quantity, purchaseUnit, factor }) {
  const res = await request(app)
    .post('/api/inventory')
    .set('Cookie', managerCookie)
    .send({
      name,
      category: 'Beverages',
      quantity,
      unit,
      min_quantity: 0,
      cost: 0.2,
      purchase_unit: purchaseUnit || null,
      units_per_purchase_unit: factor || null,
    })
  expect(res.status).toBe(201)
  cleanupInventory.push(res.body.id)
  return res.body
}

// Helper: create a PO
async function createPO(items) {
  const res = await request(app)
    .post('/api/suppliers/purchase-orders')
    .set('Cookie', managerCookie)
    .send({ items })
  expect(res.status).toBe(201)
  cleanupPOs.push(res.body.id)
  return res.body
}

// Helper: receive a PO (pass quantities map or omit for receive-all)
async function receivePO(poId, quantities) {
  const body = quantities ? { quantities } : {}
  const res = await request(app)
    .post(`/api/suppliers/purchase-orders/${poId}/receive`)
    .set('Cookie', managerCookie)
    .send(body)
  expect(res.status).toBe(200)
  return res.body
}

// Helper: get current stock
async function getStock(invId) {
  const r = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [invId])
  return parseFloat(r.rows[0].quantity)
}

describe('PO pack-size conversion on receive', () => {
  it('snapshots conversion_factor on PO item when entered_in_purchase_unit=true', async () => {
    const inv = await createInvItem({
      name: `itest_conv_snap_${ts}`,
      unit: 'can',
      quantity: 0,
      purchaseUnit: 'carton',
      factor: 30,
    })

    const po = await createPO([{
      inventory_id: inv.id,
      item_name: inv.name,
      quantity: 1,
      unit: 'carton',
      unit_cost: 5.0,
      vat_inclusive: false,
      vat_rate: 5,
      entered_in_purchase_unit: true,
    }])

    const item = po.items[0]
    expect(item.entered_in_purchase_unit).toBe(true)
    expect(parseFloat(item.conversion_factor)).toBeCloseTo(30, 3)
  })

  it('receiving 1 carton adds 30 cans to stock (1 × 30 = 30)', async () => {
    const inv = await createInvItem({
      name: `itest_conv_full_${ts}`,
      unit: 'can',
      quantity: 5,
      purchaseUnit: 'carton',
      factor: 30,
    })
    const stockBefore = await getStock(inv.id)
    expect(stockBefore).toBeCloseTo(5, 3)

    const po = await createPO([{
      inventory_id: inv.id,
      item_name: inv.name,
      quantity: 1,
      unit: 'carton',
      unit_cost: 5.0,
      vat_inclusive: false,
      vat_rate: 5,
      entered_in_purchase_unit: true,
    }])

    await receivePO(po.id)

    const stockAfter = await getStock(inv.id)
    // 5 cans + (1 carton × 30) = 35
    expect(stockAfter).toBeCloseTo(35, 3)
  })

  it('receiving 2 cartons adds 60 cans to stock', async () => {
    const inv = await createInvItem({
      name: `itest_conv_2crt_${ts}`,
      unit: 'can',
      quantity: 0,
      purchaseUnit: 'carton',
      factor: 30,
    })

    const po = await createPO([{
      inventory_id: inv.id,
      item_name: inv.name,
      quantity: 2,
      unit: 'carton',
      unit_cost: 5.0,
      vat_inclusive: false,
      vat_rate: 5,
      entered_in_purchase_unit: true,
    }])

    await receivePO(po.id)

    const stockAfter = await getStock(inv.id)
    expect(stockAfter).toBeCloseTo(60, 3) // 2 × 30
  })

  it('partial receive: 1 of 2 cartons adds exactly 30 cans', async () => {
    const inv = await createInvItem({
      name: `itest_conv_part_${ts}`,
      unit: 'can',
      quantity: 0,
      purchaseUnit: 'carton',
      factor: 30,
    })

    const po = await createPO([{
      inventory_id: inv.id,
      item_name: inv.name,
      quantity: 2,
      unit: 'carton',
      unit_cost: 5.0,
      vat_inclusive: false,
      vat_rate: 5,
      entered_in_purchase_unit: true,
    }])

    const poItemId = po.items[0].id
    // Receive 1 of 2 cartons
    const r1 = await receivePO(po.id, { [poItemId]: 1 })
    expect(r1.status).toBe('partially_received')

    const stockMid = await getStock(inv.id)
    expect(stockMid).toBeCloseTo(30, 3) // 1 carton × 30

    // Receive remaining 1 carton
    await receivePO(po.id, { [poItemId]: 1 })
    const stockFinal = await getStock(inv.id)
    expect(stockFinal).toBeCloseTo(60, 3) // 2 cartons total
  })

  it('no conversion when entered_in_purchase_unit=false — raw qty used', async () => {
    const inv = await createInvItem({
      name: `itest_conv_noconv_${ts}`,
      unit: 'can',
      quantity: 0,
      purchaseUnit: 'carton',
      factor: 30,
    })

    // Even though item has packaging info, user chose to enter in base units
    const po = await createPO([{
      inventory_id: inv.id,
      item_name: inv.name,
      quantity: 5,
      unit: 'can',
      unit_cost: 0.2,
      vat_inclusive: false,
      vat_rate: 5,
      entered_in_purchase_unit: false,
    }])

    expect(po.items[0].conversion_factor).toBeNull()

    await receivePO(po.id)
    const stockAfter = await getStock(inv.id)
    expect(stockAfter).toBeCloseTo(5, 3) // raw qty, no conversion
  })

  it('non-pack item (no purchase_unit): raw qty, factor=null', async () => {
    const inv = await createInvItem({
      name: `itest_conv_nopack_${ts}`,
      unit: 'kg',
      quantity: 10,
    })

    const po = await createPO([{
      inventory_id: inv.id,
      item_name: inv.name,
      quantity: 3,
      unit: 'kg',
      unit_cost: 2.5,
      vat_inclusive: false,
      vat_rate: 5,
      entered_in_purchase_unit: false,
    }])

    expect(po.items[0].entered_in_purchase_unit).toBe(false)
    expect(po.items[0].conversion_factor).toBeNull()

    await receivePO(po.id)
    const stockAfter = await getStock(inv.id)
    expect(stockAfter).toBeCloseTo(13, 3) // 10 + 3
  })
})
