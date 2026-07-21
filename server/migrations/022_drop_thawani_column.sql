-- Migration 022: Remove the now-unused thawani_session_id column from orders.
--
-- Thawani Payments was fully replaced by Tap Payments (migration 021).
-- The column and its partial index are dead schema and are safe to drop.
-- The payment_webhook_log.session_id column is kept — it carries Thawani
-- historical events and renaming would require a data migration; those rows
-- are inert but useful for audit history.

DROP INDEX IF EXISTS idx_orders_thawani_session;
ALTER TABLE orders DROP COLUMN IF EXISTS thawani_session_id;
