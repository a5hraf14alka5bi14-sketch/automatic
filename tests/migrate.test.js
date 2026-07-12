// Migration runner safety — idempotency and concurrency.
import { describe, it, expect, afterAll } from 'vitest'
import { runMigrations } from '../server/migrate.js'
import { pool } from '../server/db.js'

afterAll(async () => { await pool.end() })

describe('runMigrations', () => {
  it('records each migration exactly once when run repeatedly', async () => {
    await runMigrations(pool)
    const first = await pool.query('SELECT version FROM schema_migrations ORDER BY version')
    // Second run must be a no-op (already applied) and not duplicate rows.
    const res = await runMigrations(pool)
    expect(res.applied).toEqual([])
    const second = await pool.query('SELECT version FROM schema_migrations ORDER BY version')
    expect(second.rows).toEqual(first.rows)
  })

  it('is safe under concurrent runs (advisory lock serializes them)', async () => {
    // Two simultaneous runners must not throw on a unique-version race.
    const results = await Promise.all([runMigrations(pool), runMigrations(pool)])
    for (const r of results) expect(Array.isArray(r.applied)).toBe(true)
    const rows = await pool.query('SELECT version, COUNT(*)::int AS c FROM schema_migrations GROUP BY version')
    for (const row of rows.rows) expect(row.c).toBe(1)
  })
})
