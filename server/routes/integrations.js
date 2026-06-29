import express from 'express'
import { pool } from '../db.js'
import { getGitHubToken, testGitHubConnection, fetchGitHubRepos } from '../integrations/github.js'
import { getOpenAIKey, testOpenAIConnection } from '../integrations/openai.js'
import { getNotionConfig, getNotionClient } from '../notion.js'
import {
  testNotionConnection,
  syncAll,
  syncProjectsFromNotion,
  syncTasksFromNotion
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

    const [ghRepos, npCount, ntCount, lastNotionSync] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM github_repos'),
      pool.query('SELECT COUNT(*) FROM notion_projects'),
      pool.query('SELECT COUNT(*) FROM notion_tasks'),
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
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ── PUT /api/integrations/:service/config ────────────────────────────────────

router.put('/:service/config', async (req, res) => {
  const { service } = req.params
  try {
    if (service === 'github') {
      const { token } = req.body
      if (token?.trim()) await setSetting('github_token', token.trim())
    } else if (service === 'notion') {
      const { apiKey, projectsDb, tasksDb } = req.body
      if (apiKey?.trim()) await setSetting('notion_api_key', apiKey.trim())
      if (projectsDb?.trim()) await setSetting('notion_projects_db', projectsDb.trim())
      if (tasksDb?.trim()) await setSetting('notion_tasks_db', tasksDb.trim())
    } else if (service === 'openai') {
      const { apiKey } = req.body
      if (apiKey?.trim()) await setSetting('openai_api_key', apiKey.trim())
    } else {
      return res.status(404).json({ error: 'Unknown service' })
    }
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/integrations/:service/test ─────────────────────────────────────

router.post('/:service/test', async (req, res) => {
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
    res.status(400).json({ success: false, error: err.message })
  }
})

// ── POST /api/integrations/notion/sync — pull all from Notion ────────────────

router.post('/notion/sync', async (req, res) => {
  try {
    const { type } = req.body
    let result
    if (type === 'projects') {
      const r = await syncProjectsFromNotion()
      result = { projects: r }
    } else if (type === 'tasks') {
      const r = await syncTasksFromNotion()
      result = { tasks: r }
    } else {
      result = await syncAll()
    }

    const totalSynced = (result.projects?.synced || 0) + (result.tasks?.synced || 0)
    const totalItems = (result.projects?.total || 0) + (result.tasks?.total || 0)

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
    console.error('[notion/sync]', err)
    res.status(500).json({ success: false, error: err.message })
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
    res.status(500).json({ error: err.message })
  }
})

// ── PUT /api/integrations/notion/auto-sync ───────────────────────────────────

router.put('/notion/auto-sync', async (req, res) => {
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
    res.status(500).json({ error: err.message })
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
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/integrations/github/sync ───────────────────────────────────────

router.post('/github/sync', async (req, res) => {
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
    console.error(err)
    res.status(500).json({ error: err.message })
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
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/integrations/github/link-notion — link repo to project ─────────

router.post('/github/link-notion', async (req, res) => {
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
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/integrations/openai/chat ───────────────────────────────────────

router.post('/openai/chat', async (req, res) => {
  const { messages, model } = req.body
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })
  try {
    const { openAIChat } = await import('../integrations/openai.js')
    const result = await openAIChat(messages, model)
    res.json({ success: true, reply: result.choices[0]?.message?.content, usage: result.usage })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
