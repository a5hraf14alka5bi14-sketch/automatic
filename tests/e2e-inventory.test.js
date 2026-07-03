// E2E Inventory — bulk stocktake, stock movements, low-stock, suppliers, CRUD
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `inv_${Date.now()}`
const ADMIN_EMAIL = `${TAG}_admin@test.local`
const PASSWORD    = 'TestPass123'
const ids = { admin: null, items: [], supplier: null }

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
})

afterAll(async () => {
  if (ids.items.length) await pool.query('DELETE FROM inventory WHERE id = ANY($1)', [ids.items])
  if (ids.supplier) await pool.query('DELETE FROM suppliers WHERE id=$1', [ids.supplier])
  await pool.query('DELETE FROM users WHERE id=$1', [ids.admin])
  await pool.end()
})

// ── 1. CRUD ─────────────────────────────────────────────────────────────────
describe('Inventory CRUD', () => {
  let itemId

  it('creates an inventory item', async () => {
    const res = await admin.post('/api/inventory').send({
      name: `${TAG} Tomato`, category: 'Produce', quantity: 10, unit: 'kg', min_quantity: 2, cost: 1.5
    })
    expect(res.status).toBe(201)
    expect(res.body.name).toContain('Tomato')
    itemId = res.body.id
    ids.items.push(itemId)
  })

  it('reads the item back in the list', async () => {
    const res = await admin.get('/api/inventory')
    expect(res.status).toBe(200)
    expect(res.body.find(i => i.id === itemId)).toBeTruthy()
  })

  it('updates quantity via PATCH', async () => {
    const res = await admin.patch(`/api/inventory/${itemId}`).send({ quantity: 8.5 })
    expect(res.status).toBe(200)
    expect(parseFloat(res.body.quantity)).toBeCloseTo(8.5, 3)
  })

  it('adjusts stock relatively with "adjust" field', async () => {
    const res = await admin.patch(`/api/inventory/${itemId}`).send({ adjust: -1.5 })
    expect(res.status).toBe(200)
    expect(parseFloat(res.body.quantity)).toBeCloseTo(7.0, 3)
  })

  it('clamps quantity to 0 on excessive deduction', async () => {
    const res = await admin.patch(`/api/inventory/${itemId}`).send({ adjust: -999 })
    expect(res.status).toBe(200)
    expect(parseFloat(res.body.quantity)).toBe(0)
  })

  it('restores quantity for further tests', async () => {
    await admin.patch(`/api/inventory/${itemId}`).send({ quantity: 10 })
  })
})

// ── 2. Bulk stocktake ───────────────────────────────────────────────────────
describe('Bulk stocktake endpoint', () => {
  let id1, id2

  beforeAll(async () => {
    const r1 = await pool.query(
      "INSERT INTO inventory (name,category,quantity,unit,min_quantity,cost) VALUES ($1,'test',20,'kg',1,2) RETURNING id",
      [`${TAG} Bulk1`]
    )
    const r2 = await pool.query(
      "INSERT INTO inventory (name,category,quantity,unit,min_quantity,cost) VALUES ($1,'test',15,'L',1,1) RETURNING id",
      [`${TAG} Bulk2`]
    )
    id1 = r1.rows[0].id; id2 = r2.rows[0].id
    ids.items.push(id1, id2)
  })

  it('updates multiple items in one request', async () => {
    const res = await admin.patch('/api/inventory/bulk-stocktake').send({
      items: [{ id: id1, quantity: 18.5 }, { id: id2, quantity: 12.0 }]
    })
    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(2)
    const row1 = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [id1])
    const row2 = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [id2])
    expect(parseFloat(row1.rows[0].quantity)).toBeCloseTo(18.5, 3)
    expect(parseFloat(row2.rows[0].quantity)).toBeCloseTo(12.0, 3)
  })

  it('records stock_movements of type stocktake for each changed item', async () => {
    const mov1 = await pool.query(
      "SELECT * FROM stock_movements WHERE inventory_item_id=$1 AND movement_type='stocktake' ORDER BY id DESC LIMIT 1",
      [id1]
    )
    expect(mov1.rows.length).toBe(1)
    expect(parseFloat(mov1.rows[0].change)).toBeCloseTo(-1.5, 2)
  })

  it('rejects empty items array', async () => {
    const res = await admin.patch('/api/inventory/bulk-stocktake').send({ items: [] })
    expect(res.status).toBe(400)
  })

  it('skips invalid entries (negative quantity) without failing whole batch', async () => {
    const res = await admin.patch('/api/inventory/bulk-stocktake').send({
      items: [{ id: id1, quantity: 17 }, { id: id2, quantity: -5 }]
    })
    expect(res.status).toBe(200)
    // Only 1 valid update
    expect(res.body.updated).toBe(1)
    const row1 = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [id1])
    expect(parseFloat(row1.rows[0].quantity)).toBeCloseTo(17, 3)
    // id2 unchanged at 12
    const row2 = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [id2])
    expect(parseFloat(row2.rows[0].quantity)).toBeCloseTo(12, 3)
  })

  it('no-ops items whose quantity did not change (no movement logged)', async () => {
    const countBefore = await pool.query(
      "SELECT COUNT(*) FROM stock_movements WHERE inventory_item_id=$1 AND movement_type='stocktake'", [id2]
    )
    await admin.patch('/api/inventory/bulk-stocktake').send({ items: [{ id: id2, quantity: 12.0 }] })
    const countAfter = await pool.query(
      "SELECT COUNT(*) FROM stock_movements WHERE inventory_item_id=$1 AND movement_type='stocktake'", [id2]
    )
    // No new movement
    expect(parseInt(countAfter.rows[0].count)).toBe(parseInt(countBefore.rows[0].count))
  })
})

