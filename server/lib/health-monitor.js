import { pool } from '../db.js'
import { logger } from '../logger.js'

let lastCheck = null
let checkPromise = null

async function runCheck() {
  const start = Date.now()
  const result = { ok: true, checks: {}, timestamp: new Date().toISOString() }

  // DB ping
  try {
    await pool.query('SELECT 1')
    result.checks.database = { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    result.ok = false
    result.checks.database = { ok: false, error: err.message }
    logger.error('[health] DB ping failed', { msg: err.message })
  }

  // Memory
  const mem = process.memoryUsage()
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024)
  const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024)
  const heapPct = heapTotalMb > 0 ? Math.round((heapUsedMb / heapTotalMb) * 100) : 0
  result.checks.memory = { ok: heapPct < 90, heapUsedMb, heapTotalMb, heapPct }
  if (heapPct >= 90) { result.ok = false; logger.warn('[health] high memory', { heapPct }) }

  // Pool stats
  const pool_total = pool.totalCount || 0
  const pool_idle = pool.idleCount || 0
  const pool_waiting = pool.waitingCount || 0
  result.checks.pool = { ok: pool_waiting < 5, total: pool_total, idle: pool_idle, waiting: pool_waiting }
  if (pool_waiting >= 5) result.ok = false

  result.uptimeSeconds = Math.floor(process.uptime())
  lastCheck = result
  return result
}

export async function getHealth() {
  // Debounce: reuse in-flight check, cache result for 5s
  if (checkPromise) return checkPromise
  if (lastCheck && (Date.now() - new Date(lastCheck.timestamp).getTime() < 5000)) return lastCheck
  checkPromise = runCheck().finally(() => { checkPromise = null })
  return checkPromise
}

// Push low-stock alerts via WebSocket when stock is deducted
let _wss = null
export function setHealthWss(wss) { _wss = wss }

export function broadcastLowStock(items) {
  if (!_wss || !items?.length) return
  const msg = JSON.stringify({ type: 'low_stock', items })
  _wss.clients.forEach(client => {
    if (client.readyState === 1) {
      try { client.send(msg) } catch { /* disconnected */ }
    }
  })
}

// Check low stock after inventory mutations and broadcast if needed
export async function checkAndBroadcastLowStock() {
  try {
    const r = await pool.query(`
      SELECT id, name, quantity, unit, low_stock_threshold
      FROM inventory
      WHERE deleted_at IS NULL
        AND low_stock_threshold IS NOT NULL
        AND quantity <= low_stock_threshold
      ORDER BY quantity ASC
      LIMIT 20
    `)
    if (r.rows.length) broadcastLowStock(r.rows)
  } catch { /* non-critical */ }
}
