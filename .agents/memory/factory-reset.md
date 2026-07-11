---
name: Factory reset feature
description: How the operational-data factory reset works and its ordering constraints
---
- POST /api/admin/factory-reset (admin-only, body {confirm:'RESET', inventoryMode:'zero'|'keep'}); logic in server/lib/factory-reset.js; UI danger-zone card in System page.
- Mandatory runBackup() BEFORE deletion; abort on backup failure.
- **Ordering rule:** sequences must be restarted immediately after the DELETEs and BEFORE inserting opening stock_movements — resetting them after re-inserts causes duplicate-key on the next insert (architect caught this).
- Purges: split_payments, order_items, orders, shifts, stock_movements, purchase_order_items, purchase_orders, finance_entries, audit_log, sync_log. Customers rows kept, counters zeroed. AI-summary settings keys cleared. device_tokens + notion_* intentionally kept.
- Broadcasts factory_reset + order_updated + inventory_updated + menu_updated so all pages live-refresh (no new client wiring needed).
- Tests must stay guard-only (401/403/400) — a real reset test would wipe the shared dev DB.
