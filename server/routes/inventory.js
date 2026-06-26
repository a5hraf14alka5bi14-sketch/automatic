import express from 'express'
import { pool } from '../db.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM inventory ORDER BY category, name')
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', async (req, res) => {
  const { name, category, quantity, unit, min_quantity, cost } = req.body
  if (!name || quantity === undefined) return res.status(400).json({ error: 'name and quantity required' })
  try {
    const result = await pool.query(
      'INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, category || 'general', quantity, unit || 'pcs', min_quantity || 0, cost || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id', async (req, res) => {
  const { quantity } = req.body
  try {
    const result = await pool.query(
      'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [quantity, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
