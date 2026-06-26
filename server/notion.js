import { Client } from '@notionhq/client'
import { pool } from './db.js'

// Status mapping: Notion (Arabic) <-> App (English)
export const STATUS_TO_ENGLISH = {
  'لم تبدأ': 'not_started',
  'قيد التنفيذ': 'in_progress',
  'تم': 'done'
}
export const STATUS_TO_ARABIC = {
  'not_started': 'لم تبدأ',
  'in_progress': 'قيد التنفيذ',
  'done': 'تم'
}

export async function getNotionConfig() {
  const rows = await pool.query(
    "SELECT key, value FROM settings WHERE key IN ('notion_api_key','notion_projects_db','notion_tasks_db')"
  )
  const cfg = {}
  for (const row of rows.rows) cfg[row.key] = row.value

  return {
    apiKey: cfg.notion_api_key || process.env.NOTION_API_KEY || '',
    projectsDb: cfg.notion_projects_db || 'bea6bf0f-16f9-455c-b887-dee7b7cba587',
    tasksDb: cfg.notion_tasks_db || '2ea23851-9271-456c-bad7-cfa25fa2683d'
  }
}

export async function getNotionClient() {
  const cfg = await getNotionConfig()
  if (!cfg.apiKey) throw new Error('Notion API key not configured')
  return new Client({ auth: cfg.apiKey })
}

// Safely extract a rich-text plain string
function richText(arr) {
  if (!Array.isArray(arr)) return ''
  return arr.map(t => t.plain_text || '').join('')
}

// Map a Notion page (project) to a plain object
export function mapProject(page) {
  const p = page.properties
  return {
    notion_id: page.id,
    notion_url: page.url,
    name: richText(p['Project']?.title || []),
    status: STATUS_TO_ENGLISH[p['Status']?.status?.name] || 'not_started',
    status_label: p['Status']?.status?.name || 'لم تبدأ',
    priority: p['Priority']?.select?.name || null,
    start_date: p['Start Date']?.date?.start || null,
    due_date: p['Due Date']?.date?.start || null,
    total_tasks: p['Total Tasks']?.rollup?.number ?? 0,
    last_synced: new Date().toISOString()
  }
}

// Map a Notion page (task) to a plain object
export function mapTask(page) {
  const p = page.properties
  const projectRels = p['Project']?.relation || []
  return {
    notion_id: page.id,
    notion_url: page.url,
    name: richText(p['Task']?.title || []),
    status: STATUS_TO_ENGLISH[p['Status']?.status?.name] || 'not_started',
    status_label: p['Status']?.status?.name || 'لم تبدأ',
    priority: p['Priority']?.select?.name || null,
    due_date: p['date:Due Date:start']?.date?.start || p['Due Date']?.date?.start || null,
    project_notion_id: projectRels[0]?.id || null,
    last_synced: new Date().toISOString()
  }
}

export async function fetchProjectsFromNotion() {
  const client = await getNotionClient()
  const cfg = await getNotionConfig()
  const pages = []
  let cursor = undefined
  do {
    const res = await client.databases.query({
      database_id: cfg.projectsDb,
      start_cursor: cursor,
      page_size: 100
    })
    pages.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return pages.map(mapProject)
}

export async function fetchTasksFromNotion() {
  const client = await getNotionClient()
  const cfg = await getNotionConfig()
  const pages = []
  let cursor = undefined
  do {
    const res = await client.databases.query({
      database_id: cfg.tasksDb,
      start_cursor: cursor,
      page_size: 100
    })
    pages.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return pages.map(mapTask)
}

export async function updateTaskStatusInNotion(notionPageId, statusEnglish) {
  const client = await getNotionClient()
  const arabicStatus = STATUS_TO_ARABIC[statusEnglish]
  if (!arabicStatus) throw new Error(`Invalid status: ${statusEnglish}`)
  await client.pages.update({
    page_id: notionPageId,
    properties: {
      Status: { status: { name: arabicStatus } }
    }
  })
}

export async function updateProjectStatusInNotion(notionPageId, statusEnglish) {
  const client = await getNotionClient()
  const arabicStatus = STATUS_TO_ARABIC[statusEnglish]
  if (!arabicStatus) throw new Error(`Invalid status: ${statusEnglish}`)
  await client.pages.update({
    page_id: notionPageId,
    properties: {
      Status: { status: { name: arabicStatus } }
    }
  })
}

export async function createTaskInNotion(taskData) {
  const client = await getNotionClient()
  const cfg = await getNotionConfig()
  const props = {
    Task: { title: [{ text: { content: taskData.name } }] },
    Status: { status: { name: STATUS_TO_ARABIC[taskData.status] || 'لم تبدأ' } }
  }
  if (taskData.priority) props['Priority'] = { select: { name: taskData.priority } }
  if (taskData.due_date) props['Due Date'] = { date: { start: taskData.due_date } }
  if (taskData.project_notion_id) props['Project'] = { relation: [{ id: taskData.project_notion_id }] }
  const page = await client.pages.create({
    parent: { database_id: cfg.tasksDb },
    properties: props
  })
  return mapTask(page)
}

export async function createProjectInNotion(projectData) {
  const client = await getNotionClient()
  const cfg = await getNotionConfig()
  const props = {
    Project: { title: [{ text: { content: projectData.name } }] },
    Status: { status: { name: STATUS_TO_ARABIC[projectData.status] || 'لم تبدأ' } }
  }
  if (projectData.priority) props['Priority'] = { select: { name: projectData.priority } }
  if (projectData.due_date) props['Due Date'] = { date: { start: projectData.due_date } }
  if (projectData.start_date) props['Start Date'] = { date: { start: projectData.start_date } }
  const page = await client.pages.create({
    parent: { database_id: cfg.projectsDb },
    properties: props
  })
  return mapProject(page)
}
