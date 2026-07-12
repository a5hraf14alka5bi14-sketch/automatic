import express from 'express'
import { pool } from '../db.js'
import { logger } from '../logger.js'
import { generateExecutiveInsights, OpenAIError } from '../integrations/openai.js'
import { computeSalesKpis } from '../lib/salesKpis.js'
import { requireRole } from '../middleware/auth.js'

const router = express.Router()

// User-friendly messages per error code — never expose raw API messages to UI
const FRIENDLY = {
  no_key:              'لم يتم تكوين مفتاح OpenAI API بعد. يرجى إضافته من صفحة التكاملات.',
  invalid_key:         'مفتاح OpenAI API غير صحيح أو منتهي الصلاحية. يرجى تحديثه من صفحة التكاملات.',
  quota_exceeded:      'تم استنفاد حصة OpenAI API. يرجى التحقق من حساب OpenAI الخاص بك وشحن الرصيد.',
  rate_limit:          'تم تجاوز حد الطلبات المسموح به. يرجى المحاولة مرة أخرى بعد قليل.',
  service_unavailable: 'خدمة الذكاء الاصطناعي غير متاحة مؤقتاً. يرجى المحاولة لاحقاً.',
}

function getFriendlyError(err) {
  if (err instanceof OpenAIError) {
    return {
      code:    err.code,
      message: FRIENDLY[err.code] || FRIENDLY.service_unavailable,
      status:  err.status,
    }
  }
  // Unknown error — log detail, return generic message
  return {
    code:    'service_unavailable',
    message: FRIENDLY.service_unavailable,
    status:  500,
  }
}

// Authoritative sales KPIs computed straight from the DB for the given period.
// The browser must not be trusted to supply revenue/profit numbers to the AI,
// so we recompute the financial figures server-side (client-supplied forecast
// and menu-matrix analytics are kept only as supplementary context).
// Shared with the daily summary route — see server/lib/salesKpis.js.

// POST /api/ai/insights — generate and cache executive insights
router.post('/insights', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { period = 'month', forecastStats = {}, matrixSummary = {} } = req.body
    // Financial KPIs are authoritative (DB), overriding anything the client sent.
    const kpis = await computeSalesKpis(period)
    const insights = await generateExecutiveInsights({ ...forecastStats, ...matrixSummary, ...kpis })

    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('last_executive_insights', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [JSON.stringify({ ...insights, generatedAt: new Date().toISOString() })]
    )

    res.json(insights)
  } catch (err) {
    const friendly = getFriendlyError(err)
    // Always log the real error server-side
    logger.error('[ai/insights] generation failed', {
      path: req.path,
      code: friendly.code,
      detail: err?.message,
    })
    res.status(friendly.status).json({
      error:   friendly.message,
      code:    friendly.code,
      ai_unavailable: true,
    })
  }
})

// GET /api/ai/insights — return last cached insights (never fails due to AI)
router.get('/insights', async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'last_executive_insights'")
    if (!r.rows[0]?.value) return res.json(null)
    res.json(JSON.parse(r.rows[0].value))
  } catch (err) {
    // DB error — log and return null so the frontend shows empty state, not error
    logger.error('[ai/insights] cache read failed', { path: req.path, err: err?.message })
    res.json(null)
  }
})

export default router
