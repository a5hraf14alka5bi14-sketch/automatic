import express from 'express'
import { pool } from '../db.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menu_items WHERE available = true ORDER BY category, name')
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', async (req, res) => {
  const { name, category, price, description } = req.body
  if (!name || !category || !price) return res.status(400).json({ error: 'name, category, price required' })
  try {
    const result = await pool.query(
      'INSERT INTO menu_items (name, category, price, description) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, category, price, description || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id', async (req, res) => {
  const { name, category, price, description, available } = req.body
  try {
    const result = await pool.query(
      'UPDATE menu_items SET name=COALESCE($1,name), category=COALESCE($2,category), price=COALESCE($3,price), description=COALESCE($4,description), available=COALESCE($5,available) WHERE id=$6 RETURNING *',
      [name, category, price, description, available, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE menu_items SET available = false WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
