-- Migration 025: store conversion_factor snapshot on purchase_order_items
-- This ensures the receive route uses the factor that was in effect at PO creation time,
-- not whatever the inventory item says at the moment of receiving (which may have changed).
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(10,3) DEFAULT NULL;

COMMENT ON COLUMN purchase_order_items.conversion_factor IS
  'Snapshot of inventory.units_per_purchase_unit at PO creation time.
   Only set when entered_in_purchase_unit = true. Used by the receive route
   to convert purchase-unit qty → base stock-unit qty deterministically.';

-- Fix data inconsistency: Kinza Cola/Lemon/Orange/Cola Diet variants used "carton"
-- as the base tracking unit, which prevented pack-size conversion.
-- Correct setup: base unit = "can" (smallest dispensing unit), purchase_unit = "carton",
-- units_per_purchase_unit = 30 (matching Kinza Citrus which was already correct).
-- Stock quantities are reset to 0 (they were 0 in the DB already).
UPDATE inventory
SET
  unit                    = 'can',
  purchase_unit           = 'carton',
  units_per_purchase_unit = 30
WHERE name IN (
  'Kinza Cola 30x250ml',
  'Kinza Cola Diet 30x250ml',
  'Kinza Lemon 30x250ml',
  'Kinza Orange 30x250ml'
)
AND deleted_at IS NULL;
