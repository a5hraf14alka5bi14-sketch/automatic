import express from 'express'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { stationCreateSchema, stationUpdateSchema } from '../validators.js'
import { invalidateStationCache, normaliseStationName } from '../lib/stations.js'
import { broadcast } from '../events.js'
import { logger } from '../logger.js'

const router = express.Router()

// GET active stations — the managed list POS/Kitchen/Menu draw from.
// Open to all roles: station names are operational, not sensitive.
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, active FROM stations WHERE active = true ORDER BY id'
    )
    res.json(r.rows)
  } catch (err) {
    logger.error(err?.message, { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// GET all stations (including retired) — management view.
router.get('/all', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, active FROM stations ORDER BY id')
    res.json(r.rows)
  } catch (err) {
    logger.error(err?.message, { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// POST create a station. If a retired station with the same name exists it is
// reactivated instead of erroring — "add grill back" should just work.
router.post('/', requireRole('admin', 'manager'), validate(stationCreateSchema), async (req, res) => {
  const name = normaliseStationName(req.body.name)
  if (!name) return res.status(400).json({ error: 'Station name must contain letters or numbers' })
  try {
    const existing = await pool.query('SELECT id, name, active FROM stations WHERE name=$1', [name])
    if (existing.rows.length) {
      const row = existing.rows[0]
      if (row.active) return res.status(409).json({ error: `Station "${name}" already exists` })
      const r = await pool.query(
        'UPDATE stations SET active=true, updated_at=NOW() WHERE id=$1 RETURNING id, name, active',
        [row.id]
      )
      invalidateStationCache()
      broadcast('stations_updated', { id: r.rows[0].id })
      return res.status(200).json(r.rows[0])
    }
    const r = await pool.query(
      'INSERT INTO stations (name) VALUES ($1) RETURNING id, name, active',
      [name]
    )
    invalidateStationCache()
    broadcast('stations_updated', { id: r.rows[0].id })
    res.status(201).json(r.rows[0])
  } catch (err) {
    if (err?.code === '23505') return res.status(409).json({ error: `Station "${name}" already exists` })
    logger.error(err?.message, { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH rename and/or activate/deactivate. Renaming does NOT rewrite station
// values already stored on historical orders — those stay valid as legacy
// values (the filter validation tolerates them).
router.patch('/:id', requireRole('admin', 'manager'), validate(stationUpdateSchema), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid station id' })
  const updates = []
  const params = []
  if (req.body.name !== undefined) {
    const name = normaliseStationName(req.body.name)
    if (!name) return res.status(400).json({ error: 'Station name must contain letters or numbers' })
    params.push(name)
    updates.push(`name=$${params.length}`)
  }
  if (req.body.active !== undefined) {
    params.push(!!req.body.active)
    updates.push(`active=$${params.length}`)
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' })
  params.push(id)
  try {
    const r = await pool.query(
      `UPDATE stations SET ${updates.join(', ')}, updated_at=NOW() WHERE id=$${params.length} RETURNING id, name, active`,
      params
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
    invalidateStationCache()
    broadcast('stations_updated', { id })
    res.json(r.rows[0])
  } catch (err) {
    if (err?.code === '23505') return res.status(409).json({ error: 'A station with that name already exists' })
    logger.error(err?.message, { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
