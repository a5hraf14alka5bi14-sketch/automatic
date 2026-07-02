/**
 * Auto-sync engine — periodic Notion ↔ DB synchronisation.
 * Stores history in sync_log table.
 * Extensible: add new service adapters by calling registerAdapter().
 */
import { pool } from '../db.js'

const adapters = {}
let timer = null
let currentInterval = null

// ── Adapter registry ──────────────────────────────────────────────────────────

export function registerAdapter(service, syncFn) {
  adapters[service] = syncFn
}

// ── Log helpers ───────────────────────────────────────────────────────────────

async function logSync(service, direction, status, counts = {}, errorMsg = null) {
  try {
    await pool.query(
      `INSERT INTO sync_log (service, direction, status, items_synced, items_total, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [service, direction, status,
       counts.synced || 0, counts.total || 0, errorMsg || null]
    )
  } catch (e) {
    console.error('[sync-engine] Failed to write sync_log:', e.message)
  }
}

// ── Run a single sync cycle ───────────────────────────────────────────────────

export async function runSync(service = 'notion') {
  const fn = adapters[service]
  if (!fn) throw new Error(`No sync adapter registered for: ${service}`)

  const started = Date.now()
  console.log(`[sync-engine] Starting ${service} sync...`)

  try {
    const result = await fn()
    const ms = Date.now() - started

    const ALL_KEYS = ['projects','tasks','menu','inventory','customers','recipe_ingredients','sales','finance','staff']
    const totalSynced = ALL_KEYS.reduce((s, k) => s + (result[k]?.synced || 0), 0)
    const totalItems  = ALL_KEYS.reduce((s, k) => s + (result[k]?.total  || 0), 0)

    await logSync(service, 'pull', 'success',
      { synced: totalSynced, total: totalItems })

    console.log(`[sync-engine] ${service} sync done in ${ms}ms — ${totalSynced}/${totalItems} items`)
    return { success: true, ms, ...result }
  } catch (e) {
    await logSync(service, 'pull', 'error', {}, e.message)
    console.error(`[sync-engine] ${service} sync failed:`, e.message)
    throw e
  }
}

// ── Auto-sync timer ───────────────────────────────────────────────────────────

export function startAutoSync(service = 'notion', intervalMs = 15 * 60 * 1000) {
  stopAutoSync()
  currentInterval = intervalMs

  console.log(`[sync-engine] Auto-sync enabled for ${service} every ${intervalMs / 60000} min`)

  timer = setInterval(async () => {
    try { await runSync(service) }
    catch (e) { /* already logged */ }
  }, intervalMs)

  // node won't exit because of setInterval — unref so it doesn't block process exit
  if (timer.unref) timer.unref()
}

export function stopAutoSync() {
  if (timer) {
    clearInterval(timer)
    timer = null
    currentInterval = null
    console.log('[sync-engine] Auto-sync stopped')
  }
}

export function getSyncEngineStatus() {
  return {
    running: timer !== null,
    interval_ms: currentInterval,
    interval_min: currentInterval ? currentInterval / 60000 : null,
    adapters: Object.keys(adapters)
  }
}

// ── Sync log queries ──────────────────────────────────────────────────────────

export async function getRecentLogs(service = null, limit = 20) {
  const params = [limit]
  let where = ''
  if (service) {
    where = 'WHERE service=$2'
    params.push(service)
  }
  const result = await pool.query(
    `SELECT * FROM sync_log ${where} ORDER BY created_at DESC LIMIT $1`,
    params
  )
  return result.rows
}

export async function getLastSyncTime(service = 'notion') {
  const result = await pool.query(
    `SELECT created_at, status, items_synced, items_total, error_message
     FROM sync_log
     WHERE service=$1 AND status='success'
     ORDER BY created_at DESC LIMIT 1`,
    [service]
  )
  return result.rows[0] || null
}
