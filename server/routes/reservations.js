/**
 * Reservations + Waitlist API
 * Mounted at /api/reservations and /api/waitlist
 * RBAC: cashier / manager / admin (not kitchen / staff)
 */

import { Router } from 'express'
import { pool }   from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { broadcast }   from '../events.js'
import { logger }      from '../logger.js'

const router = Router()

const canManage = requireRole('admin', 'manager', 'cashier')

/* ══════════════════════════════════════════════════════════════════════════
   RESERVATIONS
   ══════════════════════════════════════════════════════════════════════════ */

// GET /api/reservations?date=YYYY-MM-DD  — list for a given date (today default)
router.get('/', canManage, async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const { rows } = await pool.query(
      `SELECT r.*, u.name AS created_by_name
       FROM reservations r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.reservation_date = $1
       ORDER BY r.reservation_time ASC, r.id ASC`,
      [date]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// GET /api/reservations/upcoming  — next 48 h summary (for dashboard widgets)
router.get('/upcoming', canManage, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, customer_name, party_size, reservation_date, reservation_time,
              table_number, status, phone
       FROM reservations
       WHERE reservation_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day'
         AND status IN ('pending','confirmed')
       ORDER BY reservation_date, reservation_time
       LIMIT 20`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// POST /api/reservations  — create
router.post('/', canManage, async (req, res, next) => {
  try {
    const {
      customer_name, phone, party_size = 2,
      reservation_date, reservation_time,
      table_number = null, notes = null,
    } = req.body

    if (!customer_name?.trim()) return res.status(400).json({ error: 'Customer name is required' })
    if (!reservation_date)      return res.status(400).json({ error: 'Date is required' })
    if (!reservation_time)      return res.status(400).json({ error: 'Time is required' })
    if (party_size < 1)         return res.status(400).json({ error: 'Party size must be at least 1' })

    const { rows } = await pool.query(
      `INSERT INTO reservations
         (customer_name, phone, party_size, reservation_date, reservation_time,
          table_number, status, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8)
       RETURNING *`,
      [
        customer_name.trim(), phone?.trim() || null, party_size,
        reservation_date, reservation_time,
        table_number || null, notes?.trim() || null,
        req.user?.id || null,
      ]
    )
    broadcast('reservation_created', { id: rows[0].id, date: reservation_date })
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
})

// PATCH /api/reservations/:id  — update status, table_number, or fields
router.patch('/:id', canManage, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!id) return res.status(400).json({ error: 'Invalid ID' })

    const allowed = ['status','table_number','notes','reservation_date','reservation_time',
                     'customer_name','phone','party_size']
    const sets    = []
    const vals    = []

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${vals.length + 1}`)
        vals.push(req.body[key] === '' ? null : req.body[key])
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' })

    sets.push('updated_at = NOW()')
    vals.push(id)

    const { rows } = await pool.query(
      `UPDATE reservations SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
    )
    if (!rows.length) return res.status(404).json({ error: 'Reservation not found' })

    broadcast('reservation_updated', { id: rows[0].id, status: rows[0].status })
    res.json(rows[0])
  } catch (err) { next(err) }
})

// DELETE /api/reservations/:id  — hard delete (reservations aren't financial records)
router.delete('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    const { rowCount } = await pool.query('DELETE FROM reservations WHERE id=$1', [id])
    if (!rowCount) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})


/* ══════════════════════════════════════════════════════════════════════════
   WAITLIST
   ══════════════════════════════════════════════════════════════════════════ */

// GET /api/waitlist  — active waiting parties
router.get('/waitlist', canManage, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT w.*, u.name AS created_by_name
       FROM waitlist w
       LEFT JOIN users u ON u.id = w.created_by
       WHERE w.status = 'waiting'
       ORDER BY w.joined_at ASC`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// POST /api/waitlist  — add walk-in party
router.post('/waitlist', canManage, async (req, res, next) => {
  try {
    const { customer_name, phone, party_size = 2, quoted_wait = null, notes = null } = req.body
    if (!customer_name?.trim()) return res.status(400).json({ error: 'Customer name is required' })

    const { rows } = await pool.query(
      `INSERT INTO waitlist (customer_name, phone, party_size, quoted_wait, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        customer_name.trim(), phone?.trim() || null, party_size,
        quoted_wait || null, notes?.trim() || null,
        req.user?.id || null,
      ]
    )
    broadcast('waitlist_updated', { action: 'added', id: rows[0].id })
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
})

// PATCH /api/waitlist/:id  — seat or remove
router.patch('/waitlist/:id', canManage, async (req, res, next) => {
  try {
    const id     = parseInt(req.params.id, 10)
    const status = req.body.status
    if (!['seated','removed','waiting'].includes(status)) {
      return res.status(400).json({ error: 'status must be seated, removed, or waiting' })
    }

    const { rows } = await pool.query(
      `UPDATE waitlist
          SET status    = $1,
              seated_at = CASE WHEN $1='seated' THEN NOW() ELSE NULL END
        WHERE id = $2
        RETURNING *`,
      [status, id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })

    broadcast('waitlist_updated', { action: status, id })
    res.json(rows[0])
  } catch (err) { next(err) }
})

// DELETE /api/waitlist/:id  — hard delete
router.delete('/waitlist/:id', canManage, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    const { rowCount } = await pool.query('DELETE FROM waitlist WHERE id=$1', [id])
    if (!rowCount) return res.status(404).json({ error: 'Not found' })
    broadcast('waitlist_updated', { action: 'removed', id })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
