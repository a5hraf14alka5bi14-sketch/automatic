// Factory reset — SAFE tests only. These verify authorization and input
// validation guards; they NEVER trigger an actual reset (which would wipe
// the shared dev database). The destructive path is exercised manually.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'
import { hashPassword } from '../server/lib/password.js'

const TAG = `frtest_${Date.now()}`
const ADMIN_EMAIL = `${TAG}_admin@test.local`
const STAFF_EMAIL = `${TAG}_staff@test.local`
const PASSWORD = 'TestPass123'
const ids = { admin: null, staff: null }

async function seedUser(email, role) {
  const hash = await hashPassword(PASSWORD)
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
  ids.admin = await seedUser(ADMIN_EMAIL, 'admin')
  ids.staff = await seedUser(STAFF_EMAIL, 'staff')
  admin = await login(ADMIN_EMAIL)
  staff = await login(STAFF_EMAIL)
})

afterAll(async () => {
  await pool.query('DELETE FROM audit_log WHERE user_email LIKE $1', [`${TAG}%`])
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`${TAG}%`])
})

describe('POST /api/admin/factory-reset — guards', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/admin/factory-reset').send({ confirm: 'RESET' })
    expect(res.status).toBe(401)
  })

  it('rejects non-admin roles', async () => {
    const res = await staff.post('/api/admin/factory-reset').send({ confirm: 'RESET' })
    expect(res.status).toBe(403)
  })

  it('rejects a missing confirmation string', async () => {
    const res = await admin.post('/api/admin/factory-reset').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/confirm/i)
  })

  it('rejects a wrong confirmation string (case-sensitive)', async () => {
    const res = await admin.post('/api/admin/factory-reset').send({ confirm: 'reset' })
    expect(res.status).toBe(400)
  })

  it('rejects an invalid inventoryMode before doing anything', async () => {
    const res = await admin.post('/api/admin/factory-reset').send({ confirm: 'RESET', inventoryMode: 'nuke' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/inventoryMode/)
  })
})

describe('performFactoryReset — input validation', () => {
  it('throws a 400-flagged error for a bad inventoryMode without touching the DB', async () => {
    const { performFactoryReset } = await import('../server/lib/factory-reset.js')
    await expect(performFactoryReset(pool, { inventoryMode: 'bad' })).rejects.toMatchObject({ status: 400 })
  })
})
