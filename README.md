<div align="center">

# 🍽️ Automatic Restaurant OS

### AI-Powered Restaurant Management Platform

[![CI](https://github.com/a5hraf14alka5bi14-sketch/automatic/actions/workflows/ci.yml/badge.svg)](https://github.com/a5hraf14alka5bi14-sketch/automatic/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/Version-v0.12.0-informational)](./CHANGELOG.md)
[![Tests](https://img.shields.io/badge/Tests-280%20passing-brightgreen)](./tests)
[![Platform](https://img.shields.io/badge/Platform-Replit-orange)](https://replit.com)

Manage your restaurant operations — POS, kitchen, inventory, customers, reporting, and AI automation — from one integrated dashboard.

</div>

---

## 📌 Current Version — v0.12.0 · Security & Quality Hardening

The v0.11.0 and v0.12.0 releases focused on locking the platform down for real-world use:

- **Role-based access control** enforced on the backend for `admin`, `manager`, `cashier`, `kitchen`, and `staff` — financial fields and management data are filtered per role, not just hidden in the UI.
- **Automated secret scanning** (pre-commit hook + CI + full git-history sweep) plus a **Semgrep** security gate in CI.
- **Database integrity** — `NUMERIC(10,3)` money columns, foreign keys, `FOR UPDATE` row locking on stock receive, and unique constraints via a versioned migration runner.
- **Backend validation** (Joi), **rate limiting** on costly integration/AI endpoints, **bcrypt cost 12**, 15-minute access tokens, and **two-factor auth (TOTP)**.
- **Orders pagination**, **N+1 query fixes**, and **280 tests** across 11 files.

See [`CHANGELOG.md`](./CHANGELOG.md) for the full v0.9.0 → v0.12.0 history.

---

## ✨ Features

| Module | Description |
|---|---|
| 🛒 **Point of Sale** | Fast checkout, split bills, tax, modifiers, barcode scanning, offline order queue |
| 📋 **Orders** | Dine-in, takeaway, delivery tracking with pagination and order voiding |
| 👨‍🍳 **Kitchen Display** | Live order queue, prep status, priority (rush) management, per-station routing |
| 📦 **Inventory** | Ingredient tracking, low-stock alerts, stock-movement audit, supplier & purchase orders |
| 👥 **Customers** | Profiles, loyalty points & redemption, order history (management-only) |
| 🍽️ **Menu & Recipes** | Menu management, recipe → inventory cost linking, food-cost % |
| 📊 **Reports** | 9 tabs: overview, profitability, menu, engineering matrix, forecast, heatmap, trends, stock, staff |
| 🤖 **AI Executive** | GPT-powered executive dashboard, revenue forecasting, menu-engineering insights |
| 🔐 **Access Control** | Backend-enforced RBAC across admin / manager / cashier / kitchen / staff |
| 🛡️ **Security** | Secret scanning, Semgrep CI gate, rate limiting, 2FA (TOTP), audit log |
| 🔌 **Integrations** | GitHub, Notion, and OpenAI — all connected |
| 📱 **PWA** | Installable app with offline support |

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
| Auth | JWT + bcryptjs |
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
│   ├── context/            # Settings / Toast providers
│   ├── assets/brand/       # Official logo assets
│   ├── App.jsx
│   └── main.jsx
├── server/                 # Express backend
│   ├── index.js            # Entry point (port 3001)
│   ├── db.js               # DB pool + schema init
│   ├── notion.js           # Notion client + helpers
│   ├── logger.js           # Structured logging
│   ├── integrations/       # GitHub, OpenAI, Notion REST, sync-engine
│   └── routes/             # API route handlers (auth, menu, orders, ai, reports, …)
├── tests/                  # Vitest business-logic tests
├── public/                 # Static assets & favicon
├── docs/                   # Technical documentation
├── .github/                # CI workflows & issue templates
├── .env.example            # Environment variable reference
└── README.md
```

---

## 📈 Roadmap

- [x] Authentication (JWT)
- [x] Dashboard with live stats
- [x] Point of Sale
- [x] Order management
- [x] Kitchen Display System
- [x] Inventory tracking
- [x] Customer management & loyalty
- [x] Reports & analytics
- [x] Menu & recipes with food-cost linking
- [x] GitHub integration (repo sync)
- [x] Notion integration (bidirectional project/task sync)
- [x] OpenAI integration (AI chat)
- [x] AI Executive dashboard & revenue forecasting
- [x] Menu-engineering matrix
- [x] Official brand logo across app & printed outputs
- [x] Role-based access control (backend-enforced across 5 roles)
- [x] Two-factor authentication (TOTP)
- [x] Offline order queue & installable PWA
- [x] Supplier management & purchase orders
- [x] Automated secret scanning + Semgrep CI gate
- [ ] QR code menu
- [ ] Mobile application
- [ ] Multi-branch support
- [ ] Customer-facing online ordering
- [ ] Deployment automation & production monitoring

---

## 🔐 Security

- JWT authentication with signed tokens (15-minute access tokens) and optional **two-factor auth (TOTP)**
- Passwords hashed with **bcrypt (cost factor 12)**; legacy weak hashes upgraded on next login
- **Backend-enforced RBAC** across `admin` / `manager` / `cashier` / `kitchen` / `staff` — financial and management data filtered by role on the server, not just in the UI
- **Rate limiting** on costly integration/AI endpoints to protect external API quotas
- **Automated secret scanning** — pre-commit hook + CI step + full git-history sweep (`npm run scan:secrets` / `npm run scan:secrets:history`)
- **Semgrep** security ruleset enforced as a CI quality gate
- All third-party API keys stored as server-side environment secrets and encrypted at rest; keys masked in the UI and never sent to the browser
- Admin-only audit log of successful mutations and on-demand database backup

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
