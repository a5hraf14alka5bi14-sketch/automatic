import express from 'express'
import { pool } from '../db.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const { search } = req.query
    let query = 'SELECT * FROM customers'
    const params = []
    if (search) {
      query += ` WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1`
      params.push(`%${search}%`)
    }
    query += ' ORDER BY name'
    res.json((await pool.query(query, params)).rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers WHERE id=$1', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.post('/', async (req, res) => {
  const { name, email, phone, address, notes } = req.body
  if (!name) return res.status(400).json({ error: 'Name required' })
  try {
    const result = await pool.query(
      'INSERT INTO customers (name, email, phone, address, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, email || null, phone || null, address || null, notes || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' })
    console.error(err); res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id', async (req, res) => {
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
    console.error(err); res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id/points', async (req, res) => {
  const { points } = req.body
  try {
    const result = await pool.query(
      'UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points + $1), updated_at=NOW() WHERE id=$2 RETURNING *',
      [points, req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM customers WHERE id=$1 RETURNING id', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

export default router
