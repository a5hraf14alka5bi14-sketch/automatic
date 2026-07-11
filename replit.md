# Automatic Restaurant OS

## Order Integrity hardening — 2026-07-09

Closed remaining order-tampering gaps (Task #134). Order repricing/loyalty
caps existed already; this pass fixed: split-payment now runs in a
transaction with `FOR UPDATE`, rejects payments on completed/cancelled
orders, caps each payment to the outstanding balance, and completes
fully-paid orders through the SAME side-effect path as
`PATCH /:id/status` via the shared `applyCompletionEffects()` helper
(inventory deduction + stock movements + customer accounting — no bypass).
`loyalty_discount` is now always written on completion (explicit 0) and
cleared when an order leaves completed, so stale markers can't over-refund
points. `PATCH /:id/discount` caps percent ≤100 / fixed ≤ subtotal.
Tests: `tests/order-integrity.test.js` (9 cases). Suite 461 tests green.

## Replit Auth as additional web sign-in — 2026-07-09

"Sign in with Replit" (OIDC) added ALONGSIDE the existing email/password JWT
auth — not a replacement, no auto-account-creation (RBAC preserved). Flow:
`/api/login` → Replit OIDC → `/api/callback` matches an EXISTING staff account
by previously-linked `users.replit_sub`, else by **verified** email
(`email_verified === true` required), links the sub, mints the normal app JWT
cookies via `makeTokens`/`setAuthCookies`, destroys the handshake session and
redirects `/`. Unmatched → `/?replit_auth=unmatched` (Arabic error on Login).
Host allowlist: callback hostname must be in `REPLIT_DOMAINS` (+localhost in
dev) — unknown Host header → 403. Session store: `sessions` table (migration
016, handshake-only, 15 min TTL). Button web-only (hidden on Capacitor/
Electron/`VITE_API_BASE_URL` builds). Files: `server/routes/replitAuth.js`,
migration `016_replit_auth.sql`, `tests/replit-auth.test.js` (9 cases).
Suite 509/509.

## Menu-impact endpoint restricted to management — 2026-07-08

Explicit RBAC decision: `GET /api/inventory/impact` (low-stock ingredients →
affected dishes) is now `requireRole('admin','manager')`, matching its sibling
endpoints (`/stats`, `/movements`) and the Recipes food-cost endpoints. Although
it has no cost figures, it exposes recipe composition (ingredient→dish links +
required quantities), which is management data. The Inventory "Impact" tab
already shows a graceful "Access restricted" panel on 403 for other roles.
Tests added in `tests/rbac-financial-visibility.test.js` (cashier/staff 403,
manager 200). Suite 491/491.

## Electron packaged-startup smoke test — 2026-07-08

`npm run electron:smoke` (`scripts/electron-smoke.mjs`, uses `playwright-core`)
launches the real Electron shell against the built `dist/` and asserts the
`app://bundle` window renders `#root` + the login screen with no fatal renderer
errors; it also detects/warns on a missing baked `VITE_API_BASE_URL`. Must run
on Windows/macOS (exits with a clear message on Replit/Linux). Documented in
`NATIVE_BUILD.md` alongside the manual smoke checklist.

## Managed kitchen stations — 2026-07-08

Kitchen stations are now a managed list instead of being inferred from order
data:

- **DB:** `stations` table (migration 015, seeded kitchen/bar/drinks + any
  station names found in order data) and a `menu_items.station` column
  (NULL = auto category routing via `stationForCategory`).
- **API:** `/api/stations` — GET (active list, any role), GET `/all`, POST
  (create or reactivate retired same-name → 200), PATCH (rename/retire) all
  admin/manager-only; names normalised to slugs (lowercase, hyphenated);
  duplicates → 409; broadcasts `stations_updated`. `server/lib/stations.js`
  caches the sets (30s, invalidated on mutation).
- **Semantics:** filter dropdowns show active managed stations only;
  `?station=` validation also tolerates retired + legacy data values (old
  links never 400); order create silently coerces unknown/inactive stations
  to `kitchen`; menu POST/PATCH validate `station` against the active set
  ('' / null clears back to auto).
- **UI:** Settings → Operations gained a "Kitchen Stations" manager
  (add/rename/retire/reactivate); Menu item form has a station select ("Auto
  (by category)" default); Kitchen refetches its filter live on
  `stations_updated`.
- **Tests:** suite 461/461 passing (new `tests/stations.test.js`, 20 cases;
  the old data-driven station test rewritten to the managed semantics).

## Enterprise audit + production hardening — 2026-07-08

Full enterprise audit pass (security headers, CORS, rate limiting, validation,
SQL parameterization, JWT config, indexes, bundle, integrations, RBAC) —
verdict **Production Ready with Conditions (91%)**. Fixes shipped:

- **Migration 015:** 8 previously-missing FK-column indexes (partial where
  nullable): `orders.shift_id`/`voided_by`, `inventory.supplier_id`,
  `shifts.opened_by`/`closed_by`, `purchase_orders.created_by`,
  `purchase_order_items.purchase_order_id`, `notion_github_links.notion_project_id`.
- **Input guards:** type/length caps on `POST /api/auth/login` body
  (email ≤254, password ≤512, totp ≤16) and push token register/unregister
  (≤4096 chars, platform whitelisted to ios/android/web).
- **GitHub `main` = `fdaf07c`** — byte-matches workspace (incl. semgrep-gated
  ci.yml). Notion: audit page "🛡️ Enterprise Audit & Production Hardening —
  2026-07-08" added under the main page.
- Suite 447/447; build 2.8s; secret scan clean (309 files).
- **Remaining conditions:** physical stocktake (186 items never counted),
  OpenAI quota exhausted (key valid), Task #95 (kitchen stations) pending
  merge, prod backup-restore drill not yet performed.

## Stocktake tooling for real ingredient counts — 2026-07-07

## Changelog

Older dated changelog sections (2026-07-06 → 2026-07-07: stocktake tooling, RBAC
financial review, bilingual menu, iOS icon fixes, install button, splash,
Argon2id, native auth+push, Capacitor/Electron packaging) are archived in
`docs/changelog-archive.md`. Newest work is summarized above; details of each
subsystem live in the memory topic files and docs/.

## Current Version: v0.12.0 — Comprehensive Quality Pass (2026-07-06)

| | |
|---|---|
| **Release** | v0.12.0 — Comprehensive quality, performance & accessibility pass |
| **Test suite** | 298/298 passing |
| **Migrations** | 012 applied (perf indexes: orders status+created_at, inventory low-stock, order_items) |
| **Inventory** | 82 active items · 7 categories · 3 suppliers (all linked) |
| **Purchases** | 10 purchase orders (PO#1–#10) · 150 line items · OMR 2624.360 total |
| **Security** | RBAC fixed for cashier stock-availability · error messages sanitized · no raw API errors to client |
| **Orders** | Full-history filters + counts · server-side search (id/table/customer) · auto-open on exact match · bad filter → 400 |
| **AI Insights** | Executive insights compute KPIs server-side from DB (parameterized queries, no client-trust) |
| **Accessibility** | aria-labels on qty +/- buttons · split-bill +/- · sidebar collapse toggle · aria-live on qty display |
| **Mobile** | overflow-x-auto wrapper on Voids report table |
| **Logging** | console.log/warn in index.js, notion.js push functions → structured logger |
| **Notion** | Release Log DB created + auto-synced from CHANGELOG on merge · Notion REST bot confirmed read/write |

---

## Project Overview

Full-stack restaurant management system built with React 19 + Vite (port 5000) and Express (port 3001) backed by PostgreSQL.

### Stack
- **Frontend:** React 19, Vite, Tailwind CSS v4 (`@tailwindcss/postcss`, `@import "tailwindcss"` + `@config`) — served on port 5000
- **Backend:** Express 5 (ESM, `"type":"module"`) — served on port 3001 (localhost only)
- **Database:** PostgreSQL via `DATABASE_URL` environment variable
- **Run command:** `npm run dev` (concurrently runs server + client)

### Key pages
| Route (sidebar) | Page file |
|---|---|
| Dashboard | `src/pages/Dashboard.jsx` |
| Point of Sale | `src/pages/POS.jsx` |
| Orders | `src/pages/Orders.jsx` |
| Kitchen | `src/pages/Kitchen.jsx` |
| Inventory | `src/pages/Inventory.jsx` |
| Customers | `src/pages/Customers.jsx` |
| Reports | `src/pages/Reports.jsx` |
| Integrations | `src/pages/Integrations.jsx` |
| Notion Sync | `src/pages/NotionIntegration.jsx` |
| System (admin) | `src/pages/System.jsx` — metrics, on-demand backup download, audit log (admin-only) |

> **Large pages are split into components.** `POS.jsx` and `Reports.jsx` grew too
> large to stay single-file, so their sub-components live in `src/components/pos/`
> and `src/components/reports/` (the page file keeps all state/data-fetching and
> passes props down). See the User Preferences note below.

### Server structure
```
server/
  index.js              — Express entry point (port 3001); exports { app } for tests
  db.js                 — PostgreSQL pool + baseline schema init
  migrate.js            — versioned migration runner (advisory-locked)
  migrations/           — numbered .sql migrations (001_soft_delete, …)
  lib/
    units.js            — unit conversion (kg↔g, L↔ml, dozen↔pcs)
    inventory.js        — pure stock-deduction math (convert + clamp)
    observability.js    — requestLogger middleware + getMetrics() counters
    audit.js            — auditMutations middleware (records successful mutations, best-effort)
  notion.js             — Notion client + helpers
  integrations/
    github.js           — GitHub API client
    openai.js           — OpenAI API client
  routes/
    auth.js             — JWT auth
    integrations.js     — GitHub / Notion / OpenAI hub
    admin.js            — admin-only: GET /metrics, /audit, /backup (pg_dump stream)
    notion.js           — Notion projects & tasks CRUD
    menu.js / orders.js / inventory.js / customers.js / dashboard.js / reports.js
```

### Required secrets (Replit Secrets)
| Secret | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection (auto-provisioned by Replit) |
| `SESSION_SECRET` | JWT signing key |
| `GITHUB_TOKEN` | GitHub PAT for repo sync |
| `NOTION_API_KEY` | Notion internal integration token |
| `OPENAI_API_KEY` | OpenAI API key for AI features |

### Default admin (first-run)
- Email and seed password are provisioned via Replit Secrets and are **not documented here** to avoid leaking credentials into version control.
- The seeded admin is created with `must_change_password=true`, so the app forces a password change on first login. Credentials are never shown in the UI.

---

### Secret scanning (pre-commit + CI)
A GitHub PAT once leaked via `.replit`, forcing a token rotation. To stop this recurring, `scripts/scan-secrets.js` scans for real credential shapes — `github_pat_`, `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`, OpenAI `sk-`/`sk-proj-`, Slack `xox*`, AWS `AKIA*`, PEM private keys, and JWTs.

- **Pre-commit hook:** installed automatically by `npm install` (via `postinstall` → `scripts/install-git-hooks.sh`, which copies `scripts/git-hooks/pre-commit` into `.git/hooks/`). It scans **staged** content and blocks the commit on a hit. Run `bash scripts/install-git-hooks.sh` manually if hooks aren't present.
- **CI / on-demand:** `npm run scan:secrets` (`node scripts/scan-secrets.js --all`) scans every tracked file; it also runs as the first CI step in `.github/workflows/ci.yml`.
- **Full-history sweep:** `npm run scan:secrets:history` (`node scripts/scan-secrets.js --history`) walks every blob in every commit (deduped by blob SHA) and attributes any hit back to its commit(s)/path(s). Read-only.
- **Excluded (known-safe):** `.env.example` placeholders, `.config/.semgrep/**` detection regexes, `package-lock.json`, `node_modules/`, `dist/`, `build/`, `coverage/`, and binary assets. Obvious placeholders (`xxxx`, `change_me`, `your_…`, `<…>`) are ignored.
- **Intentional bypass:** add a `pragma: allowlist secret` comment on the offending line (per-line), or set `SKIP_SECRET_SCAN=1` / use `git commit --no-verify` (whole commit).
- **History sweep result (2026-07-05):** swept all commits; the **only** credential-shaped hit is the already-known, already-rotated GitHub PAT in `.replit` (historical commits `376fb7a`/`61f1a3f` only — HEAD's `.replit` is clean). No other live secrets are exposed anywhere in history. The rotated PAT is dead, so no further rotation is needed. Because git history is platform-managed in this environment (an isolated task agent cannot rewrite/force-push shared history), the dead blob is **allowlisted by its content-addressed blob SHA** (`ALLOWLISTED_HISTORY_BLOBS` in `scripts/scan-secrets.js`, blob `162ac34d…`), so `npm run scan:secrets:history` now reports "history CLEAN" while transparently listing the suppressed known-dead blob. A true history purge (git filter-repo/BFG, run by a human with direct git access) remains optional; if performed, remove the blob from the allowlist afterward.

---

### Branding assets
- Official logo (color Lebanese-food mark, Arabic "الأوتوماتيك اللبناني · مأكولات لبنانية"):
  `src/assets/brand/logo-full.png` (full color) and `logo.png` (transparent). Favicon in `public/`.
- On the dark theme the logo sits on a white rounded "plate" so its black text stays legible; print/PDF surfaces use it directly on white.

---

## User Preferences

- Dark theme (slate-950 background) with orange-500 accents — maintain this palette
- Arabic language support: status labels stored in Arabic, mapped to English internally
- Prefer single-file JSX components in `src/pages/`, but split a page into `src/components/<page>/` once it grows too large to navigate (as done for POS and Reports). The page file keeps all state/data-fetching; extracted pieces are presentational and take props.
- No TypeScript — plain JSX throughout
- Secrets must never be exposed to the browser; all API calls to third-party services go through the Express backend
