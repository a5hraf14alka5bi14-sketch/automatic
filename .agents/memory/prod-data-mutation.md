---
name: One-time production data mutations
description: How to perform one-off data changes on the live/prod DB when tooling can only read it
---

# One-time production data mutations

The production database is **read-only to agent tooling** (executeSql with
`environment:"production"` only runs SELECTs; there is no direct write path).
To mutate live data (e.g. clear all inventory, reset a password), use an
**env-flag-gated startup block** in `server/db.js` — the same shape as the
former `RESET_ADMIN_PASSWORD` and the `CLEAR_INVENTORY` cleanup.

**Procedure:**
1. Add a guarded block in `server/db.js` init: `if (process.env.FLAG === 'true') { ...UPDATE... }` with a warning log of the affected row count.
2. `setEnvVars({ values:{FLAG:'true'}, environment:'production' })` — set it **production-only** so dev is untouched.
3. Have the user **Publish**. The block runs on prod startup and does the mutation. (One publish can also carry any pending schema migration, since `runMigrations` runs on startup too.)
4. Verify via a production SELECT.
5. Remove the block from `server/db.js` **and** `deleteEnvVars({ keys:['FLAG'], environment:'production' })`.
6. Have the user Publish once more to sync the cleaned-up code.

**Why:** the flag-gated block clears on *every* boot while the flag is set, so
newly added rows would be wiped on the next restart/deploy. Deleting the flag
(step 5) makes prod safe immediately even before the final republish; the second
publish is just code hygiene to drop the dead block.

**Gotchas:**
- `deleteEnvVars` param is `keys`, not `names`.
- Dev/prod DBs are separate — a DEV data change (e.g. soft-deleting inventory) does NOT propagate to prod; it must be redone against prod via this flow.
- The prod read replica reflects the *last deployed* state, so a SELECT showing old data usually means the publish hasn't run yet, not that the mutation failed.
