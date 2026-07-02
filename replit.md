# Automatic Restaurant OS

## Project Overview

Full-stack restaurant management system built with React 18 + Vite (port 5000) and Express (port 3001) backed by PostgreSQL.

### Stack
- **Frontend:** React 18, Vite, Tailwind CSS — served on port 5000
- **Backend:** Express (ESM, `"type":"module"`) — served on port 3001 (localhost only)
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

### Server structure
```
server/
  index.js              — Express entry point (port 3001)
  db.js                 — PostgreSQL pool + schema init
  notion.js             — Notion client + helpers
  integrations/
    github.js           — GitHub API client
    openai.js           — OpenAI API client
  routes/
    auth.js             — JWT auth
    integrations.js     — GitHub / Notion / OpenAI hub
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

### Demo credentials
- Email: `admin@automatic.com`
- Password: `Admin123`

---

### Branding assets
- Official logo (color Lebanese-food mark, Arabic "الأوتوماتيك اللبناني · مأكولات لبنانية"):
  `src/assets/brand/logo-full.png` (full color) and `logo.png` (transparent). Favicon in `public/`.
- On the dark theme the logo sits on a white rounded "plate" so its black text stays legible; print/PDF surfaces use it directly on white.

---

## User Preferences

- Dark theme (slate-950 background) with orange-500 accents — maintain this palette
- Arabic language support: status labels stored in Arabic, mapped to English internally
- Keep all pages as single-file JSX components in `src/pages/`
- No TypeScript — plain JSX throughout
- Secrets must never be exposed to the browser; all API calls to third-party services go through the Express backend
