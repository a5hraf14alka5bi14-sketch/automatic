/**
 * Public (unauthenticated) routes — safe to expose without a token.
 * Mounted at /api/public in server/index.js BEFORE the verifyToken middleware.
 *
 * Currently exposes:
 *   GET /api/public/menu     — active menu items grouped by category (for QR menu)
 *   GET /api/public/settings — restaurant name + currency (for QR menu header)
 */

import { Router } from 'express'
import { pool }   from '../db.js'

const router = Router()

// ── Public menu ───────────────────────────────────────────────────────────────
// Returns active, non-deleted menu items grouped by category.
// Includes bilingual names so the QR menu page can display both AR and EN.
router.get('/menu', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        m.id,
        m.name,
        m.name_ar,
        m.price,
        m.category,
        m.description,
        m.available,
        m.station,
        -- include modifier groups summary (count only — no pricing detail)
        (
          SELECT COUNT(*)::int
          FROM modifier_groups mg
          WHERE mg.menu_item_id = m.id
        ) AS modifier_group_count
      FROM menu_items m
      WHERE m.deleted_at IS NULL
        AND m.available = true
      ORDER BY m.category, m.name
    `)

    // Group by category
    const grouped = {}
    for (const item of rows) {
      const cat = item.category || 'Other'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push({
        id:          item.id,
        name:        item.name,
        name_ar:     item.name_ar,
        price:       parseFloat(item.price),
        description: item.description,
      })
    }

    // Return as ordered array of { category, items }
    const categories = Object.entries(grouped).map(([category, items]) => ({
      category,
      items,
    }))

    res.json({ categories, total: rows.length })
  } catch (err) {
    next(err)
  }
})

// ── Public settings (name + currency only) ────────────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('restaurant_name','currency_symbol')"
    )
    const out = {}
    for (const r of rows) out[r.key] = r.value
    res.json({
      restaurant_name:  out.restaurant_name  || 'Restaurant',
      currency_symbol:  out.currency_symbol  || 'OMR',
    })
  } catch (err) {
    next(err)
  }
})

export default router
