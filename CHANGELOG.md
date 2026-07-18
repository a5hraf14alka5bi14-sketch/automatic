# Changelog

All notable changes to Automatic Restaurant OS are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions use the `v0.x` line tracked by the project's release tags and `replit.md`.

---

## [v0.13.0] — 2026-07-18 — Multi-Branch, QR Menu & Release Hygiene

This release formally captures work that had already landed on `main` after
v0.12.0 but was never versioned, plus a documentation/repo-hygiene pass.

### Added
- **Multi-branch support** — `branches` table (migration `018_branches.sql`),
  branch-aware filtering across Orders, Reports, and POS
- **QR customer menu** — public, bilingual (AR/EN), per-table menu with no
  login required (`src/pages/QRMenu.jsx`, `server/routes/public.js`)
- **Partial purchase-order receiving** — receive partial quantities against a
  PO with status tracking (migration `017_partial_po_receipt.sql`)
- **Managed kitchen stations** — stations are now an admin-managed list
  (add/rename/retire/reactivate) instead of inferred from order data
- **Replit Auth (OIDC)** as an additional sign-in method alongside JWT — no
  auto-account-creation, RBAC preserved
- **Electron packaged-startup smoke test** (`npm run electron:smoke`)

### Security
- **Order integrity hardening** — split-payment now runs inside a
  `FOR UPDATE` transaction, rejects payments on completed/cancelled orders,
  and caps each payment to the outstanding balance; completed orders always
  go through the shared `applyCompletionEffects()` path (no bypass)
- **Enterprise audit + production hardening pass** — security headers, CORS,
  rate limiting, and validation reviewed project-wide

### Fixed
- **CI restored to a working state** — `.github/workflows/ci.yml` referenced
  `.config/.semgrep/semgrep_rules.json`, a vendored ruleset that exists in the
  Replit workspace but was never pushed to this repo (zero commits touch that
  path in git history). This broke the Semgrep gate on every CI run.
  Temporarily pointed both Semgrep steps at the public `p/default` registry
  pack instead — its rule IDs follow the same shape as the existing
  `nosemgrep: javascript.lang.security...` suppressions already in `server/`
  and `src/`, so they should keep matching. **Follow-up:** recover the real
  vendored config from Replit and commit it, then revert this to the local
  path.
- `SECURITY.md` corrected — was advertising a stale `1.0.x` "Supported
  Versions" table, 10-round bcrypt, and 7-day JWT expiry; now matches the
  actual `0.x` release line, 12-round bcrypt, and short-lived access tokens
  described elsewhere in this changelog

### Changed
- `attached_assets/` (~99MB of working screenshots, pasted text, and
  documents) removed from version control — see `.gitignore`
- README rewritten: accurate feature list, corrected roadmap checkboxes
  (QR menu / multi-branch / partial PO receive moved from planned to
  delivered), and an explicit release-hygiene note going forward
- Documented that test-suite counts referenced across README / replit.md /
  external docs had drifted (280 → 461 → 491 at various points); `npm test`
  / CI is the single source of truth going forward, not a hand-written number

---

## [v0.12.0] — 2026-07-05 — Security & Quality Hardening (round 2)

### Security
- **Automated secret scanner** (`scripts/scan-secrets.js`) detecting real credential shapes (GitHub `github_pat_`/`ghp_`/`gho_`/…, OpenAI `sk-`/`sk-proj-`, Slack `xox*`, AWS `AKIA*`, PEM keys, JWTs)
  - Pre-commit hook auto-installed via `postinstall` — blocks commits containing staged secrets
  - `npm run scan:secrets` scans every tracked file and runs as the first CI step
  - `npm run scan:secrets:history` sweeps every blob in every commit and attributes hits back to their commits/paths
  - Full-history sweep confirmed the only credential-shaped hit was an already-rotated (dead) GitHub PAT, suppressed via a content-addressed blob allowlist
- **Semgrep security ruleset** wired into CI as a quality gate
- **bcrypt cost factor unified at 12** for all password hashing; existing weak hashes strengthened on next login without waiting for a reset
- **Rate limiting** added to costly integration/AI endpoints to protect external API quotas
- **RBAC gap fixed** — supplier and purchase-order data restricted to management roles

### Added / Improved
- **Orders pagination** — order history endpoints accept `limit`/`offset` and return `X-Total-Count`
- **Custom auto-sync interval** — admins can pick the Notion auto-sync interval; the choice persists across page reloads and server restarts (default 1 hour)
- **Integration cooldown UX** — rate-limit (429) responses now surface as warning-styled toasts with a live countdown, not error toasts; managers are warned before hitting a cooldown
- **Load-failure notices** on integration pages instead of blank screens when data fails to load

