# Automatic Restaurant OS

## Current Version: v0.10.0 — Invoice Batch 2 Imported (2026-07-05)

| | |
|---|---|
| **Release** | v0.10.0 — Invoice Batch 2 Imported |
| **Test suite** | 190/190 passing |
| **Migrations** | 009 applied (supplier name unique index) |
| **Inventory** | 82 active items · 7 categories · 3 suppliers (all linked) |
| **Purchases** | 10 purchase orders (PO#1–#10) · 150 line items · OMR 2624.360 total |
| **Suppliers** | Al Aamer Majestic S.P.C · Valley Deer For Investment S.P.C · Al Sanabel |
| **Dedup protection** | App-level (POST+PATCH) + DB partial unique index WHERE active |
| **Next milestone** | Invoice #2309 (Valley Deer, 5-Apr) — awaiting clearer photo; GitHub history reconcile |

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
