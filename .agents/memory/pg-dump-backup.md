---
name: pg_dump backup credential passing
description: How to invoke pg_dump from Node/scripts without leaking DB credentials, and the PGDATABASE gotcha
---

# pg_dump backup credentials

When spawning `pg_dump` from the backup admin endpoint (`server/routes/admin.js`),
derive individual libpq env vars from `DATABASE_URL` and pass them via the child
process `env` — do NOT put the DSN in argv.

Parse with `new URL(DATABASE_URL)` → `PGHOST`, `PGPORT` (`u.port || '5432'`),
`PGUSER`/`PGPASSWORD` (both `decodeURIComponent`), `PGDATABASE` (`pathname` without
leading `/`), and `PGSSLMODE` from `?sslmode=`. Then `spawn('pg_dump',
['--no-owner','--no-privileges'], { env })` with no connection argument.

**Why:** Passing the full DSN as an argv (`pg_dump "$DATABASE_URL"`) leaks the
password into the host process listing. Also stream pg_dump stdout to the response
and kill the child on `req.on('close')` so an aborted download doesn't leave it running.

**Gotcha (cost me a broken run):** `PGDATABASE=$DATABASE_URL` does NOT work — libpq
only expands a connection URI/conninfo when it arrives via the `dbname`/`-d`
*parameter*, not via the `PGDATABASE` environment variable. Setting `PGDATABASE` to a
full URL makes pg_dump look for a database literally named by the whole URL and fail
("database ... does not exist"). Use the parsed individual `PG*` vars instead.

The local `scripts/backup.sh` still passes the DSN as an arg (argv exposure is
low-risk on a dev/CI box); the hardening only matters for the long-lived server process.
