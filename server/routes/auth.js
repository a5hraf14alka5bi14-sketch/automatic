import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db.js'
import { verifyToken } from '../middleware/auth.js'
import {
  SECRET, cookieOptions,
  ACCESS_COOKIE, REFRESH_COOKIE, ACCESS_MAX_AGE, REFRESH_MAX_AGE,
} from '../config/secret.js'
import { passwordSchema } from '../validators.js'

const router = express.Router()

function makeTokens(userId, role) {
  const token = jwt.sign({ id: userId, role }, SECRET, { expiresIn: '2h' })
  const refresh_token = jwt.sign({ id: userId, role, type: 'refresh' }, SECRET, { expiresIn: '30d' })
  return { token, refresh_token }
}

function setAuthCookies(res, token, refresh_token) {
  res.cookie(ACCESS_COOKIE, token, cookieOptions(ACCESS_MAX_AGE))
  res.cookie(REFRESH_COOKIE, refresh_token, cookieOptions(REFRESH_MAX_AGE))
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' })
  res.clearCookie(REFRESH_COOKIE, { path: '/' })
}

router.post('/login', async (req, res, next) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' })
    const user = result.rows[0]
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
    const { token, refresh_token } = makeTokens(user.id, user.role)
    setAuthCookies(res, token, refresh_token)
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    })
  } catch (err) {
    next(err)
  }
})

router.post('/refresh', async (req, res) => {
  const refresh_token = req.cookies?.[REFRESH_COOKIE] || req.body?.refresh_token
  if (!refresh_token) return res.status(401).json({ error: 'Session expired' })
  try {
    const payload = jwt.verify(refresh_token, SECRET)
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid session' })
    const result = await pool.query('SELECT id, role FROM users WHERE id = $1', [payload.id])
    if (!result.rows.length) return res.status(401).json({ error: 'Session expired' })
    const { id, role } = result.rows[0]
    const { token, refresh_token: newRefresh } = makeTokens(id, role)
    setAuthCookies(res, token, newRefresh)
    res.json({ success: true })
  } catch {
    clearAuthCookies(res)
    res.status(401).json({ error: 'Session expired' })
  }
})

router.post('/logout', (req, res) => {
  clearAuthCookies(res)
  res.json({ success: true })
})

router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id])
    if (!result.rows.length) return res.status(401).json({ error: 'Session expired' })
    res.json({ user: result.rows[0] })
  } catch (err) {
    next(err)
  }
})

router.patch('/password', verifyToken, async (req, res, next) => {
  const { current_password, new_password } = req.body
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current and new password are required' })
  }
  const { error: pwErr } = passwordSchema.validate(new_password)
  if (pwErr) return res.status(400).json({ error: pwErr.message })

  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' })
    const user = result.rows[0]
    const valid = await bcrypt.compare(current_password, user.password)
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })
    const hash = await bcrypt.hash(new_password, 12)
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, user.id])
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
