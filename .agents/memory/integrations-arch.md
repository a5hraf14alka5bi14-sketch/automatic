---
name: Integrations hub architecture
description: How GitHub/Notion/OpenAI integrations are wired — secret priority, route structure, and a node --watch gotcha
---

Three integrations live under `server/routes/integrations.js` and `server/integrations/{github,openai}.js`.

**Secret priority:** env var first, then `settings` DB table key as override. This means GITHUB_TOKEN / OPENAI_API_KEY / NOTION_API_KEY environment secrets are the primary source; users can override per-install via the settings form which writes to the `settings` table.

**Route structure:**
- `GET /api/integrations` — status of all three (masked keys, counts, env_present flags)
- `POST /api/integrations/:service/test` — server-side connection test, returns metadata only
- `PUT /api/integrations/:service/config` — save a key override to the DB
- `POST /api/integrations/github/sync` — fetch all repos from GitHub API, upsert into `github_repos` table
- `GET /api/integrations/github/repos` — return locally cached repos
- `POST /api/integrations/openai/chat` — proxy a chat completion (keeps key server-side)

**DB table:** `github_repos` with `github_id BIGINT UNIQUE` as the upsert conflict key.

**Why:** Keys must never reach the browser. All test and sync operations are server-side; the frontend only receives metadata (username, model count, repo name) never the raw key.

**node --watch gotcha:** When a new route file is added and registered in `index.js`, `node --watch` does not always detect the change if the import is new (not a modification to an existing watched file). A full workflow restart is required after adding new imports to `index.js`.
