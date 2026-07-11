-- 011: keep customer-name order search fast as history grows
-- The order search (buildOrderFilters) matches customers via
--   name ILIKE '%term%'
-- which a plain B-tree index cannot serve, forcing a sequential scan of the
-- customers table. A pg_trgm GIN index makes that partial, case-insensitive
-- match index-backed so search stays responsive on large datasets.
-- Idempotent: CREATE EXTENSION / INDEX both use IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin (name gin_trgm_ops);
