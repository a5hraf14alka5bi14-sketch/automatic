-- 009: prevent duplicate active suppliers by case/whitespace-normalised name.
-- Backs up the app-level dedup guard with a DB-level partial unique index so
-- concurrent POSTs / renames cannot create duplicates. Only active rows are
-- constrained, so soft-deleted suppliers never block a re-add.
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_norm_name_active_uidx
  ON suppliers (REGEXP_REPLACE(LOWER(TRIM(name)), '\s+', ' ', 'g'))
  WHERE active = true;
