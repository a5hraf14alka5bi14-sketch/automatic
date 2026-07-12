-- Migration 018: Multi-branch support
-- Adds a `branches` table and a nullable `branch_id` FK on `orders`.
-- Existing orders and all other tables are unaffected (NULL branch = unassigned).
-- A single "Main Branch" row is inserted as the default so existing single-branch
-- deployments see one branch immediately without any extra setup.

-- ── Branches table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  name_ar     VARCHAR(120),
  address     TEXT,
  phone       VARCHAR(40),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce at most one default branch using a partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS branches_one_default_idx
  ON branches (is_default)
  WHERE is_default = TRUE;

-- Seed the main (default) branch if the table is empty.
INSERT INTO branches (name, name_ar, is_active, is_default)
SELECT 'Main Branch', 'الفرع الرئيسي', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM branches);

-- ── orders.branch_id ──────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders (branch_id);
