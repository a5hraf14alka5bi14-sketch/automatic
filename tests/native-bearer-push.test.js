// Native bearer-token auth + push-registration tests — exercise the real
// Express app + PostgreSQL. Self-contained: rows are tagged and cleaned up.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `itest_bearer_${Date.now()}`
const EMAIL = `${TAG}@test.local`
const PASSWORD = 'TestPass123'
let userId = null

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const r = await pool.query(
    'INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} kitchen`, EMAIL, hash, 'kitchen']
  )
  userId = r.rows[0].id
})

afterAll(async () => {
  if (userId) {
    await pool.query('DELETE FROM device_tokens WHERE user_id = $1', [userId])
    await pool.query('DELETE FROM users WHERE id = $1', [userId])
  }
})

describe('Bearer tokens in auth responses (native shells)', () => {
  it('returns token + refresh_token in the login body (in addition to cookies)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.token.length).toBeGreaterThan(0)
    expect(typeof res.body.refresh_token).toBe('string')
    // Cookies must still be set so web keeps working unchanged.
    expect(res.headers['set-cookie']?.some((c) => c.startsWith('access_token='))).toBe(true)
  })

  it('accepts Authorization: Bearer for a protected route (no cookie)', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })
    const token = login.body.token
    // Fresh request() (not agent) => no cookie jar; only the bearer header authenticates.
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe(EMAIL)
  })

  it('refreshes using the refresh_token in the body and rotates tokens', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })
    const res = await request(app).post('/api/auth/refresh').send({ refresh_token: login.body.refresh_token })
    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(typeof res.body.refresh_token).toBe('string')
  })
})

describe('Push device-token registration', () => {
  it('rejects unauthenticated registration', async () => {
    const res = await request(app).post('/api/push/register').send({ token: 'x', platform: 'ios' })
    expect(res.status).toBe(401)
  })

  it('registers a device token for the authenticated user (bearer auth)', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })
    const bearer = `Bearer ${login.body.token}`
    const devToken = `${TAG}_device_1`
    const res = await request(app).post('/api/push/register')
      .set('Authorization', bearer)
      .send({ token: devToken, platform: 'android' })
    expect(res.status).toBe(200)
    const row = await pool.query('SELECT user_id, platform FROM device_tokens WHERE token = $1', [devToken])
    expect(row.rows[0]?.user_id).toBe(userId)
    expect(row.rows[0]?.platform).toBe('android')
  })

  it('is idempotent: re-registering the same token upserts, not duplicates', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })
    const bearer = `Bearer ${login.body.token}`
    const devToken = `${TAG}_device_2`
    await request(app).post('/api/push/register').set('Authorization', bearer).send({ token: devToken, platform: 'ios' })
    await request(app).post('/api/push/register').set('Authorization', bearer).send({ token: devToken, platform: 'web' })
    const rows = await pool.query('SELECT platform FROM device_tokens WHERE token = $1', [devToken])
    expect(rows.rowCount).toBe(1)
    expect(rows.rows[0].platform).toBe('web')
  })

  it('rejects registration with a missing token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })
    const res = await request(app).post('/api/push/register')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ platform: 'ios' })
    expect(res.status).toBe(400)
  })

  it('unregisters a device token (idempotent DELETE)', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })
    const bearer = `Bearer ${login.body.token}`
    const devToken = `${TAG}_device_3`
    await request(app).post('/api/push/register').set('Authorization', bearer).send({ token: devToken, platform: 'ios' })
    const del = await request(app).delete('/api/push/register').set('Authorization', bearer).send({ token: devToken })
    expect(del.status).toBe(200)
    const rows = await pool.query('SELECT 1 FROM device_tokens WHERE token = $1', [devToken])
    expect(rows.rowCount).toBe(0)
  })

  it('does NOT let one user unregister another user\'s device token', async () => {
    // Seed a second user + their device token, then try to delete it as our user.
    const hash = await bcrypt.hash(PASSWORD, 10)
    const otherEmail = `${TAG}_other@test.local`
    const other = await pool.query(
      'INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
      [`${TAG} other`, otherEmail, hash, 'kitchen']
    )
    const otherId = other.rows[0].id
    const victimToken = `${TAG}_device_victim`
    try {
      await pool.query('INSERT INTO device_tokens (user_id, token, platform) VALUES ($1,$2,$3)', [otherId, victimToken, 'ios'])
      const login = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })
      // Attacker (our user) tries to delete the victim's token — returns 200 but is a no-op.
      const del = await request(app).delete('/api/push/register')
        .set('Authorization', `Bearer ${login.body.token}`)
        .send({ token: victimToken })
      expect(del.status).toBe(200)
      const rows = await pool.query('SELECT user_id FROM device_tokens WHERE token = $1', [victimToken])
      expect(rows.rowCount).toBe(1) // still there — not deleted
      expect(rows.rows[0].user_id).toBe(otherId)
    } finally {
      await pool.query('DELETE FROM device_tokens WHERE user_id = $1', [otherId])
      await pool.query('DELETE FROM users WHERE id = $1', [otherId])
    }
  })
})

describe('Forced password change token rotation (native bearer)', () => {
  it('old access token stays locked out; the rotated token from the change unlocks', async () => {
    // Seed a user flagged to change their password.
    const hash = await bcrypt.hash(PASSWORD, 10)
    const email = `${TAG}_mustchange@test.local`
    const seeded = await pool.query(
      'INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,$4,true) RETURNING id',
      [`${TAG} mustchange`, email, hash, 'admin']
    )
    const uid = seeded.rows[0].id
    try {
      // Login yields a token carrying mustChange=true.
      const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD })
      expect(login.status).toBe(200)
      const oldToken = login.body.token

      // The old token is locked out of protected routes by enforcePasswordChange.
      const blocked = await request(app).get('/api/inventory').set('Authorization', `Bearer ${oldToken}`)
      expect(blocked.status).toBe(403)
      expect(blocked.body.mustChangePassword).toBe(true)

      // Change the password (allowed with the mustChange token) → get rotated tokens.
      const changed = await request(app).patch('/api/auth/password')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({ current_password: PASSWORD, new_password: 'NewTestPass456' })
      expect(changed.status).toBe(200)
      expect(typeof changed.body.token).toBe('string')

      // The rotated token (mustChange=false) now passes protected routes — this is
      // exactly what src/pages/ChangePassword.jsx stores on native.
      const ok = await request(app).get('/api/inventory').set('Authorization', `Bearer ${changed.body.token}`)
      expect(ok.status).toBe(200)
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [uid])
    }
  })
})
