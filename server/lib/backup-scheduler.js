/**
 * Automated database backup scheduler.
 * Runs pg_dump daily and keeps the last MAX_BACKUPS files in backups/.
 * Uses the same credential-parsing approach as admin.js so DATABASE_URL works.
 */
import { spawn }                                        from 'node:child_process'
import { createWriteStream, mkdirSync, existsSync,
         readdirSync, statSync, unlinkSync }            from 'node:fs'
import path                                             from 'node:path'
import { fileURLToPath }                                from 'node:url'
import { logger }                                       from '../logger.js'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const BACKUP_DIR = path.join(__dirname, '../../backups')
const MAX_BACKUPS = 7
const INTERVAL_MS = 24 * 60 * 60 * 1000   // 24 h

let _timer = null

function ensureDir() {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
}

function pruneOld() {
  try {
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => ({ name: f, mtime: statSync(path.join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime)
    for (const f of files.slice(MAX_BACKUPS)) {
      unlinkSync(path.join(BACKUP_DIR, f.name))
      logger.info(`[backup] pruned: ${f.name}`)
    }
  } catch (e) {
    logger.error('[backup] prune error', { msg: e.message })
  }
}

export function listBackups() {
  ensureDir()
  try {
    return readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => {
        const st = statSync(path.join(BACKUP_DIR, f))
        return { name: f, size: st.size, created_at: st.mtime.toISOString() }
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  } catch { return [] }
}

export function backupFilePath(name) {
  return path.join(BACKUP_DIR, path.basename(name))
}

export function runBackup() {
  return new Promise((resolve, reject) => {
    ensureDir()
    const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `backup-${ts}.sql`
    const filepath = path.join(BACKUP_DIR, filename)

    const dbUrl = process.env.DATABASE_URL || ''
    const pgEnv = { ...process.env }
    try {
      const u = new URL(dbUrl)
      pgEnv.PGHOST     = u.hostname
      pgEnv.PGPORT     = u.port || '5432'
      pgEnv.PGUSER     = u.username
      pgEnv.PGPASSWORD = decodeURIComponent(u.password)
      pgEnv.PGDATABASE = u.pathname.slice(1).split('?')[0]
      const ssl = u.searchParams.get('sslmode')
      if (ssl) pgEnv.PGSSLMODE = ssl
    } catch { /* rely on PG* env vars already set */ }

    const child = spawn('pg_dump', ['--no-owner', '--no-privileges', '--format=plain'], { env: pgEnv })
    const out   = createWriteStream(filepath)
    child.stdout.pipe(out)

    let stderr = ''
    child.stderr.on('data', d => { stderr += d })
    child.on('error', err => {
      reject(new Error(`pg_dump not available: ${err.message}`))
    })
    child.on('close', code => {
      if (code !== 0) {
        try { unlinkSync(filepath) } catch { /* ignore */ }
        return reject(new Error(`pg_dump exited ${code}: ${stderr.slice(0, 300)}`))
      }
      pruneOld()
      logger.info(`[backup] done: ${filename}`)
      resolve({ filename, path: filepath })
    })
  })
}

export function startBackupScheduler() {
  if (_timer) return
  const tick = async () => {
    try {
      const { filename } = await runBackup()
      logger.info(`[backup] scheduled backup saved: ${filename}`)
    } catch (err) {
      logger.error('[backup] scheduled backup failed', { msg: err.message })
    }
  }
  // First run after 30 s (give the server time to fully start), then every 24 h
  const warmup = setTimeout(() => {
    tick()
    _timer = setInterval(tick, INTERVAL_MS)
    if (_timer.unref) _timer.unref()
  }, 30_000)
  if (warmup.unref) warmup.unref()
  logger.info('[backup] scheduler started — daily, keeping last 7 backups')
}

export function stopBackupScheduler() {
  if (_timer) { clearInterval(_timer); _timer = null }
}
