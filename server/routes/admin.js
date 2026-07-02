// Admin-only operational endpoints: metrics, audit log, and on-demand DB backup.
import { Router } from 'express'
import { spawn } from 'node:child_process'
import { requireRole } from '../middleware/auth.js'
import { pool } from '../db.js'
import { getMetrics } from '../lib/observability.js'
import { logger } from '../logger.js'

const router = Router()

// Every route here requires the admin role.
router.use(requireRole('admin'))

// ── Runtime metrics (uptime, memory, request counters) ───────────────────────
router.get('/metrics', (req, res) => {
  res.json(getMetrics())
})

// ── Audit log listing (most recent first, paginated) ─────────────────────────
router.get('/audit', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500)
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
    const [rows, count] = await Promise.all([
      pool.query(
        'SELECT id, user_id, user_email, method, path, status, ip, details, created_at FROM audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS c FROM audit_log'),
    ])
    res.set('X-Total-Count', String(count.rows[0].c))
    res.json(rows.rows)
  } catch (err) {
    next(err)
  }
})

// ── On-demand full database backup (streams pg_dump output as a download) ─────
router.get('/backup', (req, res) => {
  const url = process.env.DATABASE_URL
  if (!url) return res.status(500).json({ error: 'DATABASE_URL is not configured' })

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `backup-${ts}.sql`

  // Derive libpq env vars from DATABASE_URL so credentials are passed via the
  // environment rather than argv (where they'd show up in host process listings).
  let pgEnv
  try {
    const u = new URL(url)
    pgEnv = {
      ...process.env,
      PGHOST: u.hostname,
      PGPORT: u.port || '5432',
      PGUSER: decodeURIComponent(u.username),
      PGPASSWORD: decodeURIComponent(u.password),
      PGDATABASE: u.pathname.replace(/^\//, ''),
    }
    const sslmode = u.searchParams.get('sslmode')
    if (sslmode) pgEnv.PGSSLMODE = sslmode
  } catch (err) {
    logger.error('[backup] invalid DATABASE_URL', { msg: err.message })
    return res.status(500).json({ error: 'Backup failed to start' })
  }

  const child = spawn('pg_dump', ['--no-owner', '--no-privileges'], { env: pgEnv })

  let stderr = ''
  let started = false
  child.stderr.on('data', (d) => { stderr += d.toString() })

  child.on('error', (err) => {
    logger.error('[backup] pg_dump spawn failed', { msg: err.message })
    if (!res.headersSent) res.status(500).json({ error: 'Backup failed to start' })
  })

  // If the client disconnects mid-stream, stop pg_dump rather than let it run on.
  req.on('close', () => {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
  })

  child.stdout.once('data', () => {
    if (started) return
    started = true
    res.setHeader('Content-Type', 'application/sql')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  })
  child.stdout.pipe(res)

  child.on('close', (code) => {
    if (code !== 0) {
      logger.error('[backup] pg_dump exited non-zero', { code, stderr: stderr.slice(0, 500) })
      if (!res.headersSent) res.status(500).json({ error: 'Backup failed' })
      else res.destroy() // truncate the stream so the client sees a broken download
    } else {
      logger.info('[backup] completed', { filename })
    }
  })
})

export default router
