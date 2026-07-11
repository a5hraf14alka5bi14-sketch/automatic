---
name: Task-merge DB propagation is unreliable
description: How isolated task-agent database changes do (and don't) show up in the main DB, and the duplicate/junk-row risk after merges
---

Isolated task agents run against their own database, and how their data reaches
the main DB is inconsistent and must not be trusted blindly.

Observed both failure modes in one session on this project:
- A task that only **edited existing rows** (repricing menu_items directly) did
  NOT persist to the main DB — main still showed the pre-task values.
- A later task merge **injected the agent's own rows** into the main DB: ~40
  English placeholder menu items (generic names, inflated prices, a bogus
  `meals` category) plus a nameless `(بدون اسم)` / price-0 junk row, none of
  which existed in main before and none authored here. They duplicated the real
  Arabic menu (e.g. "Kunafa" 7.99 vs "كنافة" 2.50).

**Why:** merges bring in code + a reconciled DB snapshot; pure row-edits can be
lost while wholesale rows the agent added can appear. The db.js seed was NOT the
source (its names/prices differ and its guard only fires on an empty table).

**How to apply:**
- After ANY task merge, re-query the main DB directly before trusting counts.
- Apply data-only fixes (pricing, cleanups) as the **main agent on the main DB**,
  not via an isolated task agent.
- After merges, scan for duplicate / placeholder / non-Arabic menu rows. Quick
  filter for injected English rows: `name ~ '^[ -~]+$'` (this whole app's real
  data is Arabic). Confirm `order_items` don't reference rows before deleting.
