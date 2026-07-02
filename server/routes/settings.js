import express from 'express'
import { pool } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { logger } from '../logger.js'
import { validate } from '../middleware/validate.js'
import { settingsUpdateSchema } from '../validators.js'

const router = express.Router()

const DEFAULTS = {
  restaurant_name: 'Automatic',
  restaurant_tagline: 'Restaurant OS',
  tax_rate: '11',
  currency_symbol: 'OMR',
  tables_count: '10',
  receipt_footer: 'Thank you for dining with us!',
  low_stock_alert_enabled: 'true',
  loyalty_points_per_omr: '1',
}

async function getAllSettings() {
  const rows = await pool.query('SELECT key, value FROM settings')
  const result = { ...DEFAULTS }
  for (const row of rows.rows) result[row.key] = row.value
  return result
}

router.get('/', async (req, res) => {
  try {
    const settings = await getAllSettings()
    res.json(settings)
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/', requireRole('admin', 'manager'), validate(settingsUpdateSchema), async (req, res) => {
  const allowed = Object.keys(DEFAULTS)
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k))
  if (!updates.length) return res.status(400).json({ error: 'No valid settings provided' })
  try {
    for (const [key, value] of updates) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
        [key, String(value)]
      )
    }
    res.json(await getAllSettings())
  } catch (err) {
    logger.error(err?.message || 'Server error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
