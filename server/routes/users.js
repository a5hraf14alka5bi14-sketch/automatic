import express from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = express.Router()

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
