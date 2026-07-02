---
name: Notion sync architecture
description: How the Notion integration syncs data — MCP (agent OAuth) vs REST (server bot token), and the sharing blocker
---

Two independent access paths to the same Notion workspace ("مساحة عمل Ashraf Alkasbi"):

- **MCP (custom-mcp Notion)** — OAuth to the human's account, FULL workspace access. Only available to the agent via `code_execution` callbacks (`mcpNotion_*`). NOT available to the running Express server.
- **REST (`NOTION_API_KEY`)** — a bot integration named "Replit". Connects fine (`/users/me` → bot "Replit"), but **cannot see any database** until the pages/databases are explicitly shared with it in the Notion UI. Until then every `databases/{id}/query` and page-create returns "Could not find database with ID… Make sure the relevant pages and databases are shared with your integration 'Replit'."

**The one-share unlock:** all 9+ databases live under a single parent page **"🚀 Automatic Restaurant"**. Sharing that parent page with the "Replit" connection cascades access to every child database — the server's REST sync then works with no code change.

**Data source model:** these databases are the NEW multi-data-source kind. A single database exposes several `collection://<id>` data sources (e.g. Menu&Recipes DB `6f3cf08f` also contains Order Items `e3e3a62a` and Sales `ed84c1af`). For MCP, always `fetch` the DB first and use the `collection://` data-source id with `notionQueryDataSources` / `create_pages` (`parent:{data_source_id}`). The server's REST code (version `2022-06-28`, `parent:{database_id}`) targets each DB's PRIMARY data source, which for menu/inventory/customers equals the standalone DB id — so it stays correct once shared.

**Sync direction:** local Postgres is the source of truth (menu 41, inventory 10, customers 6); Notion was essentially empty. So the real flow is PUSH local→Notion, not pull.

**How to apply:** To bootstrap immediately without waiting on sharing, the agent pushes via MCP `create_pages` and writes the returned page id back into each table's `notion_id` (unique col) so nothing duplicates later. For ongoing hands-off sync the user MUST share the parent page; then toggle `notion_auto_sync_enabled` (server boot reads it and calls `startAutoSync`). Config IDs live in `server/notion.js` DEFAULT_*_DS constants and match the data-source ids.
