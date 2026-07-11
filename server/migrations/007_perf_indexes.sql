-- 007: performance indexes + barcode on menu, supplier indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(available) WHERE deleted_at IS NULL AND available = true;
CREATE INDEX IF NOT EXISTS idx_inventory_category   ON inventory(category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_name       ON inventory(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_active     ON suppliers(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_po_status            ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_supplier          ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_items_inv         ON purchase_order_items(inventory_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_num     ON orders(table_number) WHERE table_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_paid_at       ON orders(paid_at) WHERE paid_at IS NOT NULL;
