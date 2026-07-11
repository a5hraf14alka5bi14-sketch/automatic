/**
 * Branch management API  — /api/branches
 *
 * GET  /              — list active branches (any authenticated role)
 * GET  /all           — list all branches incl. inactive (admin/manager)
 * POST /              — create a new branch (admin/manager)
 * PATCH /:id          — update branch fields (admin/manager)
 * DELETE /:id         — deactivate a branch (admin only; cannot deactivate default)
 */

import { Router }      from 'express'
import { pool }        from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { logger }      from '../logger.js'

const router = Router()

// ── Helpers ───────────────────────────────────────────────────────────────────
const SELECT_COLS = `id, name, name_ar, address, phone, is_active, is_default, created_at`

// ── GET / — active branches (any role) ───────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLS} FROM branches WHERE is_active = TRUE ORDER BY is_default DESC, name`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── GET /all — all branches incl. inactive (admin/manager) ───────────────────
router.get('/all', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLS} FROM branches ORDER BY is_default DESC, name`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── POST / — create branch ────────────────────────────────────────────────────
router.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { name, name_ar = null, address = null, phone = null } = req.body
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' })
    }
    if (name.trim().length > 120) {
      return res.status(400).json({ error: 'name must be ≤120 characters' })
    }
    const { rows } = await pool.query(
      `INSERT INTO branches (name, name_ar, address, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SELECT_COLS}`,
      [name.trim(), name_ar || null, address || null, phone || null]
    )
    logger.info('[branches] created', { id: rows[0].id, name: rows[0].name })
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
})

// ── PATCH /:id — update branch ────────────────────────────────────────────────
router.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!id) return res.status(400).json({ error: 'Invalid id' })

    const { name, name_ar, address, phone, is_active, is_default } = req.body
    const updates = []
    const vals    = []

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name cannot be empty' })
      }
      updates.push(`name = $${vals.length + 1}`)
      vals.push(name.trim())
    }
    if (name_ar  !== undefined) { updates.push(`name_ar  = $${vals.length + 1}`); vals.push(name_ar  || null) }
    if (address  !== undefined) { updates.push(`address  = $${vals.length + 1}`); vals.push(address  || null) }
    if (phone    !== undefined) { updates.push(`phone    = $${vals.length + 1}`); vals.push(phone    || null) }
    if (is_active !== undefined) {
      // Cannot deactivate the default branch
      if (!is_active) {
        const { rows: cur } = await pool.query('SELECT is_default FROM branches WHERE id=$1', [id])
        if (cur[0]?.is_default) {
          return res.status(400).json({ error: 'Cannot deactivate the default branch. Set another branch as default first.' })
        }
      }
      updates.push(`is_active = $${vals.length + 1}`)
      vals.push(Boolean(is_active))
    }
    if (is_default === true) {
      // Clear old default first, then set this one in a transaction
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('UPDATE branches SET is_default = FALSE WHERE is_default = TRUE')
        await client.query('UPDATE branches SET is_default = TRUE, is_active = TRUE WHERE id = $1', [id])
        await client.query('COMMIT')
        const { rows } = await client.query(`SELECT ${SELECT_COLS} FROM branches WHERE id = $1`, [id])
        logger.info('[branches] default changed', { id })
        return res.json(rows[0])
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' })

    vals.push(id)
    const { rows } = await pool.query(
      `UPDATE branches SET ${updates.join(', ')} WHERE id = $${vals.length} RETURNING ${SELECT_COLS}`,
      vals
    )
    if (!rows.length) return res.status(404).json({ error: 'Branch not found' })
    res.json(rows[0])
  } catch (err) { next(err) }
})

// ── DELETE /:id — deactivate (not hard-delete) ────────────────────────────────
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!id) return res.status(400).json({ error: 'Invalid id' })

    const { rows: cur } = await pool.query('SELECT is_default FROM branches WHERE id=$1', [id])
    if (!cur.length) return res.status(404).json({ error: 'Branch not found' })
    if (cur[0].is_default) {
      return res.status(400).json({ error: 'Cannot deactivate the default branch.' })
    }

    await pool.query('UPDATE branches SET is_active = FALSE WHERE id = $1', [id])
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
