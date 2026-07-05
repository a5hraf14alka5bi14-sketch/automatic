import express from 'express'
import rateLimit from 'express-rate-limit'
import { pool } from '../db.js'
import { logger } from '../logger.js'
import { requireRole } from '../middleware/auth.js'
import { encryptSecret } from '../config/crypto.js'
import { getGitHubToken, testGitHubConnection, fetchGitHubRepos } from '../integrations/github.js'
import { getOpenAIKey, testOpenAIConnection } from '../integrations/openai.js'
import { getNotionConfig, getNotionClient } from '../notion.js'
import {
  testNotionConnection,
  syncAll,
  syncProjectsFromNotion,
  syncTasksFromNotion,
  syncMenuFromNotion,
  syncInventoryFromNotion,
  syncCustomersFromNotion,
  syncRecipeIngredientsFromNotion,
  syncSalesFromNotion,
  syncFinanceFromNotion,
  syncStaffFromNotion,
  pushMenuToNotion,
  pushInventoryToNotion,
  pushCustomersToNotion,
  pushRecipeIngredientsToNotion,
  pushSalesToNotion,
  pushFinanceToNotion,
  pushStaffToNotion,
  pushMenuUpdatesToNotion,
  pushInventoryUpdatesToNotion
} from '../integrations/notion.js'
import {
  runSync,
  startAutoSync,
  stopAutoSync,
  getSyncEngineStatus,
  getRecentLogs,
  getLastSyncTime
} from '../integrations/sync-engine.js'

const router = express.Router()

// The whole integrations hub (config, sync, status, AI) is management-only —
// backend authority for the frontend route guard on /integrations.
router.use(requireRole('admin', 'manager'))

// ── Per-user cooldown for costly third-party actions ──────────────────────────
// Each of these endpoints fires real Notion / GitHub / OpenAI API calls, so even
// an authorized manager/admin hammering them can drain external quotas or drive
// up spend (a denial-of-service risk flagged in the threat model). This limiter
// is keyed by user id (verifyToken + requireRole run first, so req.user is
// always present) and rejects excess requests with a 429 *before* the handler
// runs — meaning no external call is made on the rate-limited path.
const costlyIntegrationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true, // exposes RateLimit-* + Retry-After hints
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id ?? 'anon'),
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit?.resetTime?.getTime() - Date.now()) / 1000) || 60
    res.status(429).json({
      error: 'Too many integration actions. Please wait before retrying.',
      retry_after_seconds: retryAfter > 0 ? retryAfter : 60,
    })
  },
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function maskSecret(val) {
  if (!val) return ''
  if (val.length <= 12) return '•'.repeat(val.length)
  return val.slice(0, 6) + '•'.repeat(Math.max(0, val.length - 10)) + val.slice(-4)
}

async function getSetting(key) {
  const r = await pool.query('SELECT value FROM settings WHERE key=$1', [key])
  return r.rows[0]?.value || null
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, value]
  )
}

// ── GET /api/integrations — status of all services ───────────────────────────

router.get('/', async (req, res) => {
  try {
    const [ghToken, oaiKey, notionCfg] = await Promise.all([
      getGitHubToken(),
      getOpenAIKey(),
      getNotionConfig()
    ])

    const [ghRepos, npCount, ntCount, menuCount, invCount, custCount, lastNotionSync] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM github_repos'),
      pool.query('SELECT COUNT(*) FROM notion_projects'),
      pool.query('SELECT COUNT(*) FROM notion_tasks'),
      pool.query('SELECT COUNT(*) FROM menu_items WHERE notion_id IS NOT NULL'),
      pool.query('SELECT COUNT(*) FROM inventory WHERE notion_id IS NOT NULL'),
      pool.query('SELECT COUNT(*) FROM customers WHERE notion_id IS NOT NULL'),
      getLastSyncTime('notion')
    ])

    const engineStatus = getSyncEngineStatus()

    res.json({
      github: {
        configured: !!ghToken,
        masked: maskSecret(ghToken),
        env_present: !!process.env.GITHUB_TOKEN,
        synced_repos: parseInt(ghRepos.rows[0].count)
      },
      notion: {
        configured: notionCfg.configured || !!notionCfg.apiKey,
        masked: maskSecret(notionCfg.apiKey),
        env_present: !!process.env.NOTION_API_KEY,
        projects_db: notionCfg.projectsDb,
        tasks_db: notionCfg.tasksDb,
        synced_projects: parseInt(npCount.rows[0].count),
        synced_tasks: parseInt(ntCount.rows[0].count),
        synced_menu: parseInt(menuCount.rows[0].count),
        synced_inventory: parseInt(invCount.rows[0].count),
        synced_customers: parseInt(custCount.rows[0].count),
        last_sync: lastNotionSync,
        auto_sync: engineStatus
      },
      openai: {
        configured: !!oaiKey,
        masked: maskSecret(oaiKey),
        env_present: !!process.env.OPENAI_API_KEY
      }
    })
  } catch (err) {
    logger.error('[integrations/status]', { err: err?.message, path: req.path })
    res.status(500).json({ error: 'Failed to retrieve integration status' })
  }
})

