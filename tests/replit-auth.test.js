import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'
import { findStaffUser } from '../server/routes/replitAuth.js'

const ts = Date.now()
const EMAIL = `itest_replit_${ts}@example.com`
let userId

beforeAll(async () => {
  const r = await pool.query(
    `INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', 'staff') RETURNING id`,
    [`itest_replit_${ts}`, EMAIL]
  )
  userId = r.rows[0].id
})

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = $1', [userId])
})

describe('Replit Auth', () => {
  it('migration 016 created the sessions table and replit_sub column', async () => {
    const t = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions'`)
    expect(t.rows.length).toBe(1)
    const c = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'replit_sub'`
    )
    expect(c.rows.length).toBe(1)
  })

  it('GET /api/login redirects to the Replit OIDC authorize endpoint', async () => {
    const res = await request(app).get('/api/login').set('Host', 'localhost')
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('replit.com/oidc')
  })

  it('findStaffUser returns null for an unknown Replit account (no auto-creation)', async () => {
    const user = await findStaffUser({ sub: `itest-sub-none-${ts}`, email: `nobody_${ts}@example.com`, email_verified: true })
    expect(user).toBeNull()
    const count = await pool.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [`nobody_${ts}@example.com`])
    expect(count.rows[0].n).toBe(0)
  })

  it('findStaffUser rejects an email match when the email is not verified', async () => {
    const user = await findStaffUser({ sub: `itest-sub-unverified-${ts}`, email: EMAIL })
    expect(user).toBeNull()
    const linked = await pool.query('SELECT replit_sub FROM users WHERE id = $1', [userId])
    expect(linked.rows[0].replit_sub).toBeNull()
  })

  it('findStaffUser matches an existing staff account by verified email and links replit_sub', async () => {
    const sub = `itest-sub-${ts}`
    const user = await findStaffUser({ sub, email: EMAIL.toUpperCase(), email_verified: true })
    expect(user).not.toBeNull()
    expect(user.id).toBe(userId)
    const linked = await pool.query('SELECT replit_sub FROM users WHERE id = $1', [userId])
    expect(linked.rows[0].replit_sub).toBe(sub)
  })

  it('findStaffUser then matches by replit_sub even if the email changes', async () => {
    const sub = `itest-sub-${ts}`
    const user = await findStaffUser({ sub, email: `changed_${ts}@example.com` })
    expect(user).not.toBeNull()
    expect(user.id).toBe(userId)
  })

  it('rejects login requests from unknown hostnames', async () => {
    const res = await request(app).get('/api/login').set('Host', 'evil.example.com')
    expect(res.status).toBe(403)
  })

  it('does not overwrite an already-linked replit_sub with a different account sub', async () => {
    const other = await findStaffUser({ sub: `itest-other-sub-${ts}`, email: EMAIL, email_verified: true })
    expect(other).not.toBeNull()
    const linked = await pool.query('SELECT replit_sub FROM users WHERE id = $1', [userId])
    expect(linked.rows[0].replit_sub).toBe(`itest-sub-${ts}`)
  })

  it('/api/callback without a session redirects to a failure state (no crash)', async () => {
    const res = await request(app).get('/api/callback?code=bogus&state=bogus').set('Host', 'localhost')
    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/replit_auth=(failed|unmatched)/)
  })
})
