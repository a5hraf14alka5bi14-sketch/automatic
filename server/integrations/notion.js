/**
 * Notion integration adapter — full bi-directional sync for all entities.
 * Pulls: Menu, Inventory, Customers, Projects, Tasks from Notion → PostgreSQL.
 * Pushes: Status updates and new records from PostgreSQL → Notion.
 */
import { pool } from '../db.js'
import { getNotionConfig, getExtendedNotionConfig } from '../notion.js'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

// ── Auth ───────────────────────────────────────────────────────────────────────

export async function getNotionToken() {
  const cfg = await getNotionConfig()
  return cfg.apiKey || ''
}

// ── Raw REST fetch ─────────────────────────────────────────────────────────────

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

// ── Query full database (paginated) ───────────────────────────────────────────

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

// ── Test connection ────────────────────────────────────────────────────────────

export async function testNotionConnection() {
  const data = await notionFetch('/users/me')
  return { user: data.name || data.id, type: data.type }
}

// ── Property extractors ────────────────────────────────────────────────────────

function getTitle(prop) {
  if (!prop) return ''
  const items = prop.title || prop.rich_text || []
  return items.map(t => t.plain_text || '').join('')
}

function getRichText(prop) {
  if (!prop) return ''
  const items = prop.rich_text || prop.title || []
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

function getNumber(prop) {
  if (prop?.number === null || prop?.number === undefined) return null
  return prop.number
}

function getCheckbox(prop) {
  return prop?.checkbox === true
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
  'Done': 'done',
  'Active': 'in_progress',
  'نشط': 'in_progress'
}

function normalizeStatus(raw) {
  if (!raw) return { english: 'not_started', arabic: 'لم تبدأ' }
  const english = STATUS_TO_ENGLISH[raw] || 'not_started'
  const ARABIC = { not_started: 'لم تبدأ', in_progress: 'قيد التنفيذ', done: 'تم' }
  return { english, arabic: ARABIC[english] }
}

// ── Page mappers ──────────────────────────────────────────────────────────────

export function mapNotionPageToProject(page) {
  const props = page.properties || {}
  const statusRaw = getStatus(props['Status'] || props['الحالة'])
  const status = normalizeStatus(statusRaw)
  return {
    notion_id: page.id,
    notion_url: page.url,
    name: getTitle(props['Project'] || props['Name'] || props['اسم المشروع']) || '(بدون اسم)',
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
  const statusRaw = getStatus(props['Status'] || props['الحالة'])
  const status = normalizeStatus(statusRaw)
  return {
    notion_id: page.id,
    notion_url: page.url,
    name: getTitle(props['Task'] || props['Name'] || props['المهمة']) || '(بدون اسم)',
    status: status.english,
    status_label: status.arabic,
    priority: getSelect(props['Priority'] || props['الأولوية']),
    due_date: getDate(props['Due Date'] || props['تاريخ الانتهاء']),
    project_notion_id: getRelationId(props['Project'] || props['المشروع']),
    last_synced: new Date().toISOString()
  }
}

export function mapNotionPageToMenuItem(page) {
  const props = page.properties || {}
  const name = getTitle(props['Recipe'] || props['Name'] || props['الوصفة'])
  const rawCategory = getSelect(props['Category'] || props['الفئة']) || 'other'
  const price = getNumber(props['Selling Price'] || props['سعر البيع']) || 0
  const foodCost = getNumber(props['Food Cost'] || props['تكلفة الطعام']) || 0
  const available = getCheckbox(props['Available'] || props['متاح'])
  const prepTime = getNumber(props['Preparation Time'] || props['وقت التحضير']) || 15
  const calories = getNumber(props['Calories'] || props['السعرات'])
  const statusRaw = getStatus(props['Status'])
  const isActive = !statusRaw || !['تم', 'Done'].includes(statusRaw)

  return {
    notion_id: page.id,
    name: name || '(بدون اسم)',
    category: rawCategory.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '').slice(0, 50),
    price,
    food_cost: foodCost,
    available: available && isActive,
    prep_time: prepTime,
    description: calories ? `${calories} سعر حراري` : '',
    tags: '',
    last_synced: new Date().toISOString()
  }
}

export function mapNotionPageToInventoryItem(page) {
  const props = page.properties || {}
  const name = getTitle(props['Item'] || props['المادة'])
  const rawCategory = getSelect(props['Category'] || props['الفئة']) || 'other'
  const unit = getSelect(props['Unit'] || props['الوحدة']) || 'pcs'
  const currentStock = getNumber(props['Current Stock'] || props['المخزون الحالي']) || 0
  const minStock = getNumber(props['Minimum Stock'] || props['الحد الأدنى']) || 0
  const unitCost = getNumber(props['Unit Cost'] || props['تكلفة الوحدة']) || 0

  return {
    notion_id: page.id,
    name: name || '(بدون اسم)',
    category: rawCategory.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '').slice(0, 50),
    quantity: currentStock,
    unit,
    min_quantity: minStock,
    cost: unitCost,
    last_synced: new Date().toISOString()
  }
}

