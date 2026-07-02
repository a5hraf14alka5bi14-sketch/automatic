import express from 'express'
import { pool } from '../db.js'
import { logger } from '../logger.js'
import { generateExecutiveInsights } from '../integrations/openai.js'
import { requireRole } from '../middleware/auth.js'

const router = express.Router()

router.post('/insights', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { kpis = {}, forecastStats = {}, matrixSummary = {} } = req.body
    const insights = await generateExecutiveInsights({ ...kpis, ...forecastStats, ...matrixSummary })

    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('last_executive_insights', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [JSON.stringify({ ...insights, generatedAt: new Date().toISOString() })]
    )

    res.json(insights)
  } catch (err) {
    logger.error(err?.message || 'AI insights error', { path: req.path })
    res.status(500).json({ error: err.message || 'Failed to generate insights' })
  }
})

router.get('/insights', async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'last_executive_insights'")
    if (!r.rows[0]?.value) return res.json(null)
    res.json(JSON.parse(r.rows[0].value))
  } catch (err) {
    logger.error(err?.message || 'AI insights fetch error', { path: req.path })
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
