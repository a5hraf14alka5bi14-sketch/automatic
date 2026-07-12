// Shift routes must accept BOTH admin and manager; cashier still gets 403.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `shiftadmin_${Date.now()}`
const PASSWORD = 'TestPass123'
const ids = { admin: null, cashier: null }
const shiftIds = []

let admin, cashier

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10)
  for (const role of ['admin', 'cashier']) {
    const r = await pool.query(
      'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
      [`${TAG} ${role}`, `${TAG}_${role}@test.local`, hash, role]
    )
    ids[role] = r.rows[0].id
  }
  admin = request.agent(app)
  cashier = request.agent(app)
  const a = await admin.post('/api/auth/login').send({ email: `${TAG}_admin@test.local`, password: PASSWORD })
  expect(a.status).toBe(200)
  const c = await cashier.post('/api/auth/login').send({ email: `${TAG}_cashier@test.local`, password: PASSWORD })
  expect(c.status).toBe(200)
})

afterAll(async () => {
  for (const sid of shiftIds) {
    await pool.query('DELETE FROM shifts WHERE id=$1', [sid])
  }
  await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [[ids.admin, ids.cashier]])
  await pool.end()
})

describe('shift routes — admin access', () => {
  let openShiftId

  it('admin can open a shift', async () => {
    const res = await admin.post('/api/shifts/open').send({ opening_cash: 100 })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('open')
    openShiftId = res.body.id
    shiftIds.push(openShiftId)
  })

  it('admin can list shifts and fetch shift detail', async () => {
    const list = await admin.get('/api/shifts')
    expect(list.status).toBe(200)
    const detail = await admin.get(`/api/shifts/${openShiftId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.id ?? detail.body.shift?.id).toBe(openShiftId)
  })

  it('admin can close the shift (Z-Report)', async () => {
    const res = await admin.post(`/api/shifts/${openShiftId}/close`).send({ actual_cash: 100 })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('closed')
  })

  it('cashier still gets 403 on shift management routes', async () => {
    expect((await cashier.get('/api/shifts')).status).toBe(403)
    expect((await cashier.get(`/api/shifts/${openShiftId}`)).status).toBe(403)
    expect((await cashier.post('/api/shifts/open').send({ opening_cash: 10 })).status).toBe(403)
    expect((await cashier.post(`/api/shifts/${openShiftId}/close`).send({ actual_cash: 10 })).status).toBe(403)
  })

  it('cashier can still read the current shift', async () => {
    const res = await cashier.get('/api/shifts/current')
    expect(res.status).toBe(200)
  })
})
