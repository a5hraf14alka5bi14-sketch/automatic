---
name: Notion sync architecture
description: How the Notion integration syncs data — MCP (agent OAuth) vs REST (server bot token), and the sharing blocker
---

Two independent access paths to the same Notion workspace:

- **MCP (custom-mcp Notion)** — OAuth to the human's account, FULL workspace access. Only available to the agent via `code_execution` callbacks (`mcpNotion_*`). NOT available to the running Express server.
- **REST (`NOTION_API_KEY`)** — a bot integration named "Replit". Connects fine (`/users/me` → bot "Replit"), but **cannot see any database** until the pages/databases are explicitly shared with it in the Notion UI. Until then every `databases/{id}/query` and page-create returns "Could not find database with ID… Make sure the relevant pages and databases are shared with your integration 'Replit'."

**The one-share unlock:** all 9+ databases live under a single parent page **"🚀 Automatic Restaurant"**. Sharing that parent page with the "Replit" connection cascades access to every child database — the server's REST sync then works with no code change.

**Data source model & the REST-id-vs-data-source-id trap:** these databases are the NEW multi-data-source kind. The `collection://<id>` **data-source id** used by MCP is DIFFERENT from the **database container id** that REST (`Notion-Version 2022-06-28`, `/databases/{id}/query`, `parent:{database_id}`) requires. Using a data-source id in REST returns "Could not find database with ID…" even when it IS shared — the error is misleading. Resolve the real database ids via REST `POST /search` with `filter:{property:'object',value:'database'}` and match by title. `server/notion.js` DEFAULT_*_DS constants must hold the REST **database** ids (e.g. Menu data-source `6f3cf08f` → database `55d032d4`; Inventory `fb57f374` → `39197a5a`; Customers `ff5b19de` → `5e03302c`). MCP layer still uses the `collection://` data-source ids.

**Sync direction:** local Postgres is the source of truth (menu 41, inventory 10, customers 6); Notion was essentially empty. So the real flow is PUSH local→Notion, not pull.

**How to apply:** To bootstrap immediately without waiting on sharing, the agent pushes via MCP `create_pages` and writes the returned page id back into each table's `notion_id` (unique col) so nothing duplicates later. For ongoing hands-off sync the user MUST share the parent page; then toggle `notion_auto_sync_enabled` (server boot reads it and calls `startAutoSync`). Config IDs live in `server/notion.js` DEFAULT_*_DS constants and must be the REST database-container ids (see trap above), not the data-source ids.