### Fixed
- Unguarded menu routes now require the correct role
- Stock-deduction N+1 query on order completion collapsed into a set-based update
- Sync-engine logging cleaned up; restaurant-name backup test fixed

### Tests
- **280 tests passing across 11 files** — extensive privilege-boundary, secret-leak, cooldown-lifecycle, and auto-sync regression coverage added

---

## [v0.11.0] — 2026-07-05 — Security & Quality Hardening (round 1)

### Security
- **Order financial field filtering** — `kitchen` and `staff` roles receive orders stripped of monetary fields
- Access-token lifetime reduced to **15 minutes** to shrink the forced-password-change window
- Explicit `requireRole` guards added to food-cost, stock-movements, stats, and link-summary endpoints

### Database integrity
- Monetary columns widened to **`NUMERIC(10,3)`** (migration 010)
- **`FOR UPDATE`** row locking on purchase-order receive to prevent lost updates
- **UNIQUE constraint** on `recipe_ingredients` to stop duplicate ingredient links
- Foreign keys added for `orders.user_id` and `orders.customer_id`

### Added / Improved
- **Backend validation** via Joi schemas for shifts, purchase orders, and user management
- **Recipe → inventory linking** with a manual-review UI and ranked suggestions (no unsafe auto-apply)
- **Supplier de-duplication** — app-level checks plus a partial unique index (migration 009)
- Inventory now seeds from a real Arabic SKU data file on a fresh database
- AI daily summary computed from direct DB KPI queries instead of a fragile localhost fetch
- `jsPDF` lazy-loaded; empty catch handlers in POS now surface a toast

---

## [v0.10.0] — 2026-07-03 — Production Readiness & Resilience

### Security
- **Two-factor authentication (TOTP)** for staff accounts
- **Order integrity** — server-side repricing of all monetary values, modifier authorization, and loyalty-redemption cap (client-supplied totals are never trusted)
- **Authentication & session controls** — httpOnly cookies, stricter server configuration
- Customer CRM access restricted to `admin` and `manager` roles
- Soft delete (`deleted_at`) added for menu items, inventory, and customers

### Added
- **Offline order queue** — POS keeps taking orders when the network drops and replays them on reconnect
- **Order voiding** with enforcement and audit trail
- **Barcode scanning** in the POS
- **Supplier management** and purchase-order receiving
- **Installable PWA** with offline support and platform-specific install icons
- **Admin password recovery** flow for the deployed app (env-gated)
- Order-status reversal symmetry — leaving `completed` restocks and reverses loyalty exactly

### Fixed
- Single-port production serving (static `dist/` served before auth so the healthcheck and SPA load correctly)
- Deployment errors around port, CORS, and middleware ordering
- Mobile responsiveness across POS and Kitchen Display

---

## [v0.9.0] — 2026-07-02 — Core Platform, Integrations & AI

### Added — Core
- Restaurant management dashboard with live stats
- Point of Sale with order creation, checkout, and payment
- Order management (dine-in, takeaway, delivery)
- Kitchen Display System with a live, mobile-responsive queue
- Inventory tracking with low-stock alerts and stock-movement audit logging
- Customer management with loyalty points and redemption
- Reports & analytics (overview, profitability, menu, engineering matrix, forecast, heatmap, trends, stock, staff)
- JWT authentication with role-based access

### Added — Menu, Recipes & Costing
- Full Lebanese menu management with categories, images, prep time, and tags
- Recipe → inventory linking for automatic food-cost calculation
- Automatic stock deduction on order completion, with unit conversion (kg↔g, L↔ml, dozen↔pcs)
- Per-item margin % with color coding

### Added — Integrations & AI
- **GitHub** integration — repository sync
- **Notion** integration — bidirectional project & task sync with Arabic status mapping
- **OpenAI** integration — AI chat, daily summary, executive insights, and revenue forecasting
- Menu-engineering matrix (stars / plowhorses / puzzles / dogs)
- Unified Integrations hub with masked keys and connection testing (all secrets stored server-side, never exposed to the browser)

### Added — Branding & Tooling
- Official restaurant logo (الأوتوماتيك اللبناني · مأكولات لبنانية) across app, receipts, and PDF exports
- Structured server logging, versioned advisory-locked DB migration runner
- CI pipeline, `.env.example`, `CONTRIBUTING.md`, `SECURITY.md`, and `docs/`

---

## [Unreleased]

### Planned
- QR code menu for table ordering
- Mobile application (Expo)
- Multi-branch support
- Customer-facing online ordering portal
- Deployment automation & production monitoring