export function mapNotionPageToCustomer(page) {
  const props = page.properties || {}
  const name = getTitle(props['Customer'] || props['العميل'])
  const email = props['Email']?.email || null
  const phone = props['Phone']?.phone_number || null
  const loyaltyPoints = getNumber(props['Loyalty Points'] || props['نقاط الولاء']) || 0
  const lastVisit = getDate(props['Last Visit'] || props['آخر زيارة'])

  return {
    notion_id: page.id,
    name: name || '(بدون اسم)',
    email,
    phone,
    loyalty_points: loyaltyPoints,
    last_visit: lastVisit,
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

async function upsertMenuItem(item) {
  await pool.query(
    `INSERT INTO menu_items
       (notion_id, name, category, price, food_cost, available, prep_time, description, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (notion_id) DO UPDATE SET
       name=$2, category=$3, price=$4, food_cost=$5, available=$6,
       prep_time=$7,
       description=CASE WHEN $8 <> '' THEN $8 ELSE menu_items.description END`,
    [item.notion_id, item.name, item.category, item.price, item.food_cost,
     item.available, item.prep_time, item.description, item.tags]
  )
}

async function upsertInventoryItem(item) {
  await pool.query(
    `INSERT INTO inventory
       (notion_id, name, category, quantity, unit, min_quantity, cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (notion_id) DO UPDATE SET
       name=$2, category=$3, quantity=$4, unit=$5, min_quantity=$6, cost=$7`,
    [item.notion_id, item.name, item.category, item.quantity,
     item.unit, item.min_quantity, item.cost]
  )
}

async function upsertCustomer(c) {
  await pool.query(
    `INSERT INTO customers
       (notion_id, name, email, phone, loyalty_points)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (notion_id) DO UPDATE SET
       name=$2,
       email=CASE WHEN $3 IS NOT NULL THEN $3 ELSE customers.email END,
       phone=CASE WHEN $4 IS NOT NULL THEN $4 ELSE customers.phone END,
       loyalty_points=$5`,
    [c.notion_id, c.name, c.email, c.phone, c.loyalty_points]
  )
}

// ── Sync: Projects ─────────────────────────────────────────────────────────────

export async function syncProjectsFromNotion() {
  const cfg = await getNotionConfig()
  if (!cfg.projectsDb) throw new Error('Projects database ID not configured')

  const pages = await queryDatabase(cfg.projectsDb)
  let synced = 0
  const errors = []

  for (const page of pages) {
    try {
      await upsertProject(mapNotionPageToProject(page))
      synced++
    } catch (e) {
      errors.push({ id: page.id, error: e.message })
    }
  }

  await pool.query(`
    UPDATE notion_projects p
    SET total_tasks = (
      SELECT COUNT(*) FROM notion_tasks t WHERE t.project_notion_id = p.notion_id
    )
  `)

  return { synced, total: pages.length, errors }
}

// ── Sync: Tasks ────────────────────────────────────────────────────────────────

export async function syncTasksFromNotion() {
  const cfg = await getNotionConfig()
  if (!cfg.tasksDb) throw new Error('Tasks database ID not configured')

  const pages = await queryDatabase(cfg.tasksDb)
  let synced = 0
  const errors = []

  for (const page of pages) {
    try {
      await upsertTask(mapNotionPageToTask(page))
      synced++
    } catch (e) {
      errors.push({ id: page.id, error: e.message })
    }
  }

  return { synced, total: pages.length, errors }
}

// ── Sync: Menu ─────────────────────────────────────────────────────────────────

export async function syncMenuFromNotion() {
  const cfg = await getExtendedNotionConfig()
  if (!cfg.menuDb) {
    return { synced: 0, total: 0, skipped: true, reason: 'Menu DB not configured' }
  }

  const pages = await queryDatabase(cfg.menuDb)
  if (!pages.length) return { synced: 0, total: 0, skipped: true, reason: 'No records in Notion Menu DB' }

  let synced = 0
  const errors = []

  for (const page of pages) {
    try {
      await upsertMenuItem(mapNotionPageToMenuItem(page))
      synced++
    } catch (e) {
      errors.push({ id: page.id, error: e.message })
    }
  }

  return { synced, total: pages.length, errors }
}

// ── Sync: Inventory ────────────────────────────────────────────────────────────

export async function syncInventoryFromNotion() {
  const cfg = await getExtendedNotionConfig()
  if (!cfg.inventoryDb) {
    return { synced: 0, total: 0, skipped: true, reason: 'Inventory DB not configured' }
  }

  const pages = await queryDatabase(cfg.inventoryDb)
  if (!pages.length) return { synced: 0, total: 0, skipped: true, reason: 'No records in Notion Inventory DB' }

  let synced = 0
  const errors = []

  for (const page of pages) {
    try {
      await upsertInventoryItem(mapNotionPageToInventoryItem(page))
      synced++
    } catch (e) {
      errors.push({ id: page.id, error: e.message })
    }
  }

  return { synced, total: pages.length, errors }
}

// ── Sync: Customers ────────────────────────────────────────────────────────────

export async function syncCustomersFromNotion() {
  const cfg = await getExtendedNotionConfig()
  if (!cfg.customersDb) {
    return { synced: 0, total: 0, skipped: true, reason: 'Customers DB not configured' }
  }

  const pages = await queryDatabase(cfg.customersDb)
  if (!pages.length) return { synced: 0, total: 0, skipped: true, reason: 'No records in Notion Customers DB' }

  let synced = 0
  const errors = []

  for (const page of pages) {
    try {
      await upsertCustomer(mapNotionPageToCustomer(page))
      synced++
    } catch (e) {
      errors.push({ id: page.id, error: e.message })
    }
  }

  return { synced, total: pages.length, errors }
}

// ── Push: PostgreSQL → Notion (only records without notion_id) ─────────────────

async function notionPost(token, body) {
  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION
    },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || `Notion API error ${res.status}`)
  return data
}

