// Managed kitchen stations: admins/managers can add, rename and retire
// stations; the order filter, GET /api/orders/stations and menu-item station
// assignment all draw from this managed list, while legacy station values
// already stored in order data stay tolerated by the filter validation.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'
import { hashPassword } from '../server/lib/password.js'
import { invalidateStationCache, normaliseStationName } from '../server/lib/stations.js'

const TAG = `sttest_${Date.now()}`
const PASSWORD = 'TestPass123'
const EMAILS = {
  manager: `${TAG}_manager@test.local`,
  cashier: `${TAG}_cashier@test.local`,
}
const ids = { users: [], stations: [], menuItems: [], orders: [] }
const agents = {}

beforeAll(async () => {
  for (const [role, email] of Object.entries(EMAILS)) {
    const hash = await hashPassword(PASSWORD)
    const u = await pool.query(
      'INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
      [`${TAG} ${role}`, email, hash, role]
    )
    ids.users.push(u.rows[0].id)
    agents[role] = request.agent(app)
    const res = await agents[role].post('/api/auth/login').send({ email, password: PASSWORD })
    expect(res.status).toBe(200)
  }
})

afterAll(async () => {
  if (ids.orders.length) {
    await pool.query('DELETE FROM order_items WHERE order_id = ANY($1::int[])', [ids.orders])
    await pool.query('DELETE FROM orders WHERE id = ANY($1::int[])', [ids.orders])
  }
  if (ids.menuItems.length) await pool.query('DELETE FROM menu_items WHERE id = ANY($1::int[])', [ids.menuItems])
  if (ids.stations.length) await pool.query('DELETE FROM stations WHERE id = ANY($1::int[])', [ids.stations])
  await pool.query('DELETE FROM audit_log WHERE user_email = ANY($1::text[])', [Object.values(EMAILS)])
  await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [ids.users])
  invalidateStationCache()
})

describe('normaliseStationName', () => {
  it('slugs names into lowercase hyphenated form', () => {
    expect(normaliseStationName('  Grill Station ')).toBe('grill-station')
    expect(normaliseStationName('Café/Bar!!')).toBe('cafbar')
    expect(normaliseStationName('---')).toBe('')
    expect(normaliseStationName(null)).toBe('')
  })
})

describe('stations CRUD + RBAC', () => {
  it('seeded defaults are present and active', async () => {
    const res = await agents.cashier.get('/api/stations')
    expect(res.status).toBe(200)
    const names = res.body.map(s => s.name)
    expect(names).toContain('kitchen')
    expect(names).toContain('bar')
  })

  it('rejects station creation by a cashier', async () => {
    const res = await agents.cashier.post('/api/stations').send({ name: `${TAG}nope` })
    expect(res.status).toBe(403)
  })

  it('rejects GET /api/stations/all for a cashier', async () => {
    const res = await agents.cashier.get('/api/stations/all')
    expect(res.status).toBe(403)
  })

  it('manager can create a station (normalised name)', async () => {
    const res = await agents.manager.post('/api/stations').send({ name: `  ${TAG} Grill ` })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe(normaliseStationName(`${TAG} Grill`))
    ids.stations.push(res.body.id)
  })

  it('duplicate active station name → 409', async () => {
    const res = await agents.manager.post('/api/stations').send({ name: `${TAG} Grill` })
    expect(res.status).toBe(409)
  })

  it('name with no usable characters → 400', async () => {
    const res = await agents.manager.post('/api/stations').send({ name: '!!!' })
    expect(res.status).toBe(400)
  })

  it('new station appears immediately in GET /api/orders/stations', async () => {
    const res = await agents.cashier.get('/api/orders/stations')
    expect(res.status).toBe(200)
    expect(res.body).toContain(normaliseStationName(`${TAG} Grill`))
  })

  it('manager can rename a station', async () => {
    const id = ids.stations[0]
    const res = await agents.manager.patch(`/api/stations/${id}`).send({ name: `${TAG} Dessert` })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe(normaliseStationName(`${TAG} Dessert`))
  })

  it('manager can retire a station; it leaves the filter list', async () => {
    const id = ids.stations[0]
    const res = await agents.manager.patch(`/api/stations/${id}`).send({ active: false })
    expect(res.status).toBe(200)
    expect(res.body.active).toBe(false)
    const list = await agents.cashier.get('/api/orders/stations')
    expect(list.body).not.toContain(normaliseStationName(`${TAG} Dessert`))
    const active = await agents.cashier.get('/api/stations')
    expect(active.body.map(s => s.id)).not.toContain(id)
  })

  it('retired station is still tolerated as an order filter (no 400)', async () => {
    const res = await agents.manager.get(`/api/orders?station=${normaliseStationName(`${TAG} Dessert`)}`)
    expect(res.status).toBe(200)
  })

  it('re-adding a retired station reactivates it', async () => {
    const res = await agents.manager.post('/api/stations').send({ name: `${TAG} Dessert` })
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(ids.stations[0])
    expect(res.body.active).toBe(true)
  })

  it('genuinely unknown station filter → 400', async () => {
    const res = await agents.manager.get(`/api/orders?station=${TAG}neverexisted`)
    expect(res.status).toBe(400)
  })
})

