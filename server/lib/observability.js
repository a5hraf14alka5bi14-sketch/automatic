// Observability: per-request logging (with a request id + timing) and
// in-process metrics counters surfaced via getMetrics() for /api/admin/metrics.

import { randomUUID } from 'node:crypto'
import { logger } from '../logger.js'

const IS_PROD = process.env.NODE_ENV === 'production'

const metrics = {
  startedAt: Date.now(),
  total: 0,
  errors: 0,
  totalDurationMs: 0,
  byStatusClass: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  byMethod: {},
}

// Attaches a request id, times the request, updates counters, and logs.
// In development only failures are logged (keeps the console readable under
// polling); in production every request is logged as structured JSON.
export function requestLogger(req, res, next) {
  if (!req.path.startsWith('/api')) return next()

  const start = process.hrtime.bigint()
  req.id = randomUUID()
  res.setHeader('X-Request-Id', req.id)

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    metrics.total++
    metrics.totalDurationMs += ms
    metrics.byMethod[req.method] = (metrics.byMethod[req.method] || 0) + 1
    const cls = `${Math.floor(res.statusCode / 100)}xx`
    if (metrics.byStatusClass[cls] !== undefined) metrics.byStatusClass[cls]++
    if (res.statusCode >= 500) metrics.errors++

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    if (IS_PROD || level !== 'info') {
      logger[level]('request', {
        reqId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(ms),
      })
    }
  })

  next()
}

export function getMetrics() {
  const mem = process.memoryUsage()
  const mb = (n) => Math.round((n / 1048576) * 100) / 100
  return {
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: new Date(metrics.startedAt).toISOString(),
    requests: {
      total: metrics.total,
      errors: metrics.errors,
      avgDurationMs: metrics.total ? Math.round((metrics.totalDurationMs / metrics.total) * 100) / 100 : 0,
      byStatusClass: metrics.byStatusClass,
      byMethod: metrics.byMethod,
    },
    memory: { rssMb: mb(mem.rss), heapUsedMb: mb(mem.heapUsed), heapTotalMb: mb(mem.heapTotal) },
    ts: Date.now(),
  }
}
