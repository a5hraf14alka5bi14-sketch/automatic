# Changelog Archive

> Older dated changelog sections moved out of replit.md (2026-07-08). Newest first.

## Stocktake tooling for real ingredient counts — 2026-07-07

The 91 reactivated recipe ingredients carry a placeholder opening balance
(100.000), so on-hand numbers aren't trustworthy until staff physically count
them. The app now makes that stocktake practical (the counts themselves still
have to be entered by staff on the Inventory → Stocktake tab):

- **`last_counted_at`** exposed on `GET /api/inventory` (latest `stocktake`
  movement per item, subselect) — `null` = never physically counted.
- **Stocktake tab upgrades** (`StocktakeView` in `src/pages/Inventory.jsx`):
  search + category filter + "Never counted (N)" toggle, amber "Never counted"
  badges + banner, an editable **Low-Stock Threshold column** so `min_quantity`
  is set in the same pass, and an item counter.
- **Confirmations count:** entering a count equal to system stock on a
  never-counted item records a zero-change `stocktake` movement ("count
  confirmed") so the item flips to counted. `recordStockMovement` gained an
  `allowZero` opt-in (default unchanged — zero deltas still skipped elsewhere).
- **`PATCH /api/inventory/bulk-stocktake`** now accepts optional `min_quantity`
  per item (either/both of `quantity`/`min_quantity`; rows locked FOR UPDATE);
  threshold-only entries record no movement.
- **Tests:** suite 425/425 passing (e2e-inventory grew to 26 cases); Playwright
  UI run verified the full tab flow end-to-end.

## RBAC financial-data review (cashier/staff lock-down) — 2026-07-07

Full review pass confirming cashier/kitchen/staff cannot reach financial or
supplier data. Verified already-guarded: **all** `/api/reports/*` sub-routes
(router-level `requireRole('admin','manager')` covers `/staff`, `/export`,
`/menu-matrix`), all `/api/suppliers/*`, all `/api/integrations/*` (the only
finance-entries surface — Notion sync/push), `/api/customers/*`, shifts,
admin. New in this pass:

- **Field stripping on role-open GETs** (routes stay accessible; financial
  fields removed for non-admin/manager):
  - `GET /api/menu`, `/all`, `/barcode/:code`, `/:id` → `food_cost` stripped;
    `/api/menu/stats` → `avg_cost`/`avg_margin` stripped.
  - `GET /api/inventory`, `/low-stock` → `cost` + `supplier_id` stripped.
  - `GET /api/dashboard/stats` → revenue figures (`todayRevenue`,
    `monthRevenue`, `avgOrderValue`) stripped for **kitchen/staff** only.
- **Documented as intentional (cashier/staff-accessible):** menu + inventory
  reads (POS/Kitchen need them, sans costs), stock availability/impact,
  order create + status flow (kitchen/staff still get financially-filtered
  orders via `filterOrderFields`), dashboard operational counts, and
  **cashier keeps day revenue / order totals** — they ring up sales and
  handle cash, but see no margin, food-cost, supplier, or report data.
- **UI:** Menu page hides Food Cost/Cost %/Margin cards+columns for
  non-managers; Dashboard swaps revenue cards for operational cards when the
  API omits them; Inventory already rendered "—" for absent costs.
- **Tests:** `tests/rbac-financial-visibility.test.js` (25 cases: 403s for
  reports/suppliers/finance-sync, field-stripping per role, manager
  visibility retained). Suite: 407/407 passing.

## Bilingual menu (Arabic + English) — 2026-07-06

The full menu was replaced with the new bilingual A4 menu (~100 items):

- **DB:** `menu_items.name_ar` column (migration 014). `scripts/update-menu-bilingual.js`
  (the canonical menu data) updated 85 items in place (recipes preserved), inserted 15
  new, and soft-deleted 62 off-menu/demo items → **100 active bilingual items**.
  Descriptions stored as "EN — AR" in the single description column.
- **Categories (new taxonomy):** soups, appetizers, hot-maza, cold-maza, grills,
  manakish, shawarma, sandwiches, salads, desserts, drinks, coffee-tea, juices —
  mirrored in `src/components/pos/constants.js` and `src/pages/Menu.jsx`. Retired
  items keep their old categories (harmless in historical joins).
- **API:** `name_ar` accepted on menu POST/PATCH (validators + routes); order items
  expose `name_ar` via a `LEFT JOIN menu_items` inside `ORDERS_SELECT` in
  `server/routes/orders.js` (inside the json_agg, so no row multiplication).
- **UI:** Arabic name rendered with `dir="rtl"` in POS menu cards + cart, Menu page
  cards/table/add-edit form (new Arabic name input), Recipes header + list, Kitchen
  tickets, and both receipt variants. Search on POS/Menu/Recipes matches Arabic too.
- **Test suite:** 370/370 passing.

## iOS Home Screen icon fix (round 2 — query string was the culprit) — 2026-07-06

The earlier fix bumped a `?v=N` query string on the apple-touch-icon eight times
(`?v=1`→`?v=8`) and the iPhone icon *still* showed the black screenshot fallback.
Root cause: **iOS Safari "Add to Home Screen" frequently refuses to fetch an
apple-touch-icon whose href has a query string**, so every version bump was a
no-op. Corrected approach:

- **Cache-bust by FILENAME, not query.** New `public/apple-touch-icon-180.png`
  (byte-identical opaque 180×180 icon), referenced by clean, query-less links in
  `index.html`: a single `apple-touch-icon` (sizes 180×180) + one
  `apple-touch-icon-precomposed`. All `?v=` query strings removed. A brand-new
  filename is a URL iOS has never cached, so it is always fetched fresh.
- **SW cache bumped** `v8`→`v9`; `APP_SHELL` now precaches
  `apple-touch-icon-180.png`.
- **To see the fix on an iPhone:** republish, then DELETE the old Home Screen
  icon and re-add it (iOS won't refresh a cached icon otherwise).

## iOS Home Screen icon fix — 2026-07-06

The iPhone "Add to Home Screen" icon showed a black square with a white sliver
(iOS's *screenshot fallback* — it captured the dark loading splash because it
never used the real icon). Two root causes, both fixed:

- **Alpha channel.** `public/apple-touch-icon.png` was RGBA (fully opaque but
  with an alpha channel), against Apple's "must be opaque" guidance. Regenerated
  from `logo-full.png` as a crisp 180×180 **opaque** icon (`Channels: 3.0`,
  logo on a white plate) via `magick … -alpha remove -alpha off -strip`.
- **iOS per-URL icon cache.** iOS caches the home-screen icon by exact URL, so a
  stale/failed fetch sticks. `index.html` now cache-busts all apple-touch-icon
  links with `?v=8` and adds `apple-touch-icon` (no-size) +
  `apple-touch-icon-precomposed` variants for broader iOS coverage.
- **SW cache bumped** `v7`→`v8` so installed PWAs pick up the new icon bytes.
- **To see the fix on an iPhone:** republish, then DELETE the old Home Screen
  icon and re-add it (iOS won't refresh a cached icon otherwise).


## In-app install button + printable install guide — 2026-07-06

Two additive, web-only aids for getting the published PWA onto staff devices:

- **"Install this app" button** (`src/components/InstallButton.jsx`) in the
  sidebar footer (expanded + collapsed). Chromium/Android → native install
  prompt; iOS Safari → branded "Share → Add to Home Screen" modal; hidden when
  already installed or on platforms that can't install. The
  `beforeinstallprompt` event is captured app-wide in `src/utils/installPrompt.js`
  (imported at the top of `src/main.jsx` **before** React renders) because
  Chromium fires it once, early — on the login screen — before the post-login
  sidebar mounts. Regression test: `tests/install-prompt.test.js`.
- **Printable cheat-sheet:** `node scripts/generate-install-guide.js <published-url>`
  → `install-guide.pdf`, a branded one-pager with per-platform steps
  (iPhone/iPad, Android, desktop). jsPDF built-in fonts can't render emoji or
  Arabic, so the PDF uses plain English typography.
- **Test suite:** 369/369 passing.

## Branded loading splash — 2026-07-06

While the JS bundle loads, the app now shows the restaurant logo (`/logo.png` on
a white rounded "plate", dark `#020617` background, orange-500 progress bar)
instead of a blank screen. Markup + inline CSS live inside `#root` in
`index.html`, so React removes it automatically on mount (no JS needed).
Respects `prefers-reduced-motion`. `sw.js` cache bumped `v4`→`v5` so installed
PWAs pick up the new shell.

## Password hashing → Argon2id — 2026-07-06

Password KDF upgraded from bcrypt (cost 12) to **Argon2id** with a zero-disruption
transparent migration. All password hashing now goes through
`server/lib/password.js`:

- **Argon2id via `hash-wasm`** (pure WASM — no native compilation, so it runs
  identically on Replit/Linux, the deployed container, and CI). OWASP-aligned
  params: memory 19 MiB, 3 iterations, parallelism 1.
- **`verifyPassword(plain, stored)`** transparently verifies BOTH new Argon2id
  hashes (`$argon2id$…`) and legacy bcrypt hashes (`$2a/$2b/$2y$…`) — returns
  `false` (never throws) on malformed input. `bcryptjs` is kept ONLY to verify
  legacy hashes; nothing new is ever hashed with bcrypt.
- **Safe migration (no reset required):** on any successful login, if
  `needsRehash()` flags the stored hash (legacy bcrypt, or a weaker Argon2id
  profile) it is silently re-hashed to Argon2id via a compare-and-set UPDATE
  (guarded on the exact verified hash, so a concurrent password change is never
  clobbered). Legacy accounts upgrade themselves on next login.
- All new-hash paths use `hashPassword`: `PATCH /api/auth/password`,
  `POST /api/users`, `PATCH /api/users/:id/password`, and the bootstrap admin seed.
- **Test suite:** 362/362 passing (added `tests/password-hashing.test.js`; the
  login-upgrade regression now asserts bcrypt→Argon2id).

## Native auth + push follow-ups — 2026-07-06

Three native follow-ups on top of the packaging work, all additive (web is 100%
unchanged, still cookie-based):

- **Native bearer-token auth.** `/api/auth/login`, `/api/auth/refresh` and
  `PATCH /api/auth/password` now ALSO return `token`+`refresh_token` in the JSON
  body. Native shells (Capacitor **and** Electron — gated on
  `isNativePlatform() || isDesktop()`) store them (`src/utils/authToken.js`),
  send `Authorization: Bearer` (`src/utils/api.js`), refresh via body
  `refresh_token`, and authenticate the WebSocket with a `?token=` query param
  (`server/events.js` accepts it; refresh-type tokens rejected). Forced
  password-change stores the rotated tokens so native isn't left locked out.
- **Server-side push (FCM HTTP v1).** New `device_tokens` table (migration 013),
  `server/integrations/push.js` (env-gated on `FCM_SERVICE_ACCOUNT`; logged no-op
  when unset — safe on Replit/Linux), `server/routes/push.js`
  (`POST`/`DELETE /api/push/register`, user-scoped delete). New orders fire a
  fire-and-forget push to `kitchen` staff. Native registration in
  `src/native/push.js`. To deliver for real, set `FCM_SERVICE_ACCOUNT` on the
  deployed backend (APNs via Firebase).
- **Windows startup smoke test.** The Electron `app://bundle` path resolution +
  traversal guard is extracted to the pure `electron/resolve-asset.js` and
  unit-tested (`tests/electron-asset-resolution.test.js`) so it's verifiable on
  Linux; `NATIVE_BUILD.md` gained a manual Windows smoke checklist.
- **Test suite:** 355/355 passing (added `tests/native-bearer-push.test.js` and
  `tests/electron-asset-resolution.test.js`).

## Native Apps (Capacitor + Electron) — 2026-07-06

The web frontend is now packaged as installable native apps with **zero
business-logic duplication** — all three shells load the same built `dist/`:

- **iOS + Android:** Capacitor 7 (`android/`, `ios/`, `capacitor.config.json`). Pinned to v7 because Capacitor 8 needs Node ≥ 22 (env is Node 20). Native features: camera barcode/QR scan (`src/components/NativeScanButton.jsx`, ML Kit), push notifications, splash screen, offline (Preferences + existing POS queue), deep links (`lb.automatic.restaurantos://`).
- **Windows desktop:** Electron + electron-builder + electron-updater (`electron/main.js`, `electron/preload.cjs`, `electron-builder.json`). Native menus, single-instance lock, `auto-os://` deep-link protocol, auto-update, desktop notifications on new kitchen orders.
- **Shared enabler:** `src/config.js` — `apiUrl()`/`wsUrl()` resolve **relative** for the same-origin web build (default) and **absolute** when `VITE_API_BASE_URL` is set (native builds pointing at the deployed backend). `isNativePlatform()`, `isDesktop()`, `notifyDesktop()` helpers.
- **Build guide:** `NATIVE_BUILD.md` (per-platform build/submit steps, `VITE_API_BASE_URL` usage, auth-cookie cross-origin caveat, limitations). Replit (Linux) can't compile iOS/`.exe` or submit to stores — build those on your own Mac/Windows.
- **Scripts:** `cap:sync`, `cap:open:android|ios`, `electron:dev`, `electron:build`.
- Native source projects (`android/`, `ios/`) are committed; generated build outputs and `release/` are git-ignored.
- **Test suite:** 335/335 passing (added `tests/config.test.js` covering relative vs absolute URL resolution).

