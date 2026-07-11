// GET /api/shifts/:id must bind the shift window with parameters
// (opened_at → COALESCE(closed_at, NOW())) and return exactly the orders inside it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `shiftwin_${Date.now()}`
const PASSWORD = 'TestPass123'
let adminId, admin
let closedShiftId, openShiftId
const orderIds = []

function minutesAgo(mins) {
  return new Date(Date.now() - mins * 60 * 1000)
}

async function insertOrder(createdAt, total) {
  const r = await pool.query(
    `INSERT INTO orders (table_number, status, subtotal, tax, total, created_at)
     VALUES (1, 'completed', $2, 0, $2, $1) RETURNING id`,
    [createdAt, total]
  )
  orderIds.push(r.rows[0].id)
  return r.rows[0].id
}

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const u = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} admin`, `${TAG}@test.local`, hash, 'admin']
  )
  adminId = u.rows[0].id
  admin = request.agent(app)
  const login = await admin.post('/api/auth/login').send({ email: `${TAG}@test.local`, password: PASSWORD })
  expect(login.status).toBe(200)

  // Closed shift: window = [T-3h, T-1h] (well in the past, so no live orders interfere)
  const closed = await pool.query(`
    INSERT INTO shifts (opened_by, closed_by, status, opened_at, closed_at)
    VALUES ($1, $1, 'closed', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '1 hour')
    RETURNING id
  `, [adminId])
  closedShiftId = closed.rows[0].id
})

afterAll(async () => {
  if (orderIds.length) await pool.query('DELETE FROM orders WHERE id = ANY($1::int[])', [orderIds])
  await pool.query('DELETE FROM shifts WHERE id = ANY($1::int[])', [[closedShiftId, openShiftId].filter(Boolean)])
  await pool.query('DELETE FROM users WHERE id=$1', [adminId])
  await pool.end()
})

describe('shift detail order window (parameterized bounds)', () => {
  it('closed shift returns only orders between opened_at and closed_at', async () => {
    const inside = await insertOrder(minutesAgo(120), 11.111)
    const beforeOpen = await insertOrder(minutesAgo(240), 22.222)
    const afterClose = await insertOrder(minutesAgo(30), 33.333)

    const res = await admin.get(`/api/shifts/${closedShiftId}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.orders)).toBe(true)

    const totals = res.body.orders.map(o => Number(o.total))
    expect(totals).toContain(11.111)
    expect(totals).not.toContain(22.222)
    expect(totals).not.toContain(33.333)
    // silence unused-var lint intent — ids tracked for cleanup
    expect(inside && beforeOpen && afterClose).toBeTruthy()
  })

  it('open shift window runs through NOW()', async () => {
    // Only create an open shift if none exists (app enforces single open shift)
    const existing = await pool.query("SELECT id, opened_at FROM shifts WHERE status='open' LIMIT 1")
    let sid
    if (existing.rows.length) {
      sid = existing.rows[0].id
    } else {
      const r = await pool.query(`
        INSERT INTO shifts (opened_by, status, opened_at)
        VALUES ($1, 'open', NOW() - INTERVAL '10 minutes') RETURNING id
      `, [adminId])
      sid = r.rows[0].id
      openShiftId = sid
    }

    const recent = 44.444
    await insertOrder(new Date(), recent)

    const res = await admin.get(`/api/shifts/${sid}`)
    expect(res.status).toBe(200)
    const totals = res.body.orders.map(o => Number(o.total))
    expect(totals).toContain(recent)
  })
})