// ── PUT /api/integrations/:service/config ────────────────────────────────────

router.put('/:service/config', requireRole('admin', 'manager'), async (req, res) => {
  const { service } = req.params
  try {
    if (service === 'github') {
      const { token } = req.body
      if (token?.trim()) await setSetting('github_token', encryptSecret(token.trim()))
    } else if (service === 'notion') {
      const { apiKey, projectsDb, tasksDb } = req.body
      if (apiKey?.trim()) await setSetting('notion_api_key', encryptSecret(apiKey.trim()))
      if (projectsDb?.trim()) await setSetting('notion_projects_db', projectsDb.trim())
      if (tasksDb?.trim()) await setSetting('notion_tasks_db', tasksDb.trim())
    } else if (service === 'openai') {
      const { apiKey } = req.body
      if (apiKey?.trim()) await setSetting('openai_api_key', encryptSecret(apiKey.trim()))
    } else {
      return res.status(404).json({ error: 'Unknown service' })
    }
    res.json({ success: true })
  } catch (err) {
    logger.error('[integrations/config]', { err: err?.message, path: req.path })
    res.status(500).json({ error: 'Failed to save configuration' })
  }
})

// ── POST /api/integrations/:service/test ─────────────────────────────────────

router.post('/:service/test', requireRole('admin', 'manager'), async (req, res) => {
  const { service } = req.params
  try {
    if (service === 'github') {
      const result = await testGitHubConnection()
      res.json({ success: true, ...result })
    } else if (service === 'notion') {
      const result = await testNotionConnection()
      res.json({ success: true, ...result })
    } else if (service === 'openai') {
      const result = await testOpenAIConnection()
      res.json({ success: true, ...result })
    } else {
      res.status(404).json({ error: 'Unknown service' })
    }
  } catch (err) {
    logger.error('[integrations/test]', { err: err?.message, path: req.path })
    res.status(400).json({ success: false, error: err.message || 'Connection test failed' })
  }
})

// ── POST /api/integrations/notion/sync — pull all from Notion ────────────────

router.post('/notion/sync', costlyIntegrationLimiter, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { type } = req.body
    let result
    if (type === 'projects') {
      const r = await syncProjectsFromNotion()
      result = { projects: r }
    } else if (type === 'tasks') {
      const r = await syncTasksFromNotion()
      result = { tasks: r }
    } else if (type === 'menu') {
      const r = await syncMenuFromNotion()
      result = { menu: r }
    } else if (type === 'inventory') {
      const r = await syncInventoryFromNotion()
      result = { inventory: r }
    } else if (type === 'customers') {
      const r = await syncCustomersFromNotion()
      result = { customers: r }
    } else if (type === 'recipe_ingredients') {
      const r = await syncRecipeIngredientsFromNotion()
      result = { recipe_ingredients: r }
    } else if (type === 'sales') {
      const r = await syncSalesFromNotion()
      result = { sales: r }
    } else if (type === 'finance') {
      const r = await syncFinanceFromNotion()
      result = { finance: r }
    } else if (type === 'staff') {
      const r = await syncStaffFromNotion()
      result = { staff: r }
    } else {
      result = await syncAll()
    }

    const ALL_SYNC_KEYS = ['projects','tasks','menu','inventory','customers','recipe_ingredients','sales','finance','staff']
    const totalSynced = ALL_SYNC_KEYS.reduce((s, k) => s + (result[k]?.synced || 0), 0)
    const totalItems = ALL_SYNC_KEYS
      .reduce((s, k) => s + (result[k]?.total || 0), 0)

    await pool.query(
      `INSERT INTO sync_log (service, direction, status, items_synced, items_total)
       VALUES ('notion', 'pull', 'success', $1, $2)`,
      [totalSynced, totalItems]
    )

    res.json({ success: true, ...result })
  } catch (err) {
    await pool.query(
      `INSERT INTO sync_log (service, direction, status, error_message)
       VALUES ('notion', 'pull', 'error', $1)`,
      [err.message]
    ).catch(() => {})
    logger.error('[notion/sync]', { err: err?.message, path: req.path })
    res.status(500).json({ success: false, error: 'Sync failed. Check server logs for details.' })
  }
})

// ── GET /api/integrations/notion/sync/status ─────────────────────────────────

