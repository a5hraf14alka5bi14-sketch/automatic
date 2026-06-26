import express from 'express'
import { pool } from '../db.js'
import { getGitHubToken, testGitHubConnection, fetchGitHubRepos } from '../integrations/github.js'
import { getOpenAIKey, testOpenAIConnection } from '../integrations/openai.js'
import { getNotionConfig, getNotionClient } from '../notion.js'

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

// ── GET /api/integrations — status of all three ───────────────────────────────

router.get('/', async (req, res) => {
  try {
    const [ghToken, oaiKey, notionCfg] = await Promise.all([
      getGitHubToken(),
      getOpenAIKey(),
      getNotionConfig()
    ])

    // GitHub repo count from DB
    const ghRepos = await pool.query('SELECT COUNT(*) FROM github_repos')
    // Notion project/task counts
    const npCount = await pool.query('SELECT COUNT(*) FROM notion_projects')
    const ntCount = await pool.query('SELECT COUNT(*) FROM notion_tasks')

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
        synced_tasks: parseInt(ntCount.rows[0].count)
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
      const client = await getNotionClient()
      const me = await client.users.me()
      res.json({ success: true, user: me.name || me.id, type: me.type })
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
      'SELECT * FROM github_repos ORDER BY pushed_at DESC NULLS LAST'
    )
    res.json(result.rows)
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
