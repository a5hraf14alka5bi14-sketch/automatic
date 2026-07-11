---
name: Bilingual menu (name_ar)
description: How Arabic menu names are stored and surfaced app-wide
---
Menu items carry `name_ar` (menu_items column). Rules:
- **Order items don't snapshot name_ar** — it is joined live from menu_items inside ORDERS_SELECT's json_agg (`LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id`). Soft-deleted items still join (no deleted_at filter there), so old receipts keep Arabic names.
- **Why:** avoids a backfill/migration of historical order_items; the join is 1:1 on PK so no row multiplication or GROUP BY change.
- **How to apply:** any new surface showing item names should render `item.name_ar` conditionally with `dir="rtl"`; search filters match `name_ar` with plain `.includes(search)` (no lowercasing — Arabic has no case).
- Canonical menu data lives in `scripts/update-menu-bilingual.js`; re-running it is the way to reconcile menu content (updates in place by English name, preserves recipes).
