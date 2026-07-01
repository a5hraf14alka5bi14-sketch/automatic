---
name: Notion rollup/formula numeric mapping
description: How numeric Notion fields (Food Cost, Cost per Unit, etc.) are resolved across number/rollup/formula property types in the sync mappers
---

Numeric Notion properties in this project may be plain `number`, a `rollup`, or a `formula`. The sync mappers must not read `.number` directly for fields that could be computed.

**Rule:** use `getNumeric(prop)` (server/integrations/notion.js) for any numeric field that could be derived — Food Cost and Calories on menu items, Cost per Unit and Quantity on recipe ingredients. `getNumeric` tries `rollup` → `formula` → plain `number` and returns a Number or null.

**Why:** a well-designed Notion Recipe DB rolls up ingredient costs onto the menu item's Food Cost (rollup array of numbers → summed). Reading `.number` on a rollup property returns null, silently zeroing food cost / margins.

**How to apply:**
- `getRollup` sums numeric `array` rollups, passes through `number`/`date` rollups, joins text rollups.
- `getNumeric` string coercion is strict (`/^-?\d*\.?\d+$/`) — non-numeric formula strings return null, never a partial parse.
- `getRelationIds` returns ALL relation ids (array); `getRelationId` still returns only the first — use the plural one for multi-relation fields.
