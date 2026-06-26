import pkg from '@notionhq/client'
import { pool } from './db.js'

const { Client } = pkg

export const STATUS_TO_ENGLISH = {
  'لم تبدأ': 'not_started',
  'قيد التنفيذ': 'in_progress',
  'تم': 'done'
}
export const STATUS_TO_ARABIC = {
  not_started: 'لم تبدأ',
  in_progress: 'قيد التنفيذ',
  done: 'تم'
}

const DEFAULT_PROJECTS_DS = 'bea6bf0f-16f9-455c-b887-dee7b7cba587'
const DEFAULT_TASKS_DS = '2ea23851-9271-456c-bad7-cfa25fa2683d'

export async function getNotionConfig() {
  const rows = await pool.query(
    "SELECT key, value FROM settings WHERE key IN ('notion_api_key','notion_projects_db','notion_tasks_db')"
  )
  const cfg = {}
  for (const r of rows.rows) cfg[r.key] = r.value
  return {
    apiKey: cfg.notion_api_key || process.env.NOTION_API_KEY || '',
    projectsDb: cfg.notion_projects_db || DEFAULT_PROJECTS_DS,
    tasksDb: cfg.notion_tasks_db || DEFAULT_TASKS_DS
  }
}

export async function getNotionClient() {
  const cfg = await getNotionConfig()
  if (!cfg.apiKey) throw new Error('Notion API key not configured')
  return new Client({ auth: cfg.apiKey })
}

// ── Status helpers ──────────────────────────────────────────────────────────

function parseStatus(raw) {
  const english = STATUS_TO_ENGLISH[raw] || 'not_started'
  return { english, arabic: raw || 'لم تبدأ' }
}

function parseDate(raw) {
  if (!raw || typeof raw !== 'string') return null
  return raw.slice(0, 10)
}

function parseRelation(raw) {
  if (!raw) return null
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(arr) || !arr.length) return null
    const first = arr[0]
    if (typeof first === 'string') return first.replace(/^page:\/\//, '')
    if (first?.id) return first.id
  } catch { /* ignore */ }
  return null
}

// ── Map MCP SQL rows ────────────────────────────────────────────────────────

export function mapProjectRow(row) {
  const status = parseStatus(row['Status'])
  const rawUrl = row.url || ''
  // URL may be page://uuid or https://app.notion.com/uuid
  const notionId = rawUrl.startsWith('page://')
    ? rawUrl.replace('page://', '')
    : rawUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/-/g, '').replace(/^([0-9a-f]{32})$/, m =>
        `${m.slice(0,8)}-${m.slice(8,12)}-${m.slice(12,16)}-${m.slice(16,20)}-${m.slice(20)}`)
  return {
    notion_id: notionId || null,
    notion_url: rawUrl.startsWith('http') ? rawUrl : (notionId ? `https://www.notion.so/${notionId.replace(/-/g, '')}` : null),
    name: row['Project'] || '',
    status: status.english,
    status_label: status.arabic,
    priority: row['Priority'] || null,
    start_date: parseDate(row['date:Start Date:start']),
    due_date: parseDate(row['date:Due Date:start']),
    total_tasks: null,
    last_synced: new Date().toISOString()
  }
}

export function mapTaskRow(row) {
  const status = parseStatus(row['Status'])
  const rawUrl = row.url || ''
  const notionId = rawUrl.startsWith('page://')
    ? rawUrl.replace('page://', '')
    : rawUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/-/g, '').replace(/^([0-9a-f]{32})$/, m =>
        `${m.slice(0,8)}-${m.slice(8,12)}-${m.slice(12,16)}-${m.slice(16,20)}-${m.slice(20)}`)
  return {
    notion_id: notionId || null,
    notion_url: rawUrl.startsWith('http') ? rawUrl : (notionId ? `https://www.notion.so/${notionId.replace(/-/g, '')}` : null),
    name: row['Task'] || '',
    status: status.english,
    status_label: status.arabic,
    priority: row['Priority'] || null,
    due_date: parseDate(row['date:Due Date:start']),
    project_notion_id: parseRelation(row['Project']),
    last_synced: new Date().toISOString()
  }
}

// ── Update via REST (pages.update works without DB-level sharing) ───────────

export async function updateTaskStatusInNotion(notionPageId, statusEnglish) {
  const client = await getNotionClient()
  const arabicStatus = STATUS_TO_ARABIC[statusEnglish]
  if (!arabicStatus) throw new Error(`Invalid status: ${statusEnglish}`)
  await client.pages.update({
    page_id: notionPageId,
    properties: { Status: { status: { name: arabicStatus } } }
  })
}

export async function updateProjectStatusInNotion(notionPageId, statusEnglish) {
  const client = await getNotionClient()
  const arabicStatus = STATUS_TO_ARABIC[statusEnglish]
  if (!arabicStatus) throw new Error(`Invalid status: ${statusEnglish}`)
  await client.pages.update({
    page_id: notionPageId,
    properties: { Status: { status: { name: arabicStatus } } }
  })
}

// ── Create via REST ──────────────────────────────────────────────────────────

export async function createTaskInNotion(taskData) {
  const client = await getNotionClient()
  const cfg = await getNotionConfig()
  const arabicStatus = STATUS_TO_ARABIC[taskData.status] || 'لم تبدأ'
  const properties = {
    Task: { title: [{ text: { content: taskData.name } }] },
    Status: { status: { name: arabicStatus } }
  }
  if (taskData.priority) properties['Priority'] = { select: { name: taskData.priority } }
  if (taskData.due_date) properties['Due Date'] = { date: { start: taskData.due_date } }
  if (taskData.project_notion_id) properties['Project'] = { relation: [{ id: taskData.project_notion_id }] }
  const page = await client.pages.create({
    parent: { database_id: cfg.tasksDb },
    properties
  })
  return {
    notion_id: page.id,
    notion_url: page.url,
    name: taskData.name,
    status: taskData.status || 'not_started',
    status_label: arabicStatus,
    priority: taskData.priority || null,
    due_date: taskData.due_date || null,
    project_notion_id: taskData.project_notion_id || null,
    last_synced: new Date().toISOString()
  }
}

export async function createProjectInNotion(projectData) {
  const client = await getNotionClient()
  const cfg = await getNotionConfig()
  const arabicStatus = STATUS_TO_ARABIC[projectData.status] || 'لم تبدأ'
  const properties = {
    Project: { title: [{ text: { content: projectData.name } }] },
    Status: { status: { name: arabicStatus } }
  }
  if (projectData.priority) properties['Priority'] = { select: { name: projectData.priority } }
  if (projectData.due_date) properties['Due Date'] = { date: { start: projectData.due_date } }
  if (projectData.start_date) properties['Start Date'] = { date: { start: projectData.start_date } }
  const page = await client.pages.create({
    parent: { database_id: cfg.projectsDb },
    properties
  })
  return {
    notion_id: page.id,
    notion_url: page.url,
    name: projectData.name,
    status: projectData.status || 'not_started',
    status_label: arabicStatus,
    priority: projectData.priority || null,
    start_date: projectData.start_date || null,
    due_date: projectData.due_date || null,
    total_tasks: 0,
    last_synced: new Date().toISOString()
  }
}