router.get('/notion/sync/status', async (req, res) => {
  try {
    const [logs, lastSuccess, engineStatus] = await Promise.all([
      getRecentLogs('notion', 15),
      getLastSyncTime('notion'),
      Promise.resolve(getSyncEngineStatus())
    ])
    res.json({ logs, last_success: lastSuccess, engine: engineStatus })
  } catch (err) {
    logger.error('[integrations/sync-status]', { err: err?.message, path: req.path })
    res.status(500).json({ error: 'Failed to retrieve sync status' })
  }
})

// ── PUT /api/integrations/notion/auto-sync ───────────────────────────────────

router.put('/notion/auto-sync', requireRole('admin', 'manager'), async (req, res) => {
  const { enabled, interval_minutes } = req.body
  try {
    const mins = Math.max(5, Math.min(1440, parseInt(interval_minutes) || 15))

    if (enabled) {
      startAutoSync('notion', mins * 60 * 1000)
      await setSetting('notion_auto_sync_enabled', 'true')
      await setSetting('notion_auto_sync_interval', String(mins))
    } else {
      stopAutoSync()
      await setSetting('notion_auto_sync_enabled', 'false')
    }

    res.json({ success: true, ...getSyncEngineStatus() })
  } catch (err) {
    logger.error('[integrations/auto-sync]', { err: err?.message, path: req.path })
    res.status(500).json({ error: 'Failed to update auto-sync settings' })
  }
})

// ── GET /api/integrations/notion/auto-sync ───────────────────────────────────

router.get('/notion/auto-sync', async (req, res) => {
  try {
    const [enabled, interval] = await Promise.all([
      getSetting('notion_auto_sync_enabled'),
      getSetting('notion_auto_sync_interval')
    ])
    res.json({
      enabled: enabled === 'true',
      interval_minutes: parseInt(interval) || 15,
      ...getSyncEngineStatus()
    })
  } catch (err) {
    logger.error('[integrations/auto-sync-get]', { err: err?.message, path: req.path })
    res.status(500).json({ error: 'Failed to retrieve auto-sync settings' })
  }
})

// ── POST /api/integrations/github/sync ───────────────────────────────────────

router.post('/github/sync', costlyIntegrationLimiter, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const repos = await fetchGitHubRepos()
    let synced = 0
    for (const r of repos) {
      await pool.query(
        `INSERT INTO github_repos
           (github_id, name, full_name, description, language, html_url, stars, forks,
            open_issues, is_private, is_fork, default_branch, pushed_at, last_synced)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (github_id) DO UPDATE SET
           name=$2, full_name=$3, description=$4, language=$5, html_url=$6,
           stars=$7, forks=$8, open_issues=$9, is_private=$10, is_fork=$11,
           default_branch=$12, pushed_at=$13, last_synced=$14`,
        [r.github_id, r.name, r.full_name, r.description, r.language,
         r.html_url, r.stars, r.forks, r.open_issues, r.is_private,
         r.is_fork, r.default_branch, r.pushed_at, r.last_synced]
      )
      synced++
    }
    res.json({ synced, repos })
  } catch (err) {
    logger.error('[integrations/github-sync]', { err: err?.message, path: req.path })
    res.status(500).json({ error: 'GitHub sync failed. Check server logs for details.' })
  }
})

// ── GET /api/integrations/github/repos ───────────────────────────────────────

