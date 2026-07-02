---
name: Inventory seed from file
description: Where fresh-DB inventory seed data now comes from, and why the English demo rows are gone
---

# Inventory seed comes from a JSON file

Fresh-DB inventory seeding in `server/db.js` loads `server/seed-data/inventory-items.json` (349 real Arabic supplier SKUs), mirroring the existing `menu-items.json` pattern. The previous hardcoded English demo array was removed.

**Why:** the DB carried ~10 leftover English demo inventory rows alongside the real Arabic supply list; they had no recipe/stock_movement references and were confusing "fake" data. Deleting them from the live DB isn't enough — a fresh DB would re-seed the demo rows unless the seed source is also fixed.

**How to apply:** to change the default inventory catalog, edit the JSON file, not code. Real quantities in the file are `0.000` (it's a supply/SKU list, not a stocktake).
