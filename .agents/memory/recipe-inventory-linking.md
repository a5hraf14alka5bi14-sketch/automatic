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

**Bulk-linking is blocked on a data mismatch, not code.** ~322/338 `recipe_ingredients` are unlinked; EXACT normalized matches = 0. Recipes use generic Egyptian culinary terms (لحم, فراخ, بصل, بطاطا, حمص) while inventory is a Syrian supplier SKU list (لحم تندرلين, دجاج مجمد 700غ). Many everyday ingredients (خس, بقدونس, بطاطا, حمص, نعناع, جبنه) have ZERO inventory candidates; the rest are 1-to-many/ambiguous. Real inventory quantities are all `0.000` (supply list, not a stocktake). Completing the link requires a business decision from the user (add missing SKUs / provide a mapping / accept only unambiguous auto-links) — do NOT auto-link tokens.
