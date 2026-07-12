-- Indexes on foreign-key columns that were missing one (join/cascade performance).
CREATE INDEX IF NOT EXISTS idx_orders_shift_id ON orders(shift_id) WHERE shift_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_voided_by ON orders(voided_by) WHERE voided_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_supplier_id ON inventory(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_opened_by ON shifts(opened_by);
CREATE INDEX IF NOT EXISTS idx_shifts_closed_by ON shifts(closed_by) WHERE closed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON purchase_orders(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_ngl_notion_project_id ON notion_github_links(notion_project_id) WHERE notion_project_id IS NOT NULL;
