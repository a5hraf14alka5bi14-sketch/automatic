/**
 * Expense Management API — admin/manager only
 *
 * GET    /api/expenses          — list expenses (date-range + category filter)
 * POST   /api/expenses          — create expense
 * DELETE /api/expenses/:id      — delete expense (admin only)
 */

import express from 'express'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import Joi from 'joi'
import { logger } from '../logger.js'

const router = express.Router()

// All expense routes require at least manager role
router.use(requireRole('admin', 'manager'))

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Utilities',
  'Salaries',
  'Maintenance',
  'Marketing',
  'Cleaning & Supplies',
  'Transport',
  'Other',
]

const createSchema = Joi.object({
  category: Joi.string().valid(...EXPENSE_CATEGORIES).required(),
  vendor:   Joi.string().max(120).allow('', null),
  amount:   Joi.number().min(0.001).max(99999999).required(),
  date:     Joi.string().isoDate().required(),
  notes:    Joi.string().max(1000).allow('', null),
})

// GET /api/expenses
router.get('/', async (req, res, next) => {
  try {
    const { from, to, category } = req.query
    const params = []
    const conds  = []

    if (from) { params.push(from); conds.push(`e.date >= $${params.length}`) }
    if (to)   { params.push(to);   conds.push(`e.date <= $${params.length}`) }
    if (category && EXPENSE_CATEGORIES.includes(category)) {
      params.push(category); conds.push(`e.category = $${params.length}`)
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    const { rows } = await pool.query(
      `SELECT
         e.*,
         u.name AS created_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.created_by
       ${where}
       ORDER BY e.date DESC, e.id DESC
       LIMIT 500`,
      params
    )

    const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0)

    // Breakdown by category
    const byCategory = {}
    for (const r of rows) {
      byCategory[r.category] = (byCategory[r.category] || 0) + parseFloat(r.amount)
    }

    res.json({
      expenses:   rows,
      total:      parseFloat(total.toFixed(3)),
      byCategory,
    })
  } catch (err) { next(err) }
})

// POST /api/expenses
router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const { category, vendor, amount, date, notes } = req.body
    const { rows } = await pool.query(
      `INSERT INTO expenses (category, vendor, amount, date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        category,
        vendor || null,
        parseFloat(amount).toFixed(3),
        date,
        notes || null,
        req.user?.id || null,
      ]
    )
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
})

// DELETE /api/expenses/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM expenses WHERE id=$1 RETURNING id',
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Expense not found' })
    res.json({ deleted: rows[0].id })
  } catch (err) { next(err) }
})

export default router