describe('menu item station assignment', () => {
  it('accepts a menu item pinned to an active managed station', async () => {
    const station = normaliseStationName(`${TAG} Dessert`)
    const res = await agents.manager.post('/api/menu').send({
      name: `${TAG} Cake`, category: 'desserts', price: 2.5, station,
    })
    expect(res.status).toBe(201)
    expect(res.body.station).toBe(station)
    ids.menuItems.push(res.body.id)
  })

  it('rejects an unknown station on menu create', async () => {
    const res = await agents.manager.post('/api/menu').send({
      name: `${TAG} Bad`, category: 'desserts', price: 1, station: `${TAG}unknown`,
    })
    expect(res.status).toBe(400)
  })

  it('PATCH can clear the station back to automatic routing', async () => {
    const res = await agents.manager.patch(`/api/menu/${ids.menuItems[0]}`).send({ station: '' })
    expect(res.status).toBe(200)
    expect(res.body.station).toBeNull()
  })

  it('PATCH can set a managed station and rejects unknown ones', async () => {
    const station = normaliseStationName(`${TAG} Dessert`)
    const ok = await agents.manager.patch(`/api/menu/${ids.menuItems[0]}`).send({ station })
    expect(ok.status).toBe(200)
    expect(ok.body.station).toBe(station)
    const bad = await agents.manager.patch(`/api/menu/${ids.menuItems[0]}`).send({ station: 'nope-nope' })
    expect(bad.status).toBe(400)
  })

  it('PATCH without station leaves the assignment unchanged', async () => {
    const res = await agents.manager.patch(`/api/menu/${ids.menuItems[0]}`).send({ price: 3 })
    expect(res.status).toBe(200)
    expect(res.body.station).toBe(normaliseStationName(`${TAG} Dessert`))
  })
})

describe('order creation station coercion', () => {
  it('routes items on inactive/unknown stations to kitchen', async () => {
    const res = await agents.cashier.post('/api/orders').send({
      type: 'takeaway',
      items: [
        { menu_item_id: ids.menuItems[0], quantity: 1, station: `${TAG}madeup` },
      ],
      station: `${TAG}madeup`,
    })
    expect(res.status).toBe(201)
    ids.orders.push(res.body.id)
    expect(res.body.station).toBe('kitchen')
    const items = await pool.query('SELECT station FROM order_items WHERE order_id=$1', [res.body.id])
    expect(items.rows[0].station).toBe('kitchen')
  })

  it('keeps items on an active managed station', async () => {
    const station = normaliseStationName(`${TAG} Dessert`)
    const res = await agents.cashier.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menuItems[0], quantity: 1, station }],
      station,
    })
    expect(res.status).toBe(201)
    ids.orders.push(res.body.id)
    expect(res.body.station).toBe(station)
  })
})
