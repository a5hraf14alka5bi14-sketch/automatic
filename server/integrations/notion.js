/**
 * Notion integration module — uses REST API directly (v1) to bypass
 * @notionhq/client SDK limitation where databases.query is unavailable.
 * Reads:  fetch → api.notion.com/v1/databases/{id}/query
 * Writes: SDK pages.create / pages.update (still works fine)
 */
import { pool } from '../db.js'
import { getNotionConfig } from '../notion.js'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

// ── Auth token ────────────────────────────────────────────────────────────────

export async function getNotionToken() {
  const cfg = await getNotionConfig()
  return cfg.apiKey || ''
}

// ── Raw REST fetch ────────────────────────────────────────────────────────────

export async function notionFetch(path, method = 'GET', body = null) {
  const token = await getNotionToken()
  if (!token) throw new Error('Notion API key not configured')

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION
    }
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(`${NOTION_API}${path}`, opts)
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || `Notion API error ${res.status}`)
  return data
}

// ── Query a full database (handles pagination) ─────────────────────────────

export async function queryDatabase(dbId, filter = null, sorts = []) {
  const pages = []
  let cursor = null

  do {
    const body = { page_size: 100 }
    if (filter) body.filter = filter
    if (sorts.length) body.sorts = sorts
    if (cursor) body.start_cursor = cursor

    const data = await notionFetch(`/databases/${dbId}/query`, 'POST', body)
    pages.push(...(data.results || []))
    cursor = data.has_more ? data.next_cursor : null
  } while (cursor)

  return pages
}

// ── Test connection ───────────────────────────────────────────────────────────

export async function testNotionConnection() {
  const data = await notionFetch('/users/me')
  return { user: data.name || data.id, type: data.type }
}

// ── Page → local schema mappers ───────────────────────────────────────────────

function getTitle(prop) {
  if (!prop) return ''
  const items = prop.title || prop.rich_text || []
  return items.map(t => t.plain_text || '').join('')
}

function getSelect(prop) {
  return prop?.select?.name || null
}

function getStatus(prop) {
  return prop?.status?.name || null
}

function getDate(prop) {
  return prop?.date?.start || null
}

function getRelationId(prop) {
  const rels = prop?.relation || []
  return rels[0]?.id || null
}

const STATUS_TO_ENGLISH = {
  'لم تبدأ': 'not_started',
  'قيد التنفيذ': 'in_progress',
  'تم': 'done',
  'Not started': 'not_started',
  'In progress': 'in_progress',
  'Done': 'done'
}

function normalizeStatus(raw) {
  if (!raw) return { english: 'not_started', arabic: 'لم تبدأ' }
  const english = STATUS_TO_ENGLISH[raw] || 'not_started'
  const ARABIC = { not_started: 'لم تبدأ', in_progress: 'قيد التنفيذ', done: 'تم' }
  return { english, arabic: ARABIC[english] }
}

export function mapNotionPageToProject(page) {
  const props = page.properties || {}
  const nameRaw = getTitle(props['Project'] || props['Name'] || props['اسم المشروع'])
  const statusRaw = getStatus(props['Status'] || props['الحالة'])
  const status = normalizeStatus(statusRaw)

  return {
    notion_id: page.id,
    notion_url: page.url,
    name: nameRaw || '(بدون اسم)',
    status: status.english,
    status_label: status.arabic,
    priority: getSelect(props['Priority'] || props['الأولوية']),
    start_date: getDate(props['Start Date'] || props['تاريخ البدء']),
    due_date: getDate(props['Due Date'] || props['تاريخ الانتهاء']),
    total_tasks: null,
    last_synced: new Date().toISOString()
  }
}

export function mapNotionPageToTask(page) {
  const props = page.properties || {}
  const nameRaw = getTitle(props['Task'] || props['Name'] || props['المهمة'] || props['اسم المهمة'])
  const statusRaw = getStatus(props['Status'] || props['الحالة'])
  const status = normalizeStatus(statusRaw)

  return {
    notion_id: page.id,
    notion_url: page.url,
    name: nameRaw || '(بدون اسم)',
    status: status.english,
    status_label: status.arabic,
    priority: getSelect(props['Priority'] || props['الأولوية']),
    due_date: getDate(props['Due Date'] || props['تاريخ الانتهاء']),
    project_notion_id: getRelationId(props['Project'] || props['المشروع']),
    last_synced: new Date().toISOString()
  }
}

// ── Upsert helpers ────────────────────────────────────────────────────────────

async function upsertProject(p) {
  await pool.query(
    `INSERT INTO notion_projects
       (notion_id, notion_url, name, status, status_label, priority, start_date, due_date, total_tasks, last_synced)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (notion_id) DO UPDATE SET
       notion_url=$2, name=$3, status=$4, status_label=$5, priority=$6,
       start_date=$7, due_date=$8, last_synced=$10`,
    [p.notion_id, p.notion_url, p.name, p.status, p.status_label,
     p.priority, p.start_date, p.due_date, p.total_tasks, p.last_synced]
  )
}

async function upsertTask(t) {
  await pool.query(
    `INSERT INTO notion_tasks
       (notion_id, notion_url, name, status, status_label, priority, due_date, project_notion_id, last_synced)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (notion_id) DO UPDATE SET
       notion_url=$2, name=$3, status=$4, status_label=$5, priority=$6,
       due_date=$7, project_notion_id=$8, last_synced=$9`,
    [t.notion_id, t.notion_url, t.name, t.status, t.status_label,
     t.priority, t.due_date, t.project_notion_id, t.last_synced]
  )
}

// ── Sync: pull from Notion → local DB ─────────────────────────────────────────

export async function syncProjectsFromNotion() {
  const cfg = await getNotionConfig()
  if (!cfg.projectsDb) throw new Error('Projects database ID not configured')

  const pages = await queryDatabase(cfg.projectsDb)
  let synced = 0
  const errors = []

  for (const page of pages) {
    try {
      const project = mapNotionPageToProject(page)
      await upsertProject(project)
      synced++
    } catch (e) {
      errors.push({ id: page.id, error: e.message })
    }
  }

  // Update total_tasks count for each project
  await pool.query(`
    UPDATE notion_projects p
    SET total_tasks = (
      SELECT COUNT(*) FROM notion_tasks t WHERE t.project_notion_id = p.notion_id
    )
  `)

  return { synced, total: pages.length, errors }
}

export async function syncTasksFromNotion() {
  const cfg = await getNotionConfig()
  if (!cfg.tasksDb) throw new Error('Tasks database ID not configured')

  const pages = await queryDatabase(cfg.tasksDb)
  let synced = 0
  const errors = []

  for (const page of pages) {
    try {
      const task = mapNotionPageToTask(page)
      await upsertTask(task)
      synced++
    } catch (e) {
      errors.push({ id: page.id, error: e.message })
    }
  }

  return { synced, total: pages.length, errors }
}

export async function syncAll() {
  const results = { projects: null, tasks: null, errors: [] }

  try {
    results.projects = await syncProjectsFromNotion()
  } catch (e) {
    results.errors.push({ step: 'projects', error: e.message })
  }

  try {
    results.tasks = await syncTasksFromNotion()
  } catch (e) {
    results.errors.push({ step: 'tasks', error: e.message })
  }

  return results
}
