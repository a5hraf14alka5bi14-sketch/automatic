-- Migration 027: Table reservations, walk-in waitlist, order receipt share tokens

CREATE TABLE IF NOT EXISTS reservations (
  id                  SERIAL PRIMARY KEY,
  customer_name       TEXT    NOT NULL,
  phone               TEXT,
  party_size          INTEGER NOT NULL DEFAULT 2 CHECK (party_size >= 1),
  reservation_date    DATE    NOT NULL,
  reservation_time    TIME    NOT NULL,
  table_number        INTEGER,
  status              TEXT    NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','seated','cancelled','no-show')),
  notes               TEXT,
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_date   ON reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);

CREATE TABLE IF NOT EXISTS waitlist (
  id            SERIAL PRIMARY KEY,
  customer_name TEXT    NOT NULL,
  phone         TEXT,
  party_size    INTEGER NOT NULL DEFAULT 2 CHECK (party_size >= 1),
  quoted_wait   INTEGER,               -- estimated wait in minutes
  notes         TEXT,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seated_at     TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','seated','removed')),
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);

-- Receipt sharing token: a random URL-safe token generated on demand
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_orders_receipt_token
  ON orders(receipt_token) WHERE receipt_token IS NOT NULL;
