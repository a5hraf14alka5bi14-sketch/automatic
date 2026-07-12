import v8 from 'v8'
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

  // Memory — use heap_size_limit (V8's configured max) as denominator.
  // heapUsed/heapTotal is always ~95-98% (V8 keeps heapTotal ≈ heapUsed)
  // and would cause spurious 503s. heap_size_limit is the true ceiling.
  const mem = process.memoryUsage()
  const heapUsedMb  = Math.round(mem.heapUsed  / 1024 / 1024)
  const heapTotalMb = Math.round(mem.heapTotal  / 1024 / 1024)
  const heapLimitMb = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024)
  const heapPct = heapLimitMb > 0 ? Math.round((heapUsedMb / heapLimitMb) * 100) : 0
  result.checks.memory = { ok: heapPct < 90, heapUsedMb, heapTotalMb, heapLimitMb, heapPct }
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
