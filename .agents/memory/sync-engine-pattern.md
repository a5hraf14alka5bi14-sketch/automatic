---
name: Sync Engine Pattern
description: server/integrations/sync-engine.js manages periodic background sync with adapter registry, sync_log table, and auto-restore on restart.
---

# Sync Engine Pattern

## The Rule
All periodic sync is managed through `sync-engine.js`. Services register an adapter function; the engine handles scheduling, logging, and persistence.

**Why:** Decouples sync scheduling from service logic. Makes it easy to add new services (GitHub auto-sync, etc.) without touching the timer code.

## How to Apply
1. `registerAdapter('notion', syncAll)` in `server/index.js` after DB init
2. `startAutoSync('notion', ms)` / `stopAutoSync()` — controlled via `PUT /api/integrations/notion/auto-sync`
3. Auto-sync state persisted in `settings` table as `notion_auto_sync_enabled` and `notion_auto_sync_interval`
4. On server restart, `initSyncEngine()` in `server/index.js` reads those settings and re-arms the timer
5. Timer uses `timer.unref()` so it won't prevent graceful process exit

## DB Table
`sync_log`: service, direction (pull/push), status (success/error), items_synced, items_total, error_message, created_at
`notion_github_links`: links github_repos.id → notion_projects.id (many-to-one, unique per pair)
