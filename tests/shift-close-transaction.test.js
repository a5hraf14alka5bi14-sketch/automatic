// Shift close must be atomic: a DB error mid-close rolls back and leaves the shift open.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `shiftclose_${Date.now()}`
const MANAGER_EMAIL = `${TAG}_mgr@test.local`
const PASSWORD = 'TestPass123'
const ids = { manager: null }
const shiftIds = []

const origConnect = pool.connect.bind(pool)

let manager

async function seedShift() {
  const r = await pool.query(
    "INSERT INTO shifts (opened_by, status) VALUES ($1, 'open') RETURNING id",
    [ids.manager]
  )
  shiftIds.push(r.rows[0].id)
  return r.rows[0].id
}

// Intercept pool.connect() so the checked-out client fails on a chosen statement.
// pg's internal pool.query(...) path passes a callback — leave that untouched.
function failOn(matcher) {
  vi.spyOn(pool, 'connect').mockImplementation(function (cb) {
    if (cb) return origConnect(cb)
    return origConnect().then((client) => {
      const origQuery = client.query.bind(client)
      const origRelease = client.release.bind(client)
      client.query = (text, params) => {
        if (typeof text === 'string' && matcher(text)) {
          return Promise.reject(new Error('simulated mid-close DB failure'))
        }
        return origQuery(text, params)
      }
      // Un-poison the client before it returns to the pool so later
      // checkouts (and other tests) get a clean client.
      client.release = (...args) => {
        delete client.query
        delete client.release
        return origRelease(...args)
      }
      return client
    })
  })
}

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const r = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} manager`, MANAGER_EMAIL, hash, 'manager']
  )
  ids.manager = r.rows[0].id
  manager = request.agent(app)
  const login = await manager.post('/api/auth/login').send({ email: MANAGER_EMAIL, password: PASSWORD })
  expect(login.status).toBe(200)
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  for (const sid of shiftIds) {
    await pool.query('DELETE FROM shifts WHERE id=$1', [sid])
  }
  await pool.query('DELETE FROM users WHERE id=$1', [ids.manager])
  await pool.end()
})

describe('POST /api/shifts/:id/close — transactional integrity', () => {
  it('a failure in the Z-Report aggregate query returns 500 and leaves the shift open', async () => {
    const sid = await seedShift()
    failOn((sql) => sql.includes('FILTER (WHERE status'))

    const res = await manager.post(`/api/shifts/${sid}/close`).send({ actual_cash: 100 })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/still open/i)

    const check = await pool.query('SELECT status, closed_at, actual_cash FROM shifts WHERE id=$1', [sid])
    expect(check.rows[0].status).toBe('open')
    expect(check.rows[0].closed_at).toBeNull()
    expect(check.rows[0].actual_cash).toBeNull()
  })

  it('a failure AFTER the shift UPDATE (at COMMIT) rolls the update back — shift stays open', async () => {
    const sid = await seedShift()
    failOn((sql) => sql.trim() === 'COMMIT')

    const res = await manager.post(`/api/shifts/${sid}/close`).send({ actual_cash: 50 })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/no changes were saved/i)

    const check = await pool.query('SELECT status, closed_at, actual_cash FROM shifts WHERE id=$1', [sid])
    expect(check.rows[0].status).toBe('open')
    expect(check.rows[0].closed_at).toBeNull()
    expect(check.rows[0].actual_cash).toBeNull()
  })

  it('after a failed attempt, the shift can still be closed normally', async () => {
    const sid = await seedShift()

    // First attempt fails mid-transaction
    failOn((sql) => sql.includes('FILTER (WHERE status'))
    const fail = await manager.post(`/api/shifts/${sid}/close`).send({ actual_cash: 75 })
    expect(fail.status).toBe(500)
    vi.restoreAllMocks()

    // Retry succeeds
    const ok = await manager.post(`/api/shifts/${sid}/close`).send({ actual_cash: 75 })
    expect(ok.status).toBe(200)
    expect(ok.body.status).toBe('closed')
    expect(parseFloat(ok.body.actual_cash)).toBe(75)
    expect(ok.body.closed_at).not.toBeNull()

    const check = await pool.query('SELECT status FROM shifts WHERE id=$1', [sid])
    expect(check.rows[0].status).toBe('closed')
  })

  it('closing an already-closed shift returns 404 (no double close)', async () => {
    const sid = await seedShift()
    const first = await manager.post(`/api/shifts/${sid}/close`).send({ actual_cash: 10 })
    expect(first.status).toBe(200)
    const second = await manager.post(`/api/shifts/${sid}/close`).send({ actual_cash: 10 })
    expect(second.status).toBe(404)
  })
})
