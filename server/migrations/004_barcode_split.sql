-- 004: barcode on menu_items + split_payments table
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_barcode_idx ON menu_items (barcode) WHERE barcode IS NOT NULL;

-- Split payments: multiple payment records per order
CREATE TABLE IF NOT EXISTS split_payments (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method        TEXT NOT NULL CHECK (method IN ('cash','card','other')),
  amount        NUMERIC(10,3) NOT NULL CHECK (amount > 0),
  paid_at       TIMESTAMPTZ DEFAULT NOW(),
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS split_payments_order_idx ON split_payments(order_id);
