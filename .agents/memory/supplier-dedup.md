---
name: Supplier name deduplication
description: How duplicate supplier rows are prevented (case/whitespace-normalised name)
---

Supplier uniqueness is enforced at three layers, all keyed on the SAME normalised
form: `REGEXP_REPLACE(LOWER(TRIM(name)), '\s+', ' ', 'g')`.

1. App-level pre-check on POST `/api/suppliers` and PATCH `/api/suppliers/:id`
   (PATCH excludes self via `id <> $2`) → returns `409` before insert/update.
2. DB-level partial unique index `suppliers_norm_name_active_uidx` on the
   normalised expression `WHERE active = true` (migration 009). Catches the
   TOCTOU race the app check misses.
3. Both POST and PATCH catch pg error `23505` and translate it to a clean `409`.

**Why:** app-level checks alone are TOCTOU-racy and don't cover renames; the
partial index is the real integrity guarantee. It is scoped to `active = true`
so a soft-deleted supplier never blocks re-adding the same name.

**How to apply:** if you add another supplier write path, reuse the SAME
normalisation expression and keep the `active = true` scoping, or the index and
the app check will disagree. Before adding/altering the index on a populated DB,
first check there are no existing active normalised-name collisions (the index
creation fails otherwise).
