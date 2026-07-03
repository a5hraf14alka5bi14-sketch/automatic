---
name: Production deployment serving (single-port)
description: What makes the autoscale deployment healthcheck pass for this app (port, CORS, static-before-auth)
---

# Deploying this app (dev is 2 ports, prod is 1)

Dev runs Vite (client) on 5000 and Express (API) on 3001, with Vite proxying `/api` and `/ws` → 3001. Production has NO Vite dev server: the built `dist/` is served by Express, so the whole app (frontend + API + WebSocket) runs on ONE port. Deployment (`[deployment]` in `.replit`) is `build=npm run build`, `run=node server/index.js`, autoscale, and forwards external 80 → localPort 5000.

Three things must hold or the autoscale healthcheck (`GET /`) fails and publish is rejected:

1. **Listen on port 5000 in production.** `server/index.js` PORT = `process.env.PORT || (IS_PROD ? 5000 : 3001)`. A hardcoded 3001 means port 5000 never opens → "required port was never opened, expected port 5000".
2. **Do not hard-crash when `ALLOWED_ORIGIN` is unset.** Prod serves frontend + API same-origin, so CORS isn't needed; use `origin: IS_PROD ? (process.env.ALLOWED_ORIGIN || false) : true`. The old code did `process.exit(1)` when `ALLOWED_ORIGIN` was missing, which killed the process before the port opened.
3. **Serve `dist/` (static + SPA fallback) BEFORE the global `app.use(verifyToken)`.** Otherwise `GET /` and every page route hit auth and return 401, so the healthcheck on `/` fails. The SPA fallback must skip `/api/` and non-GET so API routes stay gated. `/api/*` remains protected because it's registered after verifyToken.

**Why:** `initDb → migrations → server.listen` runs sequentially, so ANY startup throw (bad port, CORS exit, DB failure) prevents the port from opening and shows only generic healthcheck 500s in deploy logs. Reproduce locally with `NODE_ENV=production PORT=<free> node server/index.js` then curl `/`, `/api/health` (public 200), `/api/menu` (protected 401).

## Replit deploy does NOT set NODE_ENV — use REPLIT_DEPLOYMENT
Symptom: deployed app logs `{"env":"development"}`, `/` healthcheck 500/401s, built frontend never served.
**Why:** Replit Deployments do not auto-set `NODE_ENV`; the `if (IS_PROD)` static-serving/SPA-fallback block was gated on `NODE_ENV==='production'` only, so in deploy IS_PROD=false.
**Fix:** `IS_PROD = process.env.NODE_ENV==='production' || process.env.REPLIT_DEPLOYMENT==='1'`. REPLIT_DEPLOYMENT is '1' only in published apps, unset in dev.
Also: dev and prod share the SAME DATABASE_URL (no separate prod DB) — data/user changes in dev show in prod. Admin login broke because seeded admin password had been changed (must_change_password=false, Admin123 no longer matched); reset via bcrypt UPDATE + must_change_password=true. Note: users table has NO updated_at column.