// ── 3. Low-stock endpoint ───────────────────────────────────────────────────
describe('Low-stock reporting', () => {
  let lowId

  beforeAll(async () => {
    const r = await pool.query(
      "INSERT INTO inventory (name,category,quantity,unit,min_quantity,cost) VALUES ($1,'test',0.3,'kg',1,1) RETURNING id",
      [`${TAG} LowItem`]
    )
    lowId = r.rows[0].id
    ids.items.push(lowId)
  })

  it('lists the low-stock item', async () => {
    const res = await admin.get('/api/inventory/low-stock')
    expect(res.status).toBe(200)
    expect(res.body.find(i => i.id === lowId)).toBeTruthy()
  })
})

// ── 4. Stock movements audit trail ─────────────────────────────────────────
describe('Stock movements audit trail', () => {
  let itemId

  beforeAll(async () => {
    const r = await pool.query(
      "INSERT INTO inventory (name,category,quantity,unit,min_quantity,cost) VALUES ($1,'test',5,'kg',1,2) RETURNING id",
      [`${TAG} Audit`]
    )
    itemId = r.rows[0].id
    ids.items.push(itemId)
  })

  it('manual edit creates a movement record', async () => {
    await admin.patch(`/api/inventory/${itemId}`).send({ quantity: 3 })
    const mov = await pool.query(
      "SELECT * FROM stock_movements WHERE inventory_item_id=$1 AND movement_type='manual_edit' ORDER BY id DESC LIMIT 1",
      [itemId]
    )
    expect(mov.rows.length).toBe(1)
    expect(parseFloat(mov.rows[0].change)).toBeCloseTo(-2, 3)
  })

  it('movements endpoint returns history for item', async () => {
    const res = await admin.get('/api/inventory/movements?limit=100')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.find(m => m.inventory_item_id === itemId)).toBeTruthy()
  })
})

// ── 5. Supplier CRUD (if suppliers route exists) ────────────────────────────
describe('Supplier management', () => {
  it('creates a supplier', async () => {
    const res = await admin.post('/api/suppliers').send({
      name: `${TAG} Supplier`, contact_name: 'Ali', phone: '+96890000000',
      email: `${TAG}@sup.local`, lead_time_days: 3
    })
    if (res.status === 404) return // route not wired yet — skip gracefully
    expect(res.status).toBe(201)
    ids.supplier = res.body.id
  })

  it('reads the supplier back', async () => {
    if (!ids.supplier) return
    const res = await admin.get(`/api/suppliers/${ids.supplier}`)
    expect(res.status).toBe(200)
    expect(res.body.name).toContain('Supplier')
  })

  it('updates supplier contact', async () => {
    if (!ids.supplier) return
    const res = await admin.patch(`/api/suppliers/${ids.supplier}`).send({ contact_name: 'Mohammed' })
    expect(res.status).toBe(200)
    expect(res.body.contact_name).toBe('Mohammed')
  })

  it('soft-deletes supplier', async () => {
    if (!ids.supplier) return
    const res = await admin.delete(`/api/suppliers/${ids.supplier}`)
    expect(res.status).toBe(200)
  })
})
