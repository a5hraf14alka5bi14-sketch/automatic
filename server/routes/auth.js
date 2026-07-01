import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db.js'
import { verifyToken } from '../middleware/auth.js'

const router = express.Router()
const SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'automatic-restaurant-secret-key'

function makeTokens(userId, role) {
  const token = jwt.sign({ id: userId, role }, SECRET, { expiresIn: '2h' })
  const refresh_token = jwt.sign({ id: userId, role, type: 'refresh' }, SECRET, { expiresIn: '30d' })
  return { token, refresh_token }
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' })
    const user = result.rows[0]
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
    const { token, refresh_token } = makeTokens(user.id, user.role)
    res.json({
      token,
      refresh_token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body
  if (!refresh_token) return res.status(400).json({ error: 'Refresh token required' })
  try {
    const payload = jwt.verify(refresh_token, SECRET)
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' })
    const result = await pool.query('SELECT id, role FROM users WHERE id = $1', [payload.id])
    if (!result.rows.length) return res.status(401).json({ error: 'User not found' })
    const { id, role } = result.rows[0]
    const { token, refresh_token: newRefresh } = makeTokens(id, role)
    res.json({ token, refresh_token: newRefresh })
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' })
  }
})

router.patch('/password', verifyToken, async (req, res) => {
  const { current_password, new_password } = req.body
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current and new password are required' })
  }
  if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
  if (!/[A-Z]/.test(new_password)) return res.status(400).json({ error: 'Password must include an uppercase letter' })
  if (!/[a-z]/.test(new_password)) return res.status(400).json({ error: 'Password must include a lowercase letter' })
  if (!/[0-9]/.test(new_password)) return res.status(400).json({ error: 'Password must include a number' })

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
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
