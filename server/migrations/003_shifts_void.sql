-- Migration 003: shifts table (Z-Report) + void tracking columns on orders

-- Void tracking fields on orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS void_reason    TEXT,
  ADD COLUMN IF NOT EXISTS voided_by      INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS voided_at      TIMESTAMP;

-- Shifts table: tracks open/closed work periods for Z-Report reconciliation
CREATE TABLE IF NOT EXISTS shifts (
  id                 SERIAL PRIMARY KEY,
  opened_by          INTEGER REFERENCES users(id),
  closed_by          INTEGER REFERENCES users(id),
  opened_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at          TIMESTAMP,
  expected_cash      NUMERIC(10,3) NOT NULL DEFAULT 0,
  actual_cash        NUMERIC(10,3),
  variance           NUMERIC(10,3),
  total_orders       INTEGER      NOT NULL DEFAULT 0,
  total_revenue      NUMERIC(10,3) NOT NULL DEFAULT 0,
  revenue_by_method  JSONB        NOT NULL DEFAULT '{}',
  discounts_total    NUMERIC(10,3) NOT NULL DEFAULT 0,
  voids_count        INTEGER      NOT NULL DEFAULT 0,
  voids_total        NUMERIC(10,3) NOT NULL DEFAULT 0,
  notes              TEXT,
  status             TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_shifts_status    ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_opened_at ON shifts(opened_at);

-- Link orders to the shift they were placed in
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(id);
