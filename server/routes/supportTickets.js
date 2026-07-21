/**
 * Support Tickets API
 *
 * POST   /api/support          — any authenticated user submits a ticket
 * GET    /api/support          — admin/manager: list all tickets (filter by status)
 * PATCH  /api/support/:id      — admin/manager: update ticket status
 */

import express from 'express'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import Joi from 'joi'
import { logger } from '../logger.js'

const router = express.Router()

const createSchema = Joi.object({
  topic:   Joi.string().max(100).required(),
  name:    Joi.string().max(120).required(),
  phone:   Joi.string().max(40).allow('', null),
  details: Joi.string().min(5).max(2000).required(),
})

const updateSchema = Joi.object({
  status: Joi.string().valid('open', 'in_progress', 'resolved').required(),
})

// POST /api/support — any authenticated staff member
router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const { topic, name, phone, details } = req.body
    const { rows } = await pool.query(
      `INSERT INTO support_tickets
         (user_id, user_name, user_email, topic, name, phone, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, topic, status, created_at`,
      [
        req.user?.id    || null,
        req.user?.name  || null,
        req.user?.email || null,
        topic, name, phone || null, details,
      ]
    )
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
})

// GET /api/support — admin/manager only
router.get('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { status } = req.query
    const VALID = ['open', 'in_progress', 'resolved']
    const params = []
    let where = ''
    if (status && VALID.includes(status)) {
      params.push(status)
      where = `WHERE t.status = $${params.length}`
    }
    const { rows } = await pool.query(
      `SELECT
         t.*,
         u.name AS submitted_by_name
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       ${where}
       ORDER BY
         CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
         t.created_at DESC
       LIMIT 500`,
      params
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// PATCH /api/support/:id — admin/manager only
router.patch('/:id', requireRole('admin', 'manager'), validate(updateSchema), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE support_tickets
          SET status=$1, updated_at=NOW()
        WHERE id=$2
        RETURNING *`,
      [req.body.status, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Ticket not found' })
    res.json(rows[0])
  } catch (err) { next(err) }
})

export default router
