import express from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = express.Router()

// ── GET /api/users/me — current authenticated user's profile ──────────────────
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id=$1',
      [req.user.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── PATCH /api/users/:id/password — self-service or admin reset ────────────────
router.patch('/:id/password', async (req, res) => {
  const targetId = parseInt(req.params.id)
  const isSelf = targetId === req.user.id
  const isAdmin = req.user.role === 'admin'
  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: 'Forbidden — insufficient role' })
  }
  const { current_password, new_password } = req.body
  if (!new_password) return res.status(400).json({ error: 'new_password is required' })
  if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
  if (!/[A-Z]/.test(new_password)) return res.status(400).json({ error: 'Password must include an uppercase letter' })
  if (!/[a-z]/.test(new_password)) return res.status(400).json({ error: 'Password must include a lowercase letter' })
  if (!/[0-9]/.test(new_password)) return res.status(400).json({ error: 'Password must include a number' })
  try {
    const target = await pool.query('SELECT password FROM users WHERE id=$1', [targetId])
    if (!target.rows.length) return res.status(404).json({ error: 'Not found' })
    // Self-service change requires verifying the current password.
    if (isSelf) {
      if (!current_password) return res.status(400).json({ error: 'current_password is required' })
      const valid = await bcrypt.compare(current_password, target.rows[0].password)
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })
    }
    const hash = await bcrypt.hash(new_password, 10)
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, targetId])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at'
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', requireRole('admin'), async (req, res) => {
  const { name, email, password, role } = req.body
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, password required' })
  }
  const validRoles = ['admin', 'manager', 'cashier', 'kitchen', 'staff']
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }
  try {
    const hash = await bcrypt.hash(password, 10)
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, created_at',
      [name, email, hash, role || 'staff']
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' })
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id/role', requireRole('admin'), async (req, res) => {
  const { role } = req.body
  const validRoles = ['admin', 'manager', 'cashier', 'kitchen', 'staff']
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' })
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot change your own role' })
  }
  try {
    const result = await pool.query(
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING id, name, email, role',
      [role, req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', requireRole('admin'), async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' })
  }
  try {
    const result = await pool.query('DELETE FROM users WHERE id=$1 RETURNING id', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
