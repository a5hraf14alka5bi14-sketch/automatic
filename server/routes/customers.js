import express from 'express'
import { pool } from '../db.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY name')
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', async (req, res) => {
  const { name, email, phone } = req.body
  if (!name) return res.status(400).json({ error: 'Name required' })
  try {
    const result = await pool.query(
      'INSERT INTO customers (name, email, phone) VALUES ($1,$2,$3) RETURNING *',
      [name, email || null, phone || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' })
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id/points', async (req, res) => {
  const { points } = req.body
  try {
    const result = await pool.query(
      'UPDATE customers SET loyalty_points = loyalty_points + $1 WHERE id = $2 RETURNING *',
      [points, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
