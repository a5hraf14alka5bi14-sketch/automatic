<div align="center">

# 🍽️ Automatic Restaurant OS

### AI-Powered Restaurant Management Platform

[![CI](https://github.com/a5hraf14alka5bi14-sketch/Automatic-/actions/workflows/ci.yml/badge.svg)](https://github.com/a5hraf14alka5bi14-sketch/Automatic-/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/Version-1.0.0-informational)](./CHANGELOG.md)
[![Platform](https://img.shields.io/badge/Platform-Replit-orange)](https://replit.com)

Manage your restaurant operations — POS, kitchen, inventory, customers, reporting, and AI automation — from one integrated dashboard.

</div>

---

## ✨ Features

| Module | Description |
|---|---|
| 🛒 **Point of Sale** | Fast checkout, split bills, tax calculation |
| 📋 **Orders** | Dine-in, takeaway, delivery tracking |
| 👨‍🍳 **Kitchen Display** | Live order queue, prep status, priority management |
| 📦 **Inventory** | Ingredient tracking, low-stock alerts, cost analysis |
| 👥 **Customers** | Profiles, loyalty points, order history |
| 📊 **Reports** | Daily sales, revenue trends, best-sellers |
| 🔌 **Integrations** | GitHub, Notion, and OpenAI — all connected |
| 🤖 **AI Assistant** | GPT-powered suggestions via OpenAI integration |

---

## 🏗 Architecture

```
Browser (React 18 + Vite)   →   port 5000
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
| Frontend | React 18, Vite, Tailwind CSS |
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
git clone https://github.com/a5hraf14alka5bi14-sketch/Automatic-.git
cd Automatic-
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

### Demo credentials
```
Email:    admin@automatic.com
Password: admin123
```

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
Automatic-/
├── src/                    # React frontend
│   ├── pages/              # One file per page/module
│   ├── components/         # Shared UI components
│   ├── App.jsx
│   └── main.jsx
├── server/                 # Express backend
│   ├── index.js            # Entry point (port 3001)
│   ├── db.js               # DB pool + schema init
│   ├── notion.js           # Notion client + helpers
│   ├── integrations/       # GitHub & OpenAI clients
│   └── routes/             # API route handlers
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
- [x] GitHub integration (repo sync)
- [x] Notion integration (bidirectional project/task sync)
- [x] OpenAI integration (AI chat)
- [ ] QR code menu
- [ ] Mobile application
- [ ] Multi-branch support
- [ ] AI sales forecasting
- [ ] Customer-facing online ordering

---

## 🔐 Security

- JWT authentication with signed tokens
- Passwords hashed with bcryptjs (salt rounds: 10)
- All third-party API keys stored as server-side environment secrets
- API keys masked in the UI (first 6 + last 4 characters only)
- Role-based access control (admin / staff)

See [`SECURITY.md`](./SECURITY.md) for vulnerability reporting.

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
