---
name: Recipe link integrity
description: Why recipe→inventory link coverage must validate that link targets are active, and the safeguards around soft-delete.
---

**Rule:** Any "coverage" or "linked %" metric over a foreign key must verify the target row is still active (not soft-deleted), not just that the FK column is non-NULL. Soft delete bypasses FK constraints, so soft-delete paths on referenced tables need explicit reference guards.

**Why:** An inventory re-seed once soft-deleted all 91 recipe-linked ingredient items while `recipe_ingredients.inventory_item_id` kept pointing at them. The link summary only checked `IS NOT NULL`, so it reported 100% linked while stock deduction was silently off menu-wide.

**How to apply:**
- Link-summary joins active inventory and reports `broken`/`distinct_broken` separately; UI shows a red banner when broken > 0.
- `DELETE /api/inventory/:id` (soft delete) returns 409 if any recipe references the item — the FK-violation catch never fires for soft deletes.
- `reactivateRecipeLinkedInventory()` (server/db.js) runs at every startup and un-deletes recipe-referenced items, so merges/re-seeds self-heal on next boot (restart still required mid-run — see follow-up).
