# Integrations Setup Guide

All integrations are managed from the **🔌 Integrations** page in the sidebar.

---

## GitHub

**Purpose:** Sync repository metadata into the local database for project tracking.

### Setup

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Set a note (e.g. "Automatic Restaurant OS")
4. Select expiry (90 days recommended)
5. Select scopes:
   - `repo` — access to repositories
   - `read:user` — read your profile
   - `read:org` — read organization repos (optional)
6. Click **Generate token** and copy it (starts with `ghp_`)
7. Add it as a Replit Secret named `GITHUB_TOKEN`
   — or paste it into the GitHub card on the Integrations page

### What it does

- **Test connection:** calls `GET /user` and returns your login and repo count
- **Sync repos:** fetches all your repos (paginated) and upserts into the `github_repos` PostgreSQL table
- **View repos:** shows the locally cached repos with language, stars, and links

---

## Notion

**Purpose:** Bidirectional sync of projects and tasks between Notion and the local database.

### Setup

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **New integration**
3. Give it a name, select your workspace, click **Save**
4. Copy the **Internal Integration Token** (starts with `secret_`)
5. Add it as a Replit Secret named `NOTION_API_KEY`
6. **Share your databases with the integration:**
   - Open each database in Notion
   - Click `···` → **Connections** → add your integration
7. Copy each database's ID from its URL (the UUID in the URL after the workspace slug)
8. Add the IDs on the Integrations → Notion Settings section

### Status mapping

The Notion workspace uses Arabic status names. The system maps them internally:

| Arabic | English (internal) |
|---|---|
| لم تبدأ | `not_started` |
| قيد التنفيذ | `in_progress` |
| تم | `done` |

### Sync architecture

**Reads (Notion → App):** Triggered by the agent using the MCP server (`mcpNotion_notionQueryDataSources`), which has full workspace access. Results are ingested via `POST /api/notion/projects/ingest` and `POST /api/notion/tasks/ingest`.

**Writes (App → Notion):** Status changes in the UI call `client.pages.update()` via the REST API directly — no agent needed.

---

## OpenAI

**Purpose:** Power AI features — chat assistant, smart suggestions, sales forecasting.

### Setup

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click **Create new secret key**
3. Copy the key (starts with `sk-`)
4. Add it as a Replit Secret named `OPENAI_API_KEY`
5. Ensure your OpenAI account has billing enabled

### What it does

- **Test connection:** calls `GET /v1/models` and returns available model count
- **AI chat demo:** on the Integrations page, type any restaurant-related question and get a GPT response
- **Chat proxy:** `POST /api/integrations/openai/chat` accepts `{ messages, model }` and proxies to OpenAI — the key is never sent to the browser

### Default model

`gpt-4o-mini` — cost-efficient for most restaurant automation tasks.

---

## Security Notes

- All keys are stored as Replit environment secrets
- Keys are masked in the UI: first 6 characters + `•••` + last 4 characters
- All connection tests and external API calls run server-side in Express
- The browser only receives response metadata (username, model count, repo names) — never the raw key
