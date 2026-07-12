// Lightweight versioned migration runner.
//
// db.js remains the idempotent baseline schema. NEW schema changes live as
// numbered .sql files in server/migrations/ (e.g. 001_soft_delete.sql) and are
// applied exactly once, in filename order, each inside its own transaction.
// Applied versions are tracked in the schema_migrations table.
//
// Concurrency: a session-level Postgres advisory lock serializes migration runs
// across processes, so two instances starting simultaneously can't race to
// apply (and fail on) the same migration. The advisory lock is advisory only —
// the ON CONFLICT insert is a second safety net.

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from './logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

// Arbitrary but fixed 64-bit key so every instance contends on the same lock.
const ADVISORY_LOCK_KEY = 947218364

export async function runMigrations(pool) {
  let files
  try {
    files = (await readdir(MIGRATIONS_DIR))
      .filter(f => f.endsWith('.sql'))
      .sort()
  } catch (err) {
    if (err.code === 'ENOENT') return { applied: [] }
    throw err
  }

  const lockClient = await pool.connect()
  const applied = []
  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])

    await lockClient.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `)

    for (const file of files) {
      const version = file.replace(/\.sql$/, '')
      const exists = await lockClient.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version])
      if (exists.rows.length) continue

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
      try {
        await lockClient.query('BEGIN')
        await lockClient.query(sql)
        await lockClient.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
          [version]
        )
        await lockClient.query('COMMIT')
        applied.push(version)
        logger.info(`[migrate] applied ${version}`)
      } catch (err) {
        await lockClient.query('ROLLBACK')
        logger.error(`[migrate] failed ${version}`, { msg: err.message })
        throw err
      }
    }
    return { applied }
  } finally {
    try { await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]) } catch { /* releasing on close */ }
    lockClient.release()
  }
}
