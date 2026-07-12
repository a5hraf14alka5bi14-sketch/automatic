// @vitest-environment node
/**
 * tests/partial-po-receive.test.js
 * POST /api/suppliers/purchase-orders/:id/receive
 *
 * Covers: full receive, partial receive (quantities map), deferred items (qty=0),
 * idempotent full→partial re-calls, already-received 409, cancelled 409,
 * not-found 404, RBAC (cashier 403).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function loginAs(role) {
  const email = `itest_po_${role}_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`
  const { hashPassword } = await import('../server/lib/password.js')
  const hash = await hashPassword('Test1234!')
  await pool.query(
    'INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,$4,false)',
    [`PO ${role}`, email, hash, role]
  )
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Test1234!' })
  return { cookie: res.headers['set-cookie'], email }
}

// ── Shared state ──────────────────────────────────────────────────────────────
let adminCookie, adminEmail
let supplierId
let inventoryId
let cleanupEmails = []
let cleanupPOs = []
let cleanupInventory = []

beforeAll(async () => {
  const auth = await loginAs('admin')
  adminCookie = auth.cookie
  adminEmail = auth.email
  cleanupEmails.push(adminEmail)

  // Create a supplier for the POs
  const sRes = await request(app)
    .post('/api/suppliers')
    .set('Cookie', adminCookie)
    .send({ name: `itest PO supplier ${Date.now()}`, contact_email: 'po@test.com' })
  supplierId = sRes.body.id

  // Create an inventory item to link
  const iRes = await pool.query(
    `INSERT INTO inventory (name, quantity, unit, min_quantity, category)
     VALUES ('itest_po_ingredient', 0, 'kg', 1, 'Other')
     RETURNING id`
  )
  inventoryId = iRes.rows[0].id
  cleanupInventory.push(inventoryId)
})

afterAll(async () => {
  if (cleanupPOs.length) {
    await pool.query(`DELETE FROM purchase_orders WHERE id = ANY($1)`, [cleanupPOs])
  }
  if (cleanupInventory.length) {
    await pool.query(`DELETE FROM inventory WHERE id = ANY($1)`, [cleanupInventory])
  }
  if (supplierId) {
    await pool.query(`DELETE FROM suppliers WHERE id = $1`, [supplierId])
  }
  if (cleanupEmails.length) {
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [cleanupEmails])
  }
})

// ── Helper: create a PO with items ───────────────────────────────────────────
async function createPO(items) {
  const res = await request(app)
    .post('/api/suppliers/purchase-orders')
    .set('Cookie', adminCookie)
    .send({
      supplier_id: supplierId,
      items: items.map(i => ({
        inventory_id: i.inventory_id ?? null,
        item_name: i.name,
        quantity: i.qty,
        unit: 'kg',
        unit_cost: 1,
      })),
    })
  if (res.status !== 201) throw new Error(`createPO failed: ${JSON.stringify(res.body)}`)
  cleanupPOs.push(res.body.id)
  return res.body
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('Full receive (no quantities map)', () => {
  it('marks PO as received and restocks linked inventory', async () => {
    const { rows: before } = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [inventoryId])
    const beforeQty = parseFloat(before[0].quantity)

    const po = await createPO([
      { name: 'itest linked item', qty: 5, inventory_id: inventoryId },
    ])

    const res = await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', adminCookie)
      .send({}) // no quantities → receive all

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('received')
    expect(res.body.items_restocked).toBe(1)
    expect(res.body.items_skipped).toHaveLength(0)

    const { rows: after } = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [inventoryId])
    expect(parseFloat(after[0].quantity)).toBe(beforeQty + 5)
  })

  it('skipped (no inventory_id link) items are reported but PO still completes', async () => {
    const po = await createPO([
      { name: 'itest unlinked item', qty: 3, inventory_id: null },
    ])

    const res = await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', adminCookie)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('received')
    expect(res.body.items_skipped).toHaveLength(1)
    expect(res.body.items_restocked).toBe(0)
  })
})

describe('Partial receive (quantities map)', () => {
  it('receives only the specified quantities and sets status to partially_received', async () => {
    const po = await createPO([
      { name: 'itest partial A', qty: 10, inventory_id: inventoryId },
      { name: 'itest partial B', qty: 8,  inventory_id: null },
    ])

    // Receive only 3 out of 10 for item A; 0 for item B
    const itemIds = await pool.query(
      'SELECT id, item_name FROM purchase_order_items WHERE purchase_order_id = $1',
      [po.id]
    )
    const itemA = itemIds.rows.find(r => r.item_name === 'itest partial A')

    const quantities = {}
    quantities[itemA.id] = 3

    const res = await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', adminCookie)
      .send({ quantities })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('partially_received')
  })

  it('completing a partial PO with remaining qty → status becomes received', async () => {
    const po = await createPO([
      { name: 'itest complete A', qty: 6, inventory_id: inventoryId },
    ])
    const items = await pool.query(
      'SELECT id FROM purchase_order_items WHERE purchase_order_id=$1', [po.id]
    )
    const itemId = items.rows[0].id

    // First call: partial
    await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', adminCookie)
      .send({ quantities: { [itemId]: 2 } })

    // Second call: receive the rest
    const res = await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', adminCookie)
      .send({ quantities: { [itemId]: 4 } })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('received')
  })

  it('items with qty=0 go into items_deferred and do not restock', async () => {
    const { rows: before } = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [inventoryId])
    const beforeQty = parseFloat(before[0].quantity)

    const po = await createPO([
      { name: 'itest deferred', qty: 5, inventory_id: inventoryId },
    ])
    const items = await pool.query(
      'SELECT id FROM purchase_order_items WHERE purchase_order_id=$1', [po.id]
    )
    const itemId = items.rows[0].id

    const res = await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', adminCookie)
      .send({ quantities: { [itemId]: 0 } })

    expect(res.status).toBe(200)
    expect(res.body.items_deferred).toHaveLength(1)
    expect(res.body.items_restocked).toBe(0)

    const { rows: after } = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [inventoryId])
    expect(parseFloat(after[0].quantity)).toBe(beforeQty) // no change
  })

  it('over-receiving clamps to remaining qty (does not exceed PO line total)', async () => {
    const po = await createPO([
      { name: 'itest clamp', qty: 4, inventory_id: inventoryId },
    ])
    const items = await pool.query(
      'SELECT id FROM purchase_order_items WHERE purchase_order_id=$1', [po.id]
    )
    const itemId = items.rows[0].id

    // First partial: 2
    await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', adminCookie)
      .send({ quantities: { [itemId]: 2 } })

    // Second call: request 99 but only 2 remain
    const res = await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', adminCookie)
      .send({ quantities: { [itemId]: 99 } })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('received') // clamped to 2 → fully received
  })
})

describe('Error cases', () => {
  it('409 when PO is already fully received', async () => {
    const po = await createPO([{ name: 'itest already done', qty: 1, inventory_id: null }])
    // Receive it
    await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', adminCookie)
      .send({})

    // Try again
    const res = await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', adminCookie)
      .send({})

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already fully received/i)
  })

  it('409 when PO is cancelled', async () => {
    const po = await createPO([{ name: 'itest cancelled', qty: 1, inventory_id: null }])
    // Cancel it
    await request(app)
      .patch(`/api/suppliers/purchase-orders/${po.id}`)
      .set('Cookie', adminCookie)
      .send({ status: 'cancelled' })

    const res = await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', adminCookie)
      .send({})

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/cancelled/i)
  })

  it('404 for unknown PO id', async () => {
    const res = await request(app)
      .post('/api/suppliers/purchase-orders/99999999/receive')
      .set('Cookie', adminCookie)
      .send({})

    expect(res.status).toBe(404)
  })

  it('cashier cannot receive a PO — 403', async () => {
    const { cookie, email } = await loginAs('cashier')
    cleanupEmails.push(email)

    const po = await createPO([{ name: 'itest rbac', qty: 1, inventory_id: null }])

    const res = await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', cookie)
      .send({})

    expect(res.status).toBe(403)
  })

  it('staff cannot receive a PO — 403', async () => {
    const { cookie, email } = await loginAs('staff')
    cleanupEmails.push(email)

    const po = await createPO([{ name: 'itest rbac staff', qty: 1, inventory_id: null }])

    const res = await request(app)
      .post(`/api/suppliers/purchase-orders/${po.id}/receive`)
      .set('Cookie', cookie)
      .send({})

    expect(res.status).toBe(403)
  })
})
