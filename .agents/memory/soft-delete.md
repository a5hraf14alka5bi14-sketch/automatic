---
name: Soft delete
description: deleted_at soft-delete scope and what must NOT be filtered
---

`deleted_at TIMESTAMP` exists on `menu_items`, `inventory`, `customers` (added
via `001_soft_delete.sql`). DELETE endpoints set `deleted_at=NOW()` instead of
removing rows; menu also keeps `/:id/hard` for permanent delete.

Only the **entity's own** list/detail/stats endpoints filter `deleted_at IS
NULL` (menu `/`, `/all`, `/stats`, `/food-cost`, `/:id`; inventory `/`,
`/low-stock`, `/stats`, `/impact`; customers `/`, `/:id`).

**Why:** historical order/report joins must still see soft-deleted menu/inventory
rows so past orders and receipts render correctly. Do NOT add
`deleted_at IS NULL` to order or report queries.

**How to apply:** when adding a new query that surfaces *active* menu/inventory/
customer rows to users, add the `deleted_at IS NULL` filter; when it reflects
historical transactions, leave it unfiltered.
