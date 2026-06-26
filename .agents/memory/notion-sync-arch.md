---
name: Notion sync architecture
description: How the Notion integration syncs data — MCP for reads, REST for writes
---

The NOTION_API_KEY is a Replit internal integration token. The Notion databases (Projects + Tasks) were NOT shared with this integration via the Notion UI, so direct REST API calls to `api.notion.com/v1/databases/{id}/query` return 404.

The MCP server (custom-mcp Notion) has full workspace access via a different auth path and CAN query the databases using `mcpNotion_notionQueryDataSources`.

**Architecture:**
- **Reads/Sync:** Agent uses `mcpNotion_notionQueryDataSources` with SQL, maps rows, then POSTs to `/api/notion/projects/ingest` or `/api/notion/tasks/ingest` which upsert into PostgreSQL.
- **Writes (status updates, new pages):** Express backend calls `client.pages.update()` / `client.pages.create()` directly — these work because they operate on page IDs, not database-level queries.
- **Data source IDs:** Projects = `bea6bf0f-16f9-455c-b887-dee7b7cba587`, Tasks = `2ea23851-9271-456c-bad7-cfa25fa2683d`

**Why:** The Replit integration token doesn't have DB-level access (Notion requires explicit sharing in the workspace UI). The MCP server bypasses this with its own auth.

**How to apply:** When the user wants a re-sync, the agent must run the MCP query → ingest pipeline (not a backend-only endpoint). The `/api/notion/projects/sync` and `/api/notion/tasks/sync` routes were removed; use `/ingest` endpoints instead, called from the agent layer after MCP queries.
