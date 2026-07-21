-- Migration 020: Thawani online payment integration
--
-- Adds per-order payment tracking (online vs pay-at-till) and a log
-- table for every webhook event received from Thawani for auditability.

-- ── 1. payment_status on orders ────────────────────────────────────────────────
-- 'unpaid'    → default; customer will pay at the till (or payment pending)
-- 'paid'      → Thawani confirmed the payment
-- 'failed'    → Thawani reported failure / timeout
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'paid', 'failed'));

-- session_id returned by Thawani when a checkout session is created
ALTER TABLE orders ADD COLUMN IF NOT EXISTS thawani_session_id VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_orders_payment_status  ON orders (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_thawani_session ON orders (thawani_session_id)
  WHERE thawani_session_id IS NOT NULL;

-- ── 2. Payment webhook audit log ───────────────────────────────────────────────
-- Every event POSTed by Thawani is recorded here so staff can inspect raw
-- payloads and correlate with order records during reconciliation.
CREATE TABLE IF NOT EXISTS payment_webhook_log (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  session_id  VARCHAR(120),
  payload     JSONB NOT NULL,
  status      VARCHAR(30),
  processed   BOOLEAN NOT NULL DEFAULT FALSE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pwlog_order_id  ON payment_webhook_log (order_id);
CREATE INDEX IF NOT EXISTS idx_pwlog_session   ON payment_webhook_log (session_id);
CREATE INDEX IF NOT EXISTS idx_pwlog_received  ON payment_webhook_log (received_at DESC);
