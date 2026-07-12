---
name: Managed kitchen stations
description: Stations are a managed DB list, not inferred from order data; validation vs routing sets differ.
---

Stations live in a `stations` table with three distinct sets (server/lib/stations.js `getStationSets`):
- **active** — what new work (menu assignment, order routing, dropdowns) may target.
- **valid** — active + retired + any legacy value found in order data + defaults; used ONLY for `?station=` filter validation so old links never 400.
- **filterList** — active in stable order for UI dropdowns.

**Why:** retiring/renaming a station must never break historical orders or saved filter links, and order create must never 500 on a stale client — unknown/inactive stations are silently coerced to `kitchen`.

**How to apply:** any new endpoint filtering by station validates against `valid`; anything writing a station validates against `active`. Names are slug-normalised (`normaliseStationName`); POST of a retired same-name reactivates (200) instead of 409. Cache is 30s — call `invalidateStationCache()` after mutations; UI listens for the `stations_updated` broadcast.
