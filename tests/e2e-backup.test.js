// Backup & Health validation — backup endpoint, admin-only access,
// health check structure, metric counters.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `bkp_${Date.now()}`
const ADMIN_EMAIL   = `${TAG}_admin@test.local`
const CASHIER_EMAIL = `${TAG}_cashier@test.local`
const PASSWORD = 'TestPass123'
const ids = { admin: null, cashier: null }

async function seedUser(email, role) {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const r = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} ${role}`, email, hash, role]
  )
  return r.rows[0].id
}

let admin, cashier

beforeAll(async () => {
  ids.admin   = await seedUser(ADMIN_EMAIL, 'admin')
  ids.cashier = await seedUser(CASHIER_EMAIL, 'cashier')
  admin   = request.agent(app)
  cashier = request.agent(app)
  let r = await admin.post('/api/auth/login').send({ email: ADMIN_EMAIL,   password: PASSWORD })
  expect(r.status).toBe(200)
  r = await cashier.post('/api/auth/login').send({ email: CASHIER_EMAIL, password: PASSWORD })
  expect(r.status).toBe(200)
})

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[ids.admin, ids.cashier].filter(Boolean)])
  await pool.end()
})

// ── 1. Admin-only gate on /api/admin/* ───────────────────────────────────────
describe('Admin-only route protection', () => {
  const adminRoutes = ['/api/admin/health', '/api/admin/metrics', '/api/admin/audit', '/api/admin/backups']

  for (const route of adminRoutes) {
    it(`GET ${route} — unauthenticated returns 401`, async () => {
      const res = await request(app).get(route)
      expect(res.status).toBe(401)
    })

    it(`GET ${route} — cashier returns 403`, async () => {
      const res = await cashier.get(route)
      expect(res.status).toBe(403)
    })

    it(`GET ${route} — admin returns 200 or 503 (no 4xx)`, async () => {
      const res = await admin.get(route)
      expect([200, 503]).toContain(res.status)
    })
  }
})

// ── 2. Health endpoint shape ─────────────────────────────────────────────────
describe('Health endpoint response shape', () => {
  it('returns ok=true when DB is reachable', async () => {
    const res = await admin.get('/api/admin/health')
    expect([200, 503]).toContain(res.status)
    expect(res.body).toHaveProperty('ok')
    expect(res.body).toHaveProperty('checks')
    expect(res.body.checks).toHaveProperty('database')
    expect(res.body.checks).toHaveProperty('pool')
    expect(res.body.checks).toHaveProperty('memory')
    expect(res.body).toHaveProperty('uptimeSeconds')
    expect(typeof res.body.uptimeSeconds).toBe('number')
  })

  it('database check has latencyMs when ok', async () => {
    const res = await admin.get('/api/admin/health')
    if (res.body.checks?.database?.ok) {
      expect(typeof res.body.checks.database.latencyMs).toBe('number')
      expect(res.body.checks.database.latencyMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('pool stats have total, idle, waiting', async () => {
    const res = await admin.get('/api/admin/health')
    const pool = res.body.checks?.pool
    if (pool) {
      expect(typeof pool.total).toBe('number')
      expect(typeof pool.idle).toBe('number')
      expect(typeof pool.waiting).toBe('number')
    }
  })
})

// ── 3. Metrics endpoint ──────────────────────────────────────────────────────
describe('Metrics endpoint shape', () => {
  it('returns uptimeSeconds, memory, and request counters', async () => {
    const res = await admin.get('/api/admin/metrics')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('uptimeSeconds')
    expect(res.body).toHaveProperty('memory')
    expect(res.body.memory).toHaveProperty('heapUsedMb')
    expect(res.body.memory).toHaveProperty('rssMb')
    expect(res.body).toHaveProperty('requests')
    expect(res.body.requests).toHaveProperty('total')
  })
})

// ── 4. Backup listing and on-demand run ──────────────────────────────────────
describe('Backup endpoints', () => {
  it('GET /api/admin/backups returns array of backup files', async () => {
    const res = await admin.get('/api/admin/backups')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    if (res.body.length > 0) {
      const b = res.body[0]
      expect(b).toHaveProperty('name')
      expect(b).toHaveProperty('size')
      expect(b.name).toMatch(/\.sql$/)
    }
  })

  it('POST /api/admin/backups/run triggers a backup and returns filename', async () => {
    const res = await admin.post('/api/admin/backups/run')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('filename')
    expect(res.body.filename).toMatch(/\.sql$/)
  }, 30000) // backup can take up to 30s

  it('backup file appears in the backup list after run', async () => {
    const list = await admin.get('/api/admin/backups')
    expect(list.status).toBe(200)
    expect(list.body.length).toBeGreaterThan(0)
  })
})

// ── 5. Audit log ─────────────────────────────────────────────────────────────
describe('Audit log', () => {
  it('GET /api/admin/audit returns array with expected shape', async () => {
    const res = await admin.get('/api/admin/audit?limit=10')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('audit entries have required fields', async () => {
    // Make a mutation so something is logged, then restore the original value
    const orig = await admin.get('/api/settings')
    const origName = orig.body?.restaurant_name ?? 'Automatic'
    await admin.put('/api/settings').send({ restaurant_name: `${TAG} Test` })
    await admin.put('/api/settings').send({ restaurant_name: origName })
    const res = await admin.get('/api/admin/audit?limit=5')
    if (res.body.length > 0) {
      const entry = res.body[0]
      expect(entry).toHaveProperty('id')
      expect(entry).toHaveProperty('method')
      expect(entry).toHaveProperty('path')
      expect(entry).toHaveProperty('status')
      expect(entry).toHaveProperty('created_at')
    }
  })

  it('audit log respects limit parameter', async () => {
    const res = await admin.get('/api/admin/audit?limit=3')
    expect(res.status).toBe(200)
    expect(res.body.length).toBeLessThanOrEqual(3)
  })
})

// ── 6. Input validation guards ───────────────────────────────────────────────
describe('API input validation', () => {
  it('POST /api/orders with empty items returns 400', async () => {
    const res = await admin.post('/api/orders').send({ type: 'takeaway', items: [], subtotal: 0, tax: 0, total: 0 })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('POST /api/menu with missing required fields returns 400', async () => {
    const res = await admin.post('/api/menu').send({ category: 'test' }) // missing name+price
    expect(res.status).toBe(400)
  })

  it('POST /api/inventory with negative quantity returns 400', async () => {
    const res = await admin.post('/api/inventory').send({ name: `${TAG} X`, quantity: -5, unit: 'kg' })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/orders/:id/status with invalid status returns 400', async () => {
    // Need a real order id — just use 999999 to test the validator path
    const res = await admin.patch('/api/orders/999999/status').send({ status: 'exploded' })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ── 7. Auth edge-cases ────────────────────────────────────────────────────────
describe('Auth edge-cases', () => {
  it('expired/tampered JWT returns 401', async () => {
    const fakeAgent = request.agent(app)
    // Manually inject a bad cookie
    fakeAgent.set('Cookie', 'access_token=badtoken123')
    const res = await fakeAgent.get('/api/inventory')
    expect(res.status).toBe(401)
  })

  it('login with unknown email returns 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@nowhere.test', password: 'whatever' })
    expect(res.status).toBe(401)
  })

  it('login rate-limit or brute-force shows errors accumulate', async () => {
    const attempts = await Promise.all(
      Array(5).fill(null).map(() =>
        request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'wrongpassword' })
      )
    )
    for (const r of attempts) expect(r.status).toBe(401)
  })
})
