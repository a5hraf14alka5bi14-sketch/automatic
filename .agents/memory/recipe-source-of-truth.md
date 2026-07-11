---
name: Recipe data source of truth
description: .local/menu.json is the authoritative import source for recipe_ingredients; use it to reconcile/recover quantities
---

# Recipe data source of truth

`.local/menu.json` is the authoritative source that `recipe_ingredients` was seeded from: an array of 74 dishes, each `{name, sell, food_cost, ingredients:[{name, qty, unit_price, cost}]}`, totalling 338 ingredient lines — exactly matching the DB row count.

**Why:** recipe rows were never pushed to Notion (all `notion_id` are NULL), so Notion is NOT a recovery source. There is no seed script. `menu.json` is the only ground truth for original per-row `quantity`/`cost`.

**How to apply:** to reconcile or recover recipe quantities, match by normalized dish name + normalized ingredient name (use `normalizeAr` from `server/utils/ingredientMatch.js`), then restore `quantity` and recalc `menu_items.food_cost = SUM(cost*quantity)` per affected menu item. Names match cleanly after normalization (0 unmatched across all 338 rows). Original state: 16 rows linked to inventory id 412; the rest unlinked.
