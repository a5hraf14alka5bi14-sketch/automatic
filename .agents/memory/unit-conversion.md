---
name: Unit conversion for stock deduction
description: How recipe units convert to inventory units, and the fallback rule
---

`server/lib/units.js` `convertQuantity(qty, from, to)` converts within a
dimension only — mass (mg/g/kg), volume (ml/cl/l), count (pcs/dozen). Returns
`null` for cross-dimension or unknown, non-identical units.

`server/lib/inventory.js` `computeDeductAmount({ingQty, recipeUnit, invUnit,
orderQty})` converts the recipe qty into the inventory unit before multiplying
by order qty. On incompatible units it **falls back to the raw recipe quantity**
(pre-conversion behaviour) rather than dropping the deduction to 0.

**Why:** a recipe may specify grams while inventory is stored in kg; without
conversion the deduction was wrong by 1000x. Falling back on incompatible units
avoids silently zeroing legitimate deductions for legacy data with mismatched
units.

**How to apply:** used by orders PATCH `/:id/status` for both deduction
(complete) and restock (cancel). Keep both branches converting via the same
helper so they stay symmetric.
