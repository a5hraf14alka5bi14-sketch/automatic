---
name: Production admin password recovery
description: How to recover a forgotten/changed admin password on the deployed app; dev vs prod DB separation
---

# Production admin password recovery

Development and production use **separate PostgreSQL databases**. A password reset
applied to the dev DB (e.g. via a node script or executeSql) does NOT affect the
published app. Confirmed by: setting `must_change_password=true` in dev while prod
still read `false`.

Tooling (`executeSql environment:"production"`) is **read-only** against a prod
replica — you cannot UPDATE the production DB directly.

**Recovery path** (owner-driven):
1. Startup seed in `server/db.js` checks `process.env.RESET_ADMIN_PASSWORD`. When
   set, it resets `admin@automatic.com` to that value with
   `must_change_password=true` on boot.
2. Owner sets `RESET_ADMIN_PASSWORD` as a **deployment secret** and republishes.
3. Log in with admin@automatic.com + that value, set a new password when forced.
4. Remove the secret afterward (otherwise every restart re-resets + forces change).

**Why:** the app has no self-service password reset UI, and prod DB is not
writable from agent tooling, so an env-gated startup reset + republish is the only
owner-controlled recovery route.
