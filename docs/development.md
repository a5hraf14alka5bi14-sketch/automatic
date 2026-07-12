# Development Guide

## Prerequisites

- Node.js 18+
- PostgreSQL (or use Replit's built-in DB)
- npm 9+

## Local Setup

```bash
# 1. Clone
git clone https://github.com/a5hraf14alka5bi14-sketch/Automatic-.git
cd Automatic-

# 2. Install
npm install

# 3. Configure secrets
cp .env.example .env
# Edit .env with your values

# 4. Start
npm run dev
```

Frontend runs at `http://localhost:5000`  
Backend runs at `http://localhost:3001`

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start frontend + backend concurrently |
| `npm run server` | Start only the Express backend (with --watch) |
| `npm run client` | Start only the Vite frontend |
| `npm run build` | Production build of the frontend |
| `npm run preview` | Preview the production build |
| `npm run release:sync-log` | Push new CHANGELOG versions into the Notion Release Log (idempotent) |

## Cutting a Release

When you ship a new version:

1. Bump `version` in `package.json`.
2. Add a `## [vX.Y.Z] — YYYY-MM-DD — <Title>` section to `CHANGELOG.md` (newest first). List highlights in **bold** — the sync script uses bold phrases to build the Notion summary.
3. Update the version badge/header in `README.md` and `replit.md` as needed.
4. Run `npm run release:sync-log` to upsert the new version into the Notion **📦 Release Log** database.

The sync script (`scripts/sync-release-log.js`) reads every released version from `CHANGELOG.md`, derives the **Type** (Major/Minor/Patch from the SemVer bump) and **Summary** (title + bold highlights), and creates one row per version with **Status = Done**. It skips versions already present, so re-running never creates duplicates.

- `npm run release:sync-log -- --latest` — only the newest CHANGELOG entry
- `node scripts/sync-release-log.js --version=v0.12.0` — a specific version
- `node scripts/sync-release-log.js --dry-run` — report what would change without writing

Requires a Notion API key (settings table or `NOTION_API_KEY`). The target database can be overridden with `NOTION_RELEASE_LOG_DB`.

## Server Architecture

The Express server uses ESM (`"type": "module"` in package.json). All imports use `.js` extensions even for TypeScript-authored files.

**Port layout:**
- `3001` — Express API (localhost only, not exposed to the internet)
- `5000` — Vite dev server (public, proxied by Replit)

The frontend always calls `http://localhost:3001` directly. In production (Replit deployment), both are served from the same container.

## Database

The DB schema is initialized automatically on server start via `initDb()` in `server/db.js`. All tables use `CREATE TABLE IF NOT EXISTS`, so they are safe to run repeatedly.

**Tables:**
| Table | Purpose |
|---|---|
| `users` | Auth — email/password/role |
| `menu_items` | Restaurant menu |
| `orders` | Order headers |
| `order_items` | Line items per order |
| `inventory` | Ingredient stock |
| `customers` | Customer profiles + loyalty |
| `settings` | Key/value config store (integration keys, DB IDs) |
| `notion_projects` | Synced Notion projects |
| `notion_tasks` | Synced Notion tasks |
| `github_repos` | Synced GitHub repositories |

## Adding a New Page

1. Create `src/pages/MyPage.jsx`
2. Import it in `src/App.jsx`
3. Add a `case 'mypage':` to the `renderPage()` switch
4. Add a nav item to `src/components/Sidebar.jsx`

## Adding a New API Route

1. Create `server/routes/myroute.js` — export a default Express Router
2. Import and mount it in `server/index.js`:
   ```js
   import myRoutes from './routes/myroute.js'
   app.use('/api/myroute', myRoutes)
   ```
3. Restart the workflow (node --watch does not detect new imports automatically)

## Environment Variables

See `.env.example` for the full list. On Replit, add them as Secrets. Locally, use a `.env` file (never commit it).

## Coding Conventions

- Plain JSX — no TypeScript
- Tailwind CSS for all styling
- Dark theme: `bg-slate-950` base, `bg-slate-900` cards, `orange-500` accent
- All third-party API calls go through the Express backend
- Secrets never sent to the browser
