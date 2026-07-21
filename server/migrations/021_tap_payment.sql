-- Migration 021: Switch online payment from Thawani to Tap Payments
--
-- Adds tap_charge_id column (replaces thawani_session_id usage),
-- renames the webhook log session_id reference to also carry charge_id,
-- and adds an index to support stale awaiting_payment order cleanup.
--
-- orders.status = 'awaiting_payment' is now a valid application status for
-- QR orders that have been created but whose payment is not yet confirmed.
-- These orders are invisible to kitchen/staff until payment succeeds.

-- ── 1. tap_charge_id on orders ────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tap_charge_id VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_orders_tap_charge
  ON orders (tap_charge_id)
  WHERE tap_charge_id IS NOT NULL;

-- ── 2. Support fast cleanup of stale awaiting_payment orders ─────────────────
-- The cleanup job queries: WHERE status='awaiting_payment' AND created_at < cutoff
CREATE INDEX IF NOT EXISTS idx_orders_awaiting_payment
  ON orders (created_at)
  WHERE status = 'awaiting_payment';

-- ── 3. Extend webhook log to carry generic charge_id ─────────────────────────
-- The existing session_id column is kept for historical Thawani events;
-- new Tap events will use charge_id.
ALTER TABLE payment_webhook_log ADD COLUMN IF NOT EXISTS charge_id VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_pwlog_charge
  ON payment_webhook_log (charge_id)
  WHERE charge_id IS NOT NULL;
