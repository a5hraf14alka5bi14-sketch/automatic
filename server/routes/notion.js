import express from 'express'
import { pool } from '../db.js'
import {
  getNotionConfig,
  fetchProjectsFromNotion,
  fetchTasksFromNotion,
  updateTaskStatusInNotion,
  updateProjectStatusInNotion,
  createTaskInNotion,
  createProjectInNotion,
  getNotionClient
} from '../notion.js'

const router = express.Router()

// ─── Config ────────────────────────────────────────────────────────────────

router.get('/config', async (req, res) => {
  try {
    const cfg = await getNotionConfig()
    // Never expose the raw API key — return masked version
    const masked = cfg.apiKey
      ? cfg.apiKey.slice(0, 8) + '•'.repeat(Math.max(0, cfg.apiKey.length - 12)) + cfg.apiKey.slice(-4)
      : ''
    res.json({
      configured: !!cfg.apiKey,
      apiKeyMasked: masked,
      projectsDb: cfg.projectsDb,
      tasksDb: cfg.tasksDb,
      envKeyPresent: !!process.env.NOTION_API_KEY
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/config', async (req, res) => {
  const { apiKey, projectsDb, tasksDb } = req.body
  try {
    const updates = []
    if (apiKey !== undefined && apiKey !== '') {
      updates.push(['notion_api_key', apiKey])
    }
    if (projectsDb) updates.push(['notion_projects_db', projectsDb])
    if (tasksDb) updates.push(['notion_tasks_db', tasksDb])

    for (const [key, value] of updates) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value]
      )
    }
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/config/test', async (req, res) => {
  try {
    const client = await getNotionClient()
    const me = await client.users.me()
    res.json({ success: true, user: me.name || me.id })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ─── Projects ──────────────────────────────────────────────────────────────

router.get('/projects', async (req, res) => {
  try {
    // Return cached projects from DB
    const result = await pool.query(
      'SELECT * FROM notion_projects ORDER BY created_at DESC'
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/projects/sync', async (req, res) => {
  try {
    const projects = await fetchProjectsFromNotion()
    for (const p of projects) {
      await pool.query(
        `INSERT INTO notion_projects (notion_id, notion_url, name, status, status_label, priority, start_date, due_date, total_tasks, last_synced)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (notion_id) DO UPDATE SET
           name=$3, status=$4, status_label=$5, priority=$6, start_date=$7, due_date=$8, total_tasks=$9, last_synced=$10`,
        [p.notion_id, p.notion_url, p.name, p.status, p.status_label, p.priority, p.start_date, p.due_date, p.total_tasks, p.last_synced]
      )
    }
    res.json({ synced: projects.length, projects })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Sync failed' })
  }
})

router.post('/projects', async (req, res) => {
  try {
    const project = await createProjectInNotion(req.body)
    await pool.query(
      `INSERT INTO notion_projects (notion_id, notion_url, name, status, status_label, priority, start_date, due_date, total_tasks, last_synced)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (notion_id) DO UPDATE SET name=$3, status=$4, status_label=$5`,
      [project.notion_id, project.notion_url, project.name, project.status, project.status_label, project.priority, project.start_date, project.due_date, project.total_tasks, project.last_synced]
    )
    const row = await pool.query('SELECT * FROM notion_projects WHERE notion_id=$1', [project.notion_id])
    res.status(201).json(row.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to create project' })
  }
})

router.patch('/projects/:id/status', async (req, res) => {
  const { status } = req.body
  const validStatuses = ['not_started', 'in_progress', 'done']
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' })
  try {
    const row = await pool.query('SELECT notion_id FROM notion_projects WHERE id=$1', [req.params.id])
    if (row.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    await updateProjectStatusInNotion(row.rows[0].notion_id, status)
    const updated = await pool.query(
      "UPDATE notion_projects SET status=$1, status_label=$2, last_synced=NOW() WHERE id=$3 RETURNING *",
      [status, { not_started: 'لم تبدأ', in_progress: 'قيد التنفيذ', done: 'تم' }[status], req.params.id]
    )
    res.json(updated.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Update failed' })
  }
})

// ─── Tasks ─────────────────────────────────────────────────────────────────

router.get('/tasks', async (req, res) => {
  try {
    const { project_id } = req.query
    let query = 'SELECT t.*, p.name as project_name FROM notion_tasks t LEFT JOIN notion_projects p ON p.notion_id = t.project_notion_id'
    const params = []
    if (project_id) {
      const proj = await pool.query('SELECT notion_id FROM notion_projects WHERE id=$1', [project_id])
      if (proj.rows.length > 0) {
        query += ' WHERE t.project_notion_id=$1'
        params.push(proj.rows[0].notion_id)
      }
    }
    query += ' ORDER BY t.created_at DESC'
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/tasks/sync', async (req, res) => {
  try {
    const tasks = await fetchTasksFromNotion()
    for (const t of tasks) {
      await pool.query(
        `INSERT INTO notion_tasks (notion_id, notion_url, name, status, status_label, priority, due_date, project_notion_id, last_synced)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (notion_id) DO UPDATE SET
           name=$3, status=$4, status_label=$5, priority=$6, due_date=$7, project_notion_id=$8, last_synced=$9`,
        [t.notion_id, t.notion_url, t.name, t.status, t.status_label, t.priority, t.due_date, t.project_notion_id, t.last_synced]
      )
    }
    res.json({ synced: tasks.length, tasks })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Sync failed' })
  }
})

router.post('/tasks', async (req, res) => {
  try {
    const task = await createTaskInNotion(req.body)
    await pool.query(
      `INSERT INTO notion_tasks (notion_id, notion_url, name, status, status_label, priority, due_date, project_notion_id, last_synced)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (notion_id) DO UPDATE SET name=$3, status=$4, status_label=$5`,
      [task.notion_id, task.notion_url, task.name, task.status, task.status_label, task.priority, task.due_date, task.project_notion_id, task.last_synced]
    )
    const row = await pool.query('SELECT * FROM notion_tasks WHERE notion_id=$1', [task.notion_id])
    res.status(201).json(row.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to create task' })
  }
})

router.patch('/tasks/:id/status', async (req, res) => {
  const { status } = req.body
  const validStatuses = ['not_started', 'in_progress', 'done']
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' })
  try {
    const row = await pool.query('SELECT notion_id FROM notion_tasks WHERE id=$1', [req.params.id])
    if (row.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    await updateTaskStatusInNotion(row.rows[0].notion_id, status)
    const labelMap = { not_started: 'لم تبدأ', in_progress: 'قيد التنفيذ', done: 'تم' }
    const updated = await pool.query(
      'UPDATE notion_tasks SET status=$1, status_label=$2, last_synced=NOW() WHERE id=$3 RETURNING *',
      [status, labelMap[status], req.params.id]
    )
    res.json(updated.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Update failed' })
  }
})

export default router
