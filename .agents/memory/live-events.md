---
name: Live events / real-time page sync
description: How cross-page real-time updates work (shared WS hook + server broadcasts)
---

# Live events architecture

All pages now stay in sync in real time via the existing `/ws` WebSocket.

- **Shared hook**: `src/utils/useLiveEvents.js` — `useLiveEvents(handler, types)` (auto-reconnect 5s, handler in ref) + `useDebouncedCallback(fn, delay)` to coalesce event bursts.
- **Event types**: `order_created`, `order_updated` (orders.js), `menu_updated` (menu.js POST/PATCH/DELETE/hard-delete), `inventory_updated` (inventory.js POST/PATCH/bulk-stocktake/DELETE), `low_stock` (health monitor).
- **Rule**: any new mutation route that changes data shown on other pages must `broadcast('<entity>_updated', {id, action})` after COMMIT.
- **Silent refresh pattern**: live refetches must NOT flip `loading` state (no spinner flash) — Reports uses a `refreshTick` state + `lastPeriodRef` to only show the spinner on first load/period change; AIExecutive `loadData({silent:true})`; Recipes refetches data directly without touching `loading`.
- **Why:** user requirement: "ترابط جميع الصفحات مباشر" — all pages must reflect changes instantly without manual refresh.
- Kitchen/Orders keep their own older WS wiring (with polling fallback) — don't duplicate the hook there without consolidating carefully.
