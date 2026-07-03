-- 005: suppliers + purchase orders
CREATE TABLE IF NOT EXISTS suppliers (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  contact_name  TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  notes         TEXT,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            SERIAL PRIMARY KEY,
  supplier_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','received','cancelled')),
  ordered_at    TIMESTAMPTZ,
  received_at   TIMESTAMPTZ,
  notes         TEXT,
  total         NUMERIC(10,3) DEFAULT 0,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_id      INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
  item_name         TEXT NOT NULL,
  quantity          NUMERIC(10,3) NOT NULL,
  unit              TEXT DEFAULT 'kg',
  unit_cost         NUMERIC(10,3) NOT NULL DEFAULT 0,
  total_cost        NUMERIC(10,3) GENERATED ALWAYS AS (quantity * unit_cost) STORED
);

-- Link inventory items to suppliers
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS reorder_point NUMERIC(10,3) DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS reorder_qty   NUMERIC(10,3) DEFAULT 0;
