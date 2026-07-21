-- Migration 019: QR self-ordering source tag, Support Tickets, Expenses

-- ── 1. orders.source — tracks whether order came from staff POS or customer QR ─
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'staff';

-- ── 2. Support tickets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name   VARCHAR(120),
  user_email  VARCHAR(254),
  topic       VARCHAR(100) NOT NULL,
  name        VARCHAR(120) NOT NULL,
  phone       VARCHAR(40),
  details     TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status    ON support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id   ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created   ON support_tickets (created_at DESC);

-- ── 3. Expenses ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          SERIAL PRIMARY KEY,
  category    VARCHAR(100) NOT NULL,
  vendor      VARCHAR(120),
  amount      NUMERIC(10,3) NOT NULL CHECK (amount > 0),
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date        ON expenses (date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category    ON expenses (category);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by  ON expenses (created_by);