export async function pushMenuToNotion() {
  const cfg = await getExtendedNotionConfig()
  if (!cfg.menuDb || !cfg.apiKey) {
    return { pushed: 0, skipped: true, reason: 'Menu DB or API key not configured' }
  }

  const items = await pool.query(
    `SELECT * FROM menu_items WHERE notion_id IS NULL ORDER BY created_at LIMIT 50`
  )
  let pushed = 0

  for (const item of items.rows) {
    try {
      const body = {
        parent: { database_id: cfg.menuDb },
        properties: {
          Recipe: { title: [{ text: { content: item.name } }] },
          'Selling Price': { number: parseFloat(item.price) },
          'Food Cost': { number: parseFloat(item.food_cost || 0) },
          Available: { checkbox: !!item.available },
          'Preparation Time': { number: item.prep_time || 15 },
          Status: { status: { name: item.available ? 'قيد التنفيذ' : 'لم تبدأ' } }
        }
      }
      if (item.category) body.properties.Category = { select: { name: item.category } }

      const page = await notionPost(cfg.apiKey, body)
      await pool.query('UPDATE menu_items SET notion_id=$1 WHERE id=$2', [page.id, item.id])
      pushed++
    } catch (e) {
      console.error('[push-menu]', item.id, e.message)
    }
  }

  return { pushed, total: items.rows.length }
}

