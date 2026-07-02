-- Soft delete: mark rows as removed without destroying them.
-- DELETE endpoints set deleted_at = NOW(); list queries filter deleted_at IS NULL.

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE inventory  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE customers  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_menu_items_deleted_at ON menu_items(deleted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_deleted_at  ON inventory(deleted_at);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at  ON customers(deleted_at);
