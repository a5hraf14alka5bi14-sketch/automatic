-- Migration 015_stations — Managed kitchen stations.
-- NOTE: Two files share the "015" prefix (015_fk_indexes and 015_stations).
-- Both were applied successfully — the runner tracks by full filename, not prefix.
-- Do NOT add another 015_*.sql file; use 023+ for new migrations.
--
-- Managed kitchen stations. Previously the station list was derived purely
-- from stations already used in orders/order_items, so a new station only
-- became a filter option after its first order and there was no way to
-- pre-create, rename or retire one. This table is the managed source of
-- truth; existing station values in order data are seeded in so nothing
-- already in use disappears.
CREATE TABLE IF NOT EXISTS stations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed with the built-in defaults plus every station actually used in data
-- (legacy values stay filterable).
INSERT INTO stations (name)
SELECT DISTINCT station FROM (
  SELECT 'kitchen' AS station
  UNION SELECT 'bar'
  UNION SELECT 'drinks'
  UNION SELECT station FROM orders      WHERE station IS NOT NULL AND station <> ''
  UNION SELECT station FROM order_items WHERE station IS NOT NULL AND station <> ''
) s
ON CONFLICT (name) DO NOTHING;

-- Menu items can be pinned to a managed station; NULL = automatic routing by
-- category (the existing POS behaviour).
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS station VARCHAR(50);