router.get('/github/repos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gr.*, ngl.notion_project_id,
              np.name as linked_project_name, np.notion_url as linked_project_url
       FROM github_repos gr
       LEFT JOIN notion_github_links ngl ON ngl.github_repo_id = gr.id
       LEFT JOIN notion_projects np ON np.id = ngl.notion_project_id
       ORDER BY gr.pushed_at DESC NULLS LAST`
    )
    res.json(result.rows)
  } catch (err) {
    logger.error('[integrations/github-repos]', { err: err?.message, path: req.path })
    res.status(500).json({ error: 'Failed to retrieve GitHub repos' })
  }
})

// ── POST /api/integrations/github/link-notion — link repo to project ─────────

router.post('/github/link-notion', requireRole('admin', 'manager'), async (req, res) => {
  const { github_repo_id, notion_project_id } = req.body
  if (!github_repo_id) return res.status(400).json({ error: 'github_repo_id required' })
  try {
    if (notion_project_id === null) {
      await pool.query('DELETE FROM notion_github_links WHERE github_repo_id=$1', [github_repo_id])
      return res.json({ success: true, unlinked: true })
    }
    await pool.query(
      `INSERT INTO notion_github_links (github_repo_id, notion_project_id)
       VALUES ($1, $2)
       ON CONFLICT (github_repo_id, notion_project_id) DO NOTHING`,
      [github_repo_id, notion_project_id]
    )
    res.json({ success: true })
  } catch (err) {
    logger.error('[integrations/github-link]', { err: err?.message, path: req.path })
    res.status(500).json({ error: 'Failed to link repo to project' })
  }
})

// ── POST /api/integrations/notion/push — push PG records without notion_id ──

router.post('/notion/push', costlyIntegrationLimiter, requireRole('admin', 'manager'), async (req, res) => {
  const { type } = req.body
  try {
    let result
    if (type === 'menu') {
      result = await pushMenuToNotion()
    } else if (type === 'menu_updates') {
      result = await pushMenuUpdatesToNotion()
    } else if (type === 'inventory') {
      result = await pushInventoryToNotion()
    } else if (type === 'inventory_updates') {
      result = await pushInventoryUpdatesToNotion()
    } else if (type === 'customers') {
      result = await pushCustomersToNotion()
    } else if (type === 'recipe_ingredients') {
      result = await pushRecipeIngredientsToNotion()
    } else if (type === 'sales') {
      result = await pushSalesToNotion()
    } else if (type === 'finance') {
      result = await pushFinanceToNotion()
    } else if (type === 'staff') {
      result = await pushStaffToNotion()
    } else {
      const [menu, inventory, customers, recipe_ingredients, sales] = await Promise.all([
        pushMenuToNotion(),
        pushInventoryToNotion(),
        pushCustomersToNotion(),
        pushRecipeIngredientsToNotion(),
        pushSalesToNotion()
      ])
      result = { menu, inventory, customers, recipe_ingredients, sales }
    }
    res.json({ success: true, ...result })
  } catch (err) {
    logger.error('[notion/push]', { err: err?.message, path: req.path })
    res.status(500).json({ success: false, error: 'Push to Notion failed. Check server logs for details.' })
  }
})

// ── GET  /api/integrations/openai/summary — return stored summary ─────────────
router.get('/openai/summary', async (req, res) => {
  try {
    const summary = await getSetting('last_ai_summary')
    const generatedAt = await getSetting('last_ai_summary_at')
    res.json({ summary: summary || null, generated_at: generatedAt || null })
  } catch (err) {
    logger.error('[integrations/openai-summary-get]', { err: err?.message, path: req.path })
    res.status(500).json({ error: 'Failed to retrieve summary' })
  }
})

// ── POST /api/integrations/openai/summary — generate & store daily summary ───
router.post('/openai/summary', costlyIntegrationLimiter, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { generateDailySummary } = await import('../integrations/openai.js')
    // Build KPI snapshot directly from DB — avoids fragile internal HTTP fetch
    const [revenueRes, topItemsRes, lowStockRes] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(total),0)   AS revenue,
          COUNT(*)::int            AS total_orders,
          COALESCE(AVG(total),0)   AS avg_order_value,
          COUNT(DISTINCT customer_id) FILTER (WHERE customer_id IS NOT NULL)::int AS customers_served
        FROM orders
        WHERE DATE(created_at) = CURRENT_DATE AND status != 'cancelled'
      `),
      pool.query(`
        SELECT oi.name, SUM(oi.quantity)::int AS qty
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE DATE(o.created_at) = CURRENT_DATE AND o.status != 'cancelled'
        GROUP BY oi.name ORDER BY qty DESC LIMIT 5
      `),
      pool.query(`
        SELECT name FROM inventory
        WHERE quantity <= min_quantity AND deleted_at IS NULL
        ORDER BY (min_quantity - quantity) DESC LIMIT 10
      `),
    ])
    const r = revenueRes.rows[0]
    const kpis = {
      revenue:         parseFloat(r.revenue),
      totalOrders:     r.total_orders,
      avgOrderValue:   parseFloat(parseFloat(r.avg_order_value).toFixed(3)),
      customersServed: r.customers_served,
      topItems:        topItemsRes.rows,
      lowStock:        lowStockRes.rows,
    }
    const summary = await generateDailySummary(kpis)
    const now = new Date().toISOString()
    await setSetting('last_ai_summary', summary)
    await setSetting('last_ai_summary_at', now)
    res.json({ success: true, summary, generated_at: now })
  } catch (err) {
    logger.error('[integrations/openai-summary]', { err: err?.message, path: req.path })
    res.status(500).json({ error: err.message || 'Summary generation failed' })
  }
})

// ── POST /api/integrations/openai/chat ───────────────────────────────────────

router.post('/openai/chat', costlyIntegrationLimiter, requireRole('admin', 'manager'), async (req, res) => {
  const { messages, model } = req.body
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })
  try {
    const { openAIChat } = await import('../integrations/openai.js')
    const result = await openAIChat(messages, model)
    res.json({ success: true, reply: result.choices[0]?.message?.content, usage: result.usage })
  } catch (err) {
    logger.error('[integrations/openai-chat]', { err: err?.message, path: req.path })
    res.status(500).json({ error: 'AI request failed. Check server logs for details.' })
  }
})

export default router
