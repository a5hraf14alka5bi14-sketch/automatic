import express from 'express'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { passwordSchema, createUserSchema, patchUserRoleSchema } from '../validators.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
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
    // Both self-service and admin-reset require current_password confirmation.
    // For self: verifies their own password. For admin: verifies the admin's own
    // password (not the target's) — so a hijacked admin session cannot silently
    // take over other accounts without knowing the admin's credentials.
    if (!current_password) {
      return res.status(400).json({
        error: isSelf
          ? 'current_password is required'
          : 'current_password (your own admin password) is required to reset another account',
      })
    }
    if (isSelf) {
      const valid = await verifyPassword(current_password, target.rows[0].password)
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })
    } else {
      // Admin resetting another user — verify the admin's OWN password, not the target's.
      const adminRow = await pool.query('SELECT password FROM users WHERE id=$1', [req.user.id])
      const valid = await verifyPassword(current_password, adminRow.rows[0].password)
      if (!valid) return res.status(401).json({ error: 'Admin password confirmation is incorrect' })
    }
    const hash = await hashPassword(new_password)
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, targetId])
    res.json({ success: true })
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// Optional pagination: ?limit=&offset= (omit for full list). Sets X-Total-Count.
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const { limit, offset } = req.query
    const total = await pool.query('SELECT COUNT(*)::int AS c FROM users')
    res.set('X-Total-Count', String(total.rows[0].c))
    let query = 'SELECT id, name, email, role, created_at FROM users ORDER BY created_at'
    const params = []
    if (limit !== undefined) {
      params.push(Math.min(Math.max(parseInt(limit) || 0, 0), 500)); query += ` LIMIT $${params.length}`
      params.push(Math.max(parseInt(offset) || 0, 0)); query += ` OFFSET $${params.length}`
    }
    res.json((await pool.query(query, params)).rows)
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', requireRole('admin'), validate(createUserSchema), async (req, res) => {
  const { name, email, password, role } = req.body
  try {
    const hash = await hashPassword(password)
    // Admin-created accounts must reset the admin-chosen password on first login.
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,$4,true) RETURNING id, name, email, role, created_at',
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