export async function pushInventoryToNotion() {
  const cfg = await getExtendedNotionConfig()
  if (!cfg.inventoryDb || !cfg.apiKey) {
    return { pushed: 0, skipped: true, reason: 'Inventory DB or API key not configured' }
  }

  const items = await pool.query(
    `SELECT * FROM inventory WHERE notion_id IS NULL ORDER BY created_at LIMIT 50`
  )
  let pushed = 0

  for (const item of items.rows) {
    try {
      const body = {
        parent: { database_id: cfg.inventoryDb },
        properties: {
          Item: { title: [{ text: { content: item.name } }] },
          'Current Stock': { number: parseFloat(item.quantity || 0) },
          'Minimum Stock': { number: parseFloat(item.min_quantity || 0) },
          'Unit Cost': { number: parseFloat(item.cost || 0) },
          Status: { status: { name: 'قيد التنفيذ' } }
        }
      }
      if (item.category) body.properties.Category = { select: { name: item.category } }
      if (item.unit) body.properties.Unit = { select: { name: item.unit } }

      const page = await notionPost(cfg.apiKey, body)
      await pool.query('UPDATE inventory SET notion_id=$1 WHERE id=$2', [page.id, item.id])
      pushed++
    } catch (e) {
      console.error('[push-inventory]', item.id, e.message)
    }
  }

  return { pushed, total: items.rows.length }
}

export async function pushCustomersToNotion() {
  const cfg = await getExtendedNotionConfig()
  if (!cfg.customersDb || !cfg.apiKey) {
    return { pushed: 0, skipped: true, reason: 'Customers DB or API key not configured' }
  }

  const customers = await pool.query(
    `SELECT * FROM customers WHERE notion_id IS NULL ORDER BY created_at LIMIT 50`
  )
  let pushed = 0

  for (const c of customers.rows) {
    try {
      const body = {
        parent: { database_id: cfg.customersDb },
        properties: {
          Customer: { title: [{ text: { content: c.name } }] },
          'Loyalty Points': { number: c.loyalty_points || 0 },
          Status: { status: { name: 'قيد التنفيذ' } }
        }
      }
      if (c.email) body.properties.Email = { email: c.email }
      if (c.phone) body.properties.Phone = { phone_number: c.phone }

      const page = await notionPost(cfg.apiKey, body)
      await pool.query('UPDATE customers SET notion_id=$1 WHERE id=$2', [page.id, c.id])
      pushed++
    } catch (e) {
      console.error('[push-customers]', c.id, e.message)
    }
  }

  return { pushed, total: customers.rows.length }
}

// ── syncAll ────────────────────────────────────────────────────────────────────

export async function syncAll() {
  const results = {
    projects: null, tasks: null,
    menu: null, inventory: null, customers: null,
    errors: []
  }

  const steps = [
    ['projects', syncProjectsFromNotion],
    ['tasks', syncTasksFromNotion],
    ['menu', syncMenuFromNotion],
    ['inventory', syncInventoryFromNotion],
    ['customers', syncCustomersFromNotion],
  ]

  for (const [key, fn] of steps) {
    try {
      results[key] = await fn()
    } catch (e) {
      results.errors.push({ step: key, error: e.message })
      results[key] = { synced: 0, total: 0, error: e.message }
    }
  }

  return results
}
