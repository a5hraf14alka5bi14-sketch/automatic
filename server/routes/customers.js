import express from 'express'
import { pool } from '../db.js'
import { validate } from '../middleware/validate.js'
import { requireRole } from '../middleware/auth.js'
import { customerCreateSchema, customerUpdateSchema } from '../validators.js'
import { logger } from '../logger.js'

const router = express.Router()

// Optional pagination: ?limit=&offset= (omit for full list). Sets X-Total-Count.
router.get('/', async (req, res) => {
  try {
    const { search, limit, offset } = req.query
    let where = ' WHERE deleted_at IS NULL'
    const params = []
    if (search) {
      params.push(`%${search}%`)
      where += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`
    }
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM customers${where}`, params)
    res.set('X-Total-Count', String(total.rows[0].c))
    let query = `SELECT * FROM customers${where} ORDER BY name`
    if (limit !== undefined) {
      params.push(Math.min(Math.max(parseInt(limit) || 0, 0), 500)); query += ` LIMIT $${params.length}`
      params.push(Math.max(parseInt(offset) || 0, 0)); query += ` OFFSET $${params.length}`
    }
    res.json((await pool.query(query, params)).rows)
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers WHERE id=$1 AND deleted_at IS NULL', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

router.post('/', validate(customerCreateSchema), async (req, res) => {
  const { name, email, phone, address, notes } = req.body
  try {
    const result = await pool.query(
      'INSERT INTO customers (name, email, phone, address, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, email || null, phone || null, address || null, notes || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' })
    logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id', validate(customerUpdateSchema), async (req, res) => {
  const { name, email, phone, address, notes } = req.body
  try {
    const result = await pool.query(
      `UPDATE customers SET
        name=COALESCE($1,name), email=COALESCE($2,email),
        phone=COALESCE($3,phone), address=COALESCE($4,address),
        notes=COALESCE($5,notes), updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name, email, phone, address, notes, req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' })
    logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id/points', requireRole('admin', 'manager'), async (req, res) => {
  const { points } = req.body
  try {
    const result = await pool.query(
      'UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points + $1), updated_at=NOW() WHERE id=$2 RETURNING *',
      [points, req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

router.delete('/:id', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const result = await pool.query('UPDATE customers SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) { logger.error(err?.message || 'Server error', { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

export default router
