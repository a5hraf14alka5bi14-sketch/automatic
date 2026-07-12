# Production Deployment Checklist

This document walks through every step required to get the Automatic Restaurant OS running safely in production. Follow it top-to-bottom on every fresh deploy or major update.

---

## 1 · Required Secrets

Set all of the following in Replit Secrets (or your host's environment-variable manager) **before** starting the server. The app refuses to start if `DATABASE_URL` or `SESSION_SECRET` are absent.

| Secret | Purpose | Notes |
|--------|---------|-------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db?sslmode=require` |
| `SESSION_SECRET` | JWT + cookie signing key | Minimum 32 random bytes. Rotate = all sessions invalidated. |
| `RESET_ADMIN_PASSWORD` | Seeds / resets the default admin account on startup | Remove after first login. |
| `GITHUB_TOKEN` | GitHub repo sync | PAT with `repo` scope |
| `NOTION_API_KEY` | Notion integration | Internal Integration token |
| `OPENAI_API_KEY` | AI Executive insights | Optional — features degrade gracefully if absent |
| `FCM_SERVICE_ACCOUNT` | Push notifications | Optional — no-op when unset |
| `SENTRY_DSN` | Error monitoring | Optional — recommended for production |
| `ALLOWED_ORIGIN` | Extra CORS origin | Only if frontend and API are on separate domains |

---

## 2 · Pre-Deploy Checks

Run these locally (or in CI) before shipping:

```bash
# 1. No committed credentials
npm run scan:secrets

# 2. Security lint (SAST)
semgrep scan --config .config/.semgrep/semgrep_rules.json --severity ERROR --error \
  --metrics off --exclude node_modules --exclude dist server src

# 3. Unit + integration tests — all must be green
npm test

# 4. Frontend build succeeds
npm run build
```

---

## 3 · Database

- Migrations run **automatically** at server startup via `server/migrate.js`.
- Verify migrations are current: `GET /api/admin/health` → `checks.migrations.latest`.
- Run `scripts/init-db.js` for a brand-new database (sets baseline schema then runs all migrations).
- Before restoring a backup to prod, take a fresh backup first.
- The backup download endpoint: `GET /api/admin/backups/download` (admin only, streams `pg_dump` output).

---

## 4 · First-Boot Steps

1. Set `RESET_ADMIN_PASSWORD` and publish/start the server.
2. The startup block creates (or resets) `admin@restaurant.com` with `must_change_password = true`.
3. Log in at the app URL → you will be forced to change the password before proceeding.
4. **Remove `RESET_ADMIN_PASSWORD`** from Replit Secrets (or set it to a blank value) and republish so it is no longer active.
5. Configure restaurant name, tax rate, currency, tables count in **Settings → General**.
6. Add any additional staff accounts in **Settings → Staff**.

---

## 5 · Post-Deploy Verification

After publishing, confirm each of the following:

```
GET /api/health              → { status: "ok", db: "ok" }
GET /                        → 200  (serves the React SPA shell)
GET /api/public/menu         → 200  (public menu — no auth needed)
```

Visit the admin health dashboard at **System → Health** in-app to see:

- Database latency and pool status
- Heap memory usage
- Applied migration version
- Required env-var presence (`DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`)

---

## 6 · Security Hardening Checklist

- [ ] `NODE_ENV=production` is set in the deployment environment.
- [ ] `SESSION_SECRET` is at least 32 random bytes (never the default `changeme`).
- [ ] `RESET_ADMIN_PASSWORD` was removed after first boot.
- [ ] HTTPS / TLS is terminating in front of the server (Replit Deployments handles this automatically).
- [ ] Default admin password has been changed (`must_change_password` cleared).
- [ ] TOTP / 2FA enabled on the admin account (Settings → Profile → Two-Factor).
- [ ] Backup download tested and a recent dump is stored off-site.
- [ ] Sentry DSN configured so errors surface in production.
- [ ] `scan:secrets` passes clean on the latest commit.

---

## 7 · Rollback

Replit maintains automatic checkpoints. To roll back:

1. Open the Replit checkpoint picker.
2. Select the last known-good checkpoint.
3. Restore — the database is also checkpointed alongside the code.

For data-only rollback, restore a SQL backup via **System → Restore Database**.

---

## 8 · Ongoing Operations

| Task | Frequency | How |
|------|-----------|-----|
| Backup verification | Weekly | Download backup, restore to staging, run smoke tests |
| Dependency audit | Monthly | `npm audit` |
| Secret scan | Every commit | Pre-commit hook + CI |
| Stocktake | As needed | Inventory → Stocktake tab |
| AI summary | Daily | Integrations → OpenAI → Generate |

---

## 9 · Environment Variable Quick Reference

```
# Minimum production set
DATABASE_URL=postgres://...
SESSION_SECRET=<32+ random bytes>
NODE_ENV=production
PORT=5000                      # Replit sets this automatically

# Optional but recommended
SENTRY_DSN=https://...
ALLOWED_ORIGIN=https://custom-domain.com
FCM_SERVICE_ACCOUNT=<JSON string>
```
