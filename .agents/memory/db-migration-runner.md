---
name: DB migration runner
description: How versioned schema migrations work and why db.js stays the baseline
---

Versioned migrations live as numbered `.sql` files in `server/migrations/`
(e.g. `001_soft_delete.sql`), applied once in filename order by
`server/migrate.js` `runMigrations(pool)`, tracked in `schema_migrations`.
Called after `initDb()` on startup (only when index.js is the entry point).

**Why:** `db.js` `initDb()` remains the idempotent baseline (CREATE TABLE IF NOT
EXISTS + ALTER ADD COLUMN IF NOT EXISTS). NEW schema changes go through the
migration runner instead of piling more ad-hoc ALTERs into initDb, so changes
are versioned and auditable.

**How to apply:** add a new `NNN_name.sql`; it runs on next startup. Each file
runs in its own transaction. Concurrency is handled by a session-level Postgres
advisory lock (fixed key) around the whole run, plus `INSERT ... ON CONFLICT DO
NOTHING` on the version row — two instances starting at once won't race/fail.
Don't remove the advisory lock; parallel startups will otherwise crash on the
unique version insert.
