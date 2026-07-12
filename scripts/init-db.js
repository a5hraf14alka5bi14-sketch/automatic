// One-shot DB bootstrap for CI and fresh environments: baseline schema + migrations.
import { initDb, pool } from '../server/db.js'
import { runMigrations } from '../server/migrate.js'

;(async () => {
  await initDb()
  const r = await runMigrations(pool)
  console.log('DB initialized. Migrations applied:', r.applied)
  await pool.end()
})().catch((err) => {
  console.error('DB init failed:', err)
  process.exit(1)
})
