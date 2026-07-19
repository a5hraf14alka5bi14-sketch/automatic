 <div align="center">

# 🍽️ الأوتوماتيك — مأكولات لبنانية
### Automatic Restaurant OS — AI-Powered Restaurant Management Platform

[![CI](https://github.com/a5hraf14alka5bi14-sketch/automatic/actions/workflows/ci.yml/badge.svg)](https://github.com/a5hraf14alka5bi14-sketch/automatic/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/Version-v0.13.0-informational)](./CHANGELOG.md)
[![Tests](https://img.shields.io/badge/Tests-passing-brightgreen)](./tests)
[![Platform](https://img.shields.io/badge/Platform-Replit-orange)](https://replit.com)

Manage your restaurant operations — POS, kitchen, inventory, customers, reporting, and AI automation — from one integrated dashboard.

</div>

---

## 📌 Current Version — v0.13.0 · Multi-Branch, QR Menu & Release Hygiene

This release formally captures everything that had already landed on `main` since v0.12.0 — multi-branch support, the public QR customer menu, partial PO receiving, managed kitchen stations, Replit Auth, and an order-integrity/security hardening pass — plus a documentation and repo-hygiene cleanup (corrected `SECURITY.md`, removed ~99MB of working files from version control, and closed the gap between what was built and what was documented as built).

See [`CHANGELOG.md`](./CHANGELOG.md) for the full version history.

> **Tests:** run `npm test` for the exact current count — treat CI as the single source of truth rather than any hand-written number in documentation, since that's what drifted out of sync in the past (see `CHANGELOG.md` v0.13.0 entry).

---

## ✨ Features

| Module | Description |
|---|---|
| 🛒 **Point of Sale** | Fast checkout, split bills, tax, modifiers, barcode scanning, offline order queue |
| 📋 **Orders** | Dine-in, takeaway, delivery tracking with pagination, order voiding, and transaction-safe split payments |
| 👨‍🍳 **Kitchen Display** | Live order queue, prep status, priority (rush) management, admin-managed per-station routing |
| 📦 **Inventory** | Ingredient tracking, low-stock alerts, stock-movement audit, supplier & purchase orders with partial receiving |
| 👥 **Customers** | Profiles, loyalty points & redemption, order history (management-only) |
| 🍽️ **Menu & Recipes** | Menu management, recipe → inventory cost linking, food-cost % |
| 📱 **QR Customer Menu** | Public, bilingual (AR/EN) menu per table — no login required |
| 🏢 **Multi-Branch** | Branch-aware orders, reports, and POS filtering |
| 📊 **Reports** | 9 tabs: overview, profitability, menu, engineering matrix, forecast, heatmap, trends, stock, staff |
| 🤖 **AI Executive** | GPT-powered executive dashboard, revenue forecasting, menu-engineering insights |
| 🔐 **Access Control** | Backend-enforced RBAC across admin / manager / cashier / kitchen / staff |
| 🛡️ **Security** | Secret scanning, Semgrep CI gate, rate limiting, 2FA (TOTP), Replit Auth (OIDC), audit log |
| 🔌 **Integrations** | GitHub, Notion, and OpenAI — all connected |
| 📱 **PWA / Native** | Installable PWA, plus Capacitor (iOS/Android) and Electron (Windows) shells |

---

## 🏗 Architecture

```
Browser (React 19 + Vite)   →   port 5000
        ↕ REST API
Express Backend              →   port 3001
        ↕
PostgreSQL Database          ←   DATABASE_URL secret

External services (server-side only, keys never reach browser):
  GitHub API  ←  GITHUB_TOKEN
  Notion API  ←  NOTION_API_KEY
  OpenAI API  ←  OPENAI_API_KEY
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS |
| Backend | Node.js, Express (ESM) |
| Database | PostgreSQL |
| Auth | JWT + bcryptjs (cost 12) + optional TOTP 2FA + Replit Auth (OIDC) |
| AI | OpenAI GPT-4o-mini |
| Project mgmt | Notion (bidirectional sync) |
| Source control | GitHub |
| Hosting | Replit |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- API keys for GitHub, Notion, OpenAI (optional but recommended)

### 1. Clone

```bash
git clone https://github.com/a5hraf14alka5bi14-sketch/automatic.git
cd automatic
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in your secrets (see .env.example for guidance)
```

### 4. Run

```bash
npm run dev
# Frontend → http://localhost:5000
# Backend  → http://localhost:3001
```

### First-run admin
The seed admin's email and password are provisioned via environment secrets and are **not documented here** to avoid leaking credentials. The seeded admin is created with `must_change_password=true`, so the app forces a password change on first login.

---

## 🔌 Integrations

See [`docs/integrations.md`](./docs/integrations.md) for full setup instructions.

| Integration | Purpose | Secret |
|---|---|---|
| GitHub | Repository metadata sync | `GITHUB_TOKEN` |
| Notion | Project & task sync (bidirectional) | `NOTION_API_KEY` |
| OpenAI | AI chat, suggestions, forecasting | `OPENAI_API_KEY` |

All keys are stored as environment secrets and **never exposed to the browser**.

---

## 📂 Project Structure

```
automatic/
├── src/                    # React frontend
│   ├── pages/              # One file per page/module
│   ├── components/         # Shared UI components (Sidebar, ReceiptModal, notion/)
│   ├── context/             # Settings / Toast providers
│   ├── assets/brand/        # Official logo assets
│   ├── App.jsx
│   └── main.jsx
├── server/                 # Express backend
│   ├── index.js            # Entry point (port 3001)
│   ├── db.js               # DB pool + schema init
│   ├── migrations/         # Versioned SQL migrations (advisory-locked runner)
│   ├── notion.js           # Notion client + helpers
│   ├── logger.js           # Structured logging
│   ├── integrations/       # GitHub, OpenAI, Notion REST, sync-engine
│   └── routes/              # API route handlers (auth, menu, orders, ai, reports, public, …)
├── tests/                   # Vitest business-logic + integration tests
├── e2e/                      # Playwright end-to-end tests
├── public/                  # Static assets, favicon, PWA manifest
├── docs/                     # Technical documentation
├── .github/                  # CI workflows & issue templates
├── .env.example              # Environment variable reference
└── README.md
```

---

## 📈 Roadmap

### Delivered
- [x] Authentication (JWT + optional Replit Auth SSO)
- [x] Dashboard with live stats
- [x] Point of Sale
- [x] Order management (incl. transaction-safe split payments)
- [x] Kitchen Display System (managed stations, mobile-responsive)
- [x] Inventory tracking + stocktake tooling
- [x] Customer management & loyalty
- [x] Reports & analytics (9 tabs)
- [x] Menu & recipes with food-cost linking
- [x] GitHub integration (repo sync)
- [x] Notion integration (bidirectional project/task sync)
- [x] OpenAI integration (AI chat + executive insights)
- [x] AI Executive dashboard & revenue forecasting
- [x] Menu-engineering matrix
- [x] Official brand logo across app & printed outputs
- [x] Role-based access control (backend-enforced across 5 roles)
- [x] Two-factor authentication (TOTP)
- [x] Offline order queue & installable PWA
- [x] Supplier management & purchase orders, including partial receiving
- [x] Automated secret scanning + Semgrep CI gate
- [x] QR code customer menu (bilingual, per-table, public)
- [x] Multi-branch support (branch-aware orders/reports/POS)
- [x] Native app shells — Capacitor (iOS/Android) + Electron (Windows)

### Next Milestones
- [ ] Deployment automation & production health monitoring
- [ ] ESLint + Prettier configuration and CI gate
- [ ] Automated test coverage for API routes (currently business-logic focused)
- [ ] Customer-facing online ordering portal

---

## 🔐 Security

- JWT authentication with signed, short-lived (15-minute) access tokens and optional **two-factor auth (TOTP)**, plus optional Replit Auth (OIDC) as an alternate sign-in path
- Passwords hashed with **bcrypt (cost factor 12)**; legacy weak hashes upgraded on next login
- **Backend-enforced RBAC** across `admin` / `manager` / `cashier` / `kitchen` / `staff` — financial and management data filtered by role on the server, not just in the UI
- **Rate limiting** on costly integration/AI endpoints to protect external API quotas
- **Automated secret scanning** — pre-commit hook + CI step + full git-history sweep (`npm run scan:secrets` / `npm run scan:secrets:history`)
- **Semgrep** security ruleset enforced as a CI quality gate
- All third-party API keys stored as server-side environment secrets and encrypted at rest; keys masked in the UI and never sent to the browser
- Admin-only audit log of successful mutations and on-demand database backup
- Order integrity: split-payments run inside a `FOR UPDATE` transaction, are capped to the outstanding balance, and are rejected on completed/cancelled orders

See [`SECURITY.md`](./SECURITY.md) for vulnerability reporting and [`threat_model.md`](./threat_model.md) for the security model.

---

## 🤝 Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before submitting a pull request.

---

## 📄 License

MIT — see [`LICENSE`](./LICENSE).

---

## 👨‍💻 Author

**Ashraf Saif Alkasbi** — Restaurant Technology · Automation · AI · Digital Transformation

<div align="center">

⭐ If you find this useful, give it a star!

Made with ❤️ for modern restaurants.

</div>
