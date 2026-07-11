// Admin-only operational endpoints: metrics, audit log, on-demand DB backup,
// and scheduled-backup list/download.
import { Router }                                   from 'express'
import { spawn }                                    from 'node:child_process'
import { createReadStream, existsSync }              from 'node:fs'
import multer                                       from 'multer'
import { requireRole }                              from '../middleware/auth.js'
import { pool }                                     from '../db.js'
import { getMetrics }                               from '../lib/observability.js'
import { logger }                                   from '../logger.js'
import { listBackups, backupFilePath, runBackup }   from '../lib/backup-scheduler.js'
import { performFactoryReset }                      from '../lib/factory-reset.js'
import { broadcast }                                from '../events.js'
import { getHealth }                                from '../lib/health-monitor.js'
import { readReleaseLogStatus }                     from '../lib/release-log-status.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } })

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

// ── Scheduled-backup list, on-demand trigger, and single-file download ────────
router.get('/backups', (_req, res) => {
  res.json(listBackups())
})

router.post('/backups/run', async (_req, res) => {
  try {
    const result = await runBackup()
    res.json({ ok: true, filename: result.filename })
  } catch (err) {
    logger.error('[backup] manual trigger failed', { msg: err.message })
    res.status(500).json({ error: err.message })
  }
})

router.get('/backups/:name', (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, '')
  if (!name.endsWith('.sql')) return res.status(400).json({ error: 'Invalid backup name' })
  const fp = backupFilePath(name)
  if (!existsSync(fp)) return res.status(404).json({ error: 'Not found' })
  res.setHeader('Content-Type', 'application/sql')
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
  createReadStream(fp).pipe(res)
})

// ── Factory reset (operational data only) ─────────────────────────────────────
// Irreversible except via the automatic backup taken first. Requires the
// literal confirmation string "RESET" in the body. inventoryMode:
//   'zero' — zero all inventory quantities (fresh opening stock entered later)
//   'keep' — keep current quantities and record them as the opening stock
router.post('/factory-reset', async (req, res) => {
  const { confirm, inventoryMode = 'keep' } = req.body || {}
  if (confirm !== 'RESET') {
    return res.status(400).json({ error: 'Confirmation required: send { "confirm": "RESET" }' })
  }
  if (!['zero', 'keep'].includes(inventoryMode)) {
    return res.status(400).json({ error: 'inventoryMode must be "zero" or "keep"' })
  }

  // 1. Mandatory automatic backup BEFORE any deletion — abort if it fails.
  let backupFile
  try {
    const b = await runBackup()
    backupFile = b.filename
  } catch (err) {
    logger.error('[factory-reset] pre-reset backup failed — aborting', { msg: err.message })
    return res.status(500).json({ error: 'Backup failed — factory reset aborted. Nothing was deleted.' })
  }

  // 2. Wipe operational data in a single transaction.
  try {
    const result = await performFactoryReset(pool, { inventoryMode })
    logger.info('[factory-reset] completed', { by: req.user?.email, backup: backupFile, ...result.deleted })

    // 3. Nudge every open page to refetch instantly.
    broadcast('factory_reset', { at: Date.now() })
    broadcast('order_updated', { action: 'factory_reset' })
    broadcast('inventory_updated', { action: 'factory_reset' })
    broadcast('menu_updated', { action: 'factory_reset' })

    res.json({ ok: true, backup: backupFile, ...result })
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message })
    logger.error('[factory-reset] failed — transaction rolled back', { msg: err.message })
    res.status(500).json({ error: 'Factory reset failed — all changes were rolled back. Data is intact.' })
  }
})

// ── Release Log sync status ──────────────────────────────────────────────────
// Surfaces a skipped post-merge Release Log sync (package.json version doesn't
// match CHANGELOG.md's newest entry) so it's visible in-app, not just in merge
// logs. Returns { versionMismatch: false } when everything is in sync.
router.get('/release-log-status', async (_req, res, next) => {
  try {
    const status = await readReleaseLogStatus()
    res.json(status || { versionMismatch: false })
  } catch (err) {
    next(err)
  }
})

// ── Health check ──────────────────────────────────────────────────────────────
router.get('/health', async (_req, res, next) => {
  try {
    const h = await getHealth()
    res.status(h.ok ? 200 : 503).json(h)
  } catch (err) { next(err) }
})

// ── Backup restore (upload .sql → psql) ───────────────────────────────────────
router.post('/backups/restore', upload.single('backup'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  if (!req.file.originalname.endsWith('.sql')) return res.status(400).json({ error: 'Only .sql files accepted' })

  const url = process.env.DATABASE_URL
  if (!url) return res.status(500).json({ error: 'DATABASE_URL not configured' })

  let pgEnv
  try {
    const u = new URL(url)
    pgEnv = {
      ...process.env,
      PGHOST: u.hostname, PGPORT: u.port || '5432',
      PGUSER: decodeURIComponent(u.username),
      PGPASSWORD: decodeURIComponent(u.password),
      PGDATABASE: u.pathname.replace(/^\//, ''),
    }
    const sslmode = u.searchParams.get('sslmode')
    if (sslmode) pgEnv.PGSSLMODE = sslmode
  } catch (err) {
    return res.status(500).json({ error: 'Invalid DATABASE_URL' })
  }

  logger.warn('[restore] starting DB restore from uploaded file', { filename: req.file.originalname, bytes: req.file.size })
  const child = spawn('psql', ['--no-password', '-q'], { env: pgEnv })
  let stderr = ''
  child.stderr.on('data', d => { stderr += d.toString() })
  child.stdin.write(req.file.buffer)
  child.stdin.end()

  child.on('close', (code) => {
    if (code !== 0) {
      logger.error('[restore] psql exited non-zero', { code, stderr: stderr.slice(0, 500) })
      return res.status(500).json({ error: 'Restore failed', detail: stderr.slice(0, 300) })
    }
    logger.info('[restore] restore completed', { filename: req.file.originalname })
    res.json({ ok: true, message: 'Database restored successfully' })
  })

  child.on('error', (err) => {
    logger.error('[restore] psql spawn failed', { msg: err.message })
    if (!res.headersSent) res.status(500).json({ error: 'Restore failed to start' })
  })
})

export default router
