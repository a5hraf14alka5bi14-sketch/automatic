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

// REST database container IDs (Notion-Version 2022-06-28 addresses the database,
// not the data source). In the multi-data-source model these differ from the
// collection:// data-source IDs used by the MCP layer.
const DEFAULT_PROJECTS_DS = '7393008a-5771-453d-aeb7-ef4afd8751ba'
const DEFAULT_TASKS_DS = 'fdde12c5-0c0a-4df4-ab5d-3983a01a0eb8'
const DEFAULT_MENU_DS = '55d032d4-e5ac-462e-86c0-898914bad335'
const DEFAULT_INVENTORY_DS = '39197a5a-3a84-4e7d-995b-44ae2d80d85c'
const DEFAULT_CUSTOMERS_DS = '5e03302c-30a4-4990-8ab1-992411e8196b'
const DEFAULT_SUPPLIERS_DS = 'bb195e84-a1cc-437e-9bf4-a41ba67392ab'
const DEFAULT_PURCHASE_ORDERS_DS = '901d5648-5299-42ed-8634-18ea83075c67'
const DEFAULT_STAFF_DS = '9af38ed0-26bc-45fc-99c2-24bc4068203b'
const DEFAULT_FINANCE_DS = 'a0aa93a9-964c-4434-bac4-8d2a95997e1a'
const DEFAULT_ORDER_ITEMS_DS = 'eca42e10-8f29-4f34-bde1-ecdc46855de1'
const DEFAULT_SALES_DS = 'd815b59c-c22b-4737-9851-6c1197e1e540'
const DEFAULT_RECIPE_INGREDIENTS_DS = '6fa6cb41-94a7-4891-aca8-b775571e5b54'

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

export async function getExtendedNotionConfig() {
  const keys = [
    'notion_api_key', 'notion_projects_db', 'notion_tasks_db',
    'notion_menu_db', 'notion_inventory_db', 'notion_customers_db',
    'notion_suppliers_db', 'notion_purchase_orders_db', 'notion_staff_db',
    'notion_finance_db', 'notion_order_items_db', 'notion_recipe_ingredients_db',
    'notion_sales_db'
  ]
  const rows = await pool.query(
    `SELECT key, value FROM settings WHERE key = ANY($1)`,
    [keys]
  )
  const cfg = {}
  for (const r of rows.rows) cfg[r.key] = r.value
  return {
    apiKey: cfg.notion_api_key || process.env.NOTION_API_KEY || '',
    projectsDb: cfg.notion_projects_db || DEFAULT_PROJECTS_DS,
    tasksDb: cfg.notion_tasks_db || DEFAULT_TASKS_DS,
    menuDb: cfg.notion_menu_db || DEFAULT_MENU_DS,
    inventoryDb: cfg.notion_inventory_db || DEFAULT_INVENTORY_DS,
    customersDb: cfg.notion_customers_db || DEFAULT_CUSTOMERS_DS,
    suppliersDb: cfg.notion_suppliers_db || DEFAULT_SUPPLIERS_DS,
    purchaseOrdersDb: cfg.notion_purchase_orders_db || DEFAULT_PURCHASE_ORDERS_DS,
    staffDb: cfg.notion_staff_db || DEFAULT_STAFF_DS,
    financeDb: cfg.notion_finance_db || DEFAULT_FINANCE_DS,
    orderItemsDb: cfg.notion_order_items_db || DEFAULT_ORDER_ITEMS_DS,
    salesDb: cfg.notion_sales_db || DEFAULT_SALES_DS,
    recipeIngredientsDb: cfg.notion_recipe_ingredients_db || DEFAULT_RECIPE_INGREDIENTS_DS
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
