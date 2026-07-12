-- Migration 012: Additional performance indexes
-- Covers: orders time-range + status queries (dashboard, reports, filters)
--         inventory low-stock queries
--         order_items order aggregation

-- Composite index for order list queries filtered by status + time (most common pattern).
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders(status, created_at DESC);

-- Index for pure date-range scans (reports, AI KPI queries) not filtered by status.
CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON orders(created_at DESC);

-- Partial index for low-stock alert query: WHERE quantity <= min_quantity AND deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock
  ON inventory(min_quantity, quantity) WHERE deleted_at IS NULL;

-- Covering index for order_items aggregations (top items by period) — avoids seq scan on large tables.
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items(order_id);
