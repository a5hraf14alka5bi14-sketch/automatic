---
name: Recipe→inventory linking
description: How recipe ingredients get linked to inventory so sales deduct stock; matching util + manual-review UI
---

# Recipe → inventory linking

Selling a dish deducts stock only for `recipe_ingredients` rows where `inventory_item_id IS NOT NULL` (deduction lives in `server/routes/orders.js` PATCH `/:id/status`). The gap was unlinked rows: costing-sheet ingredient names (e.g. `لحم`) differ from supplier inventory names (e.g. `لحم تندرلين`).

**Decision: manual review + ranked suggestions, NO auto-apply.**
**Why:** ZERO exact normalized matches exist between the two name sets, and auto-linking shared tokens is dangerous (e.g. `دجاج`/chicken would wrongly match `كبدة دجاج`/chicken liver). Auto-linking would silently deduct the wrong stock.

**How to apply:**
- Matching util: `server/utils/ingredientMatch.js` — `normalizeAr` (strip tashkeel/tatweel, unify alef/ya/hamza/ta-marbuta), `tokenize` (Arabic STOP words), `scoreMatch`, `rankInventory`.
- Endpoints in `server/routes/menu.js`, placed BEFORE `/:id` (Express route ordering): GET `/recipe/link-summary`, GET `/recipe/unlinked` (groups by ingredient_name + top suggestions), PATCH `/recipe/link` (links all rows sharing a name, optional apply_cost, recalcs food_cost), PATCH `/recipe/unlink`. Per-row `PATCH /:id/recipe/:rid` also accepts `inventory_item_id` (only changes link when the field is present).
- UI: `InventoryLinkTab` in `src/pages/Recipes.jsx` ("🔗 Inventory Links" tab) — progress bar, suggestion chips + full dropdown + sync-cost checkbox, RTL.

**The generic-term vs SKU mismatch (why auto-token-linking is unsafe):** recipes use generic Egyptian culinary terms (لحم, فراخ, بصل, بطاطا, حمص) while the supplier inventory is a Syrian SKU list (لحم تندرلين, دجاج مجمد 700غ). EXACT normalized matches between the two sets = 0; many everyday ingredients (خس, بقدونس, حمص, نعناع, جبنه) have ZERO inventory candidates; the rest are 1-to-many/ambiguous. Real inventory quantities are all `0.000` (supply list, not a stocktake).

**Resolution (user decision "add missing SKUs then link"):** all `recipe_ingredients` (currently 328 rows / 91 distinct names, all unit `kg`) are linked. For each of the 91 distinct names a dedicated inventory item was created under `category='ingredients'` and every recipe row with that name linked to it. This keeps the supplier SKU catalog untouched and gives functional deduction. NOTE: recipes are NOT seeded by `server/db.js` (only menu_items + inventory are), so these links live only in the live DB; a fresh DB has no recipes to link. Do not add the generic `ingredients` items to `inventory-items.json` (they'd be orphans there).

**Deletion-graveyard hazard (seen 2026-07-05):** a merge/inventory re-seed soft-deleted all 91 `ingredients` items (set `deleted_at`), leaving every recipe row linked to an invisible, qty-0 graveyard item — so `link-summary` still reported 100% linked while the feature was effectively OFF (deduction JOIN in orders.js does NOT filter `deleted_at`, but items were invisible in the Inventory UI and qty 0 meant `GREATEST(0, 0-x)=0`, no movement, no visible change; `stock-availability` DOES filter `deleted_at` so warnings also broke). **Fix = reactivate (`deleted_at=NULL`) those items and give a non-zero opening stock** so sales visibly deduct. When auditing this feature, check that linked items are `deleted_at IS NULL` AND `quantity>0`, not just that `inventory_item_id IS NOT NULL`.
