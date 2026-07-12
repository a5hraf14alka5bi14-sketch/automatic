-- 017: partial PO receipt support
-- Add received_qty tracking per line item so partial deliveries can be recorded
-- incrementally without losing the original ordered quantity.

-- Track how much of each ordered line was actually received so far.
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS received_qty NUMERIC(10,3) NOT NULL DEFAULT 0;

-- Expand the status CHECK to include 'partially_received'.
-- PostgreSQL does not support ALTER CONSTRAINT; drop and re-add.
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('draft','ordered','partially_received','received','cancelled'));
