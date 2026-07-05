import express from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { passwordSchema, createUserSchema, patchUserRoleSchema } from '../validators.js'
import { logger } from '../logger.js'

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
    logger.error(err?.message || 'Server error', { path: req.path })
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
  const { error: pwErr } = passwordSchema.validate(new_password)
  if (pwErr) return res.status(400).json({ error: pwErr.message })
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
    logger.error(err?.message || 'Server error', { path: req.path })
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
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', requireRole('admin'), validate(createUserSchema), async (req, res) => {
  const { name, email, password, role } = req.body
  try {
    const hash = await bcrypt.hash(password, 10)
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, created_at',
      [name, email, hash, role || 'staff']
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' })
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id/role', requireRole('admin'), validate(patchUserRoleSchema), async (req, res) => {
  const { role } = req.body
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
    logger.error(err?.message || 'Server error', { path: req.path })
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
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
