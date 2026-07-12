// @vitest-environment node
/**
 * tests/branches.test.js
 * Branch management API — /api/branches
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function loginAs(role) {
  const email = `itest_branch_${role}_${Date.now()}@test.com`
  const { hashPassword } = await import('../server/lib/password.js')
  const hash = await hashPassword('Test1234!')
  await pool.query(
    'INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,$4,false)',
    [`Branch ${role}`, email, hash, role]
  )
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Test1234!' })
  const cookie = res.headers['set-cookie']
  return { cookie, email }
}

// ── Cleanup helpers ───────────────────────────────────────────────────────────
let createdBranchIds = []
let createdUserEmails = []

beforeAll(async () => {
  await pool.query('SELECT 1') // warm up pool
})

afterAll(async () => {
  if (createdBranchIds.length) {
    await pool.query(
      `DELETE FROM branches WHERE id = ANY($1) AND is_default = FALSE`,
      [createdBranchIds]
    )
  }
  if (createdUserEmails.length) {
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [createdUserEmails])
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/branches', () => {
  it('returns active branches for any authenticated role', async () => {
    const { cookie, email } = await loginAs('cashier')
    createdUserEmails.push(email)

    const res = await request(app)
      .get('/api/branches')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // every row must have is_active = true
    res.body.forEach(b => expect(b.is_active).toBe(true))
  })

  it('requires authentication — 401 without token', async () => {
    const res = await request(app).get('/api/branches')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/branches/all', () => {
  it('admin can see all branches including inactive', async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const res = await request(app)
      .get('/api/branches/all')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('cashier is denied — 403', async () => {
    const { cookie, email } = await loginAs('cashier')
    createdUserEmails.push(email)

    const res = await request(app)
      .get('/api/branches/all')
      .set('Cookie', cookie)

    expect(res.status).toBe(403)
  })
})

describe('POST /api/branches', () => {
  it('admin can create a branch', async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const res = await request(app)
      .post('/api/branches')
      .set('Cookie', cookie)
      .send({ name: `itest branch ${Date.now()}`, name_ar: 'فرع تجريبي' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body.is_default).toBe(false)
    createdBranchIds.push(res.body.id)
  })

  it('manager can create a branch', async () => {
    const { cookie, email } = await loginAs('manager')
    createdUserEmails.push(email)

    const res = await request(app)
      .post('/api/branches')
      .set('Cookie', cookie)
      .send({ name: `itest branch mgr ${Date.now()}` })

    expect(res.status).toBe(201)
    createdBranchIds.push(res.body.id)
  })

  it('rejects missing name — 400', async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const res = await request(app)
      .post('/api/branches')
      .set('Cookie', cookie)
      .send({ name_ar: 'only arabic' })

    expect(res.status).toBe(400)
  })

  it('rejects name > 120 chars — 400', async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const res = await request(app)
      .post('/api/branches')
      .set('Cookie', cookie)
      .send({ name: 'x'.repeat(121) })

    expect(res.status).toBe(400)
  })

  it('cashier is denied — 403', async () => {
    const { cookie, email } = await loginAs('cashier')
    createdUserEmails.push(email)

    const res = await request(app)
      .post('/api/branches')
      .set('Cookie', cookie)
      .send({ name: 'cashier branch attempt' })

    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/branches/:id', () => {
  let branchId

  beforeAll(async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)
    const res = await request(app)
      .post('/api/branches')
      .set('Cookie', cookie)
      .send({ name: `itest patch target ${Date.now()}` })
    branchId = res.body.id
    createdBranchIds.push(branchId)
  })

  it('admin can update branch name', async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const res = await request(app)
      .patch(`/api/branches/${branchId}`)
      .set('Cookie', cookie)
      .send({ name: 'itest updated name' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('itest updated name')
  })

  it('rejects empty name — 400', async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const res = await request(app)
      .patch(`/api/branches/${branchId}`)
      .set('Cookie', cookie)
      .send({ name: '   ' })

    expect(res.status).toBe(400)
  })

  it('returns 400 when nothing to update', async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const res = await request(app)
      .patch(`/api/branches/${branchId}`)
      .set('Cookie', cookie)
      .send({})

    expect(res.status).toBe(400)
  })

  it('cannot deactivate the default branch', async () => {
    // First find the default branch
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const listRes = await request(app).get('/api/branches').set('Cookie', cookie)
    const defaultBranch = listRes.body.find(b => b.is_default)
    if (!defaultBranch) return // no default in test DB — skip assertion

    const res = await request(app)
      .patch(`/api/branches/${defaultBranch.id}`)
      .set('Cookie', cookie)
      .send({ is_active: false })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/default/i)
  })

  it('admin can deactivate a non-default branch', async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const res = await request(app)
      .patch(`/api/branches/${branchId}`)
      .set('Cookie', cookie)
      .send({ is_active: false })

    expect(res.status).toBe(200)
    expect(res.body.is_active).toBe(false)
  })
})

describe('DELETE /api/branches/:id', () => {
  it('admin can deactivate a non-default branch', async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const createRes = await request(app)
      .post('/api/branches')
      .set('Cookie', cookie)
      .send({ name: `itest delete ${Date.now()}` })
    const id = createRes.body.id
    createdBranchIds.push(id)

    const res = await request(app)
      .delete(`/api/branches/${id}`)
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('cannot deactivate the default branch via DELETE', async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const listRes = await request(app).get('/api/branches').set('Cookie', cookie)
    const defaultBranch = listRes.body.find(b => b.is_default)
    if (!defaultBranch) return // no default — skip

    const res = await request(app)
      .delete(`/api/branches/${defaultBranch.id}`)
      .set('Cookie', cookie)

    expect(res.status).toBe(400)
  })

  it('manager is denied DELETE — 403', async () => {
    const { cookie, email } = await loginAs('manager')
    createdUserEmails.push(email)

    const res = await request(app)
      .delete('/api/branches/99999')
      .set('Cookie', cookie)

    expect(res.status).toBe(403)
  })

  it('returns 404 for unknown id', async () => {
    const { cookie, email } = await loginAs('admin')
    createdUserEmails.push(email)

    const res = await request(app)
      .delete('/api/branches/99999999')
      .set('Cookie', cookie)

    expect(res.status).toBe(404)
  })
})
