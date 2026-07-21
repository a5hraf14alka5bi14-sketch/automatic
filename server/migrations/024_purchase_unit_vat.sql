-- Migration 024: Purchase unit conversion + Input VAT tracking
-- Adds pack-size conversion (e.g. cartons of 30 pcs) to inventory items, and
-- VAT fields to purchase order line items for input VAT reconciliation.

-- ── 1. Purchase unit fields on inventory ──────────────────────────────────────
-- purchase_unit: label of the supplier packaging (e.g. 'carton', 'box', 'case')
-- units_per_purchase_unit: how many base-unit quantities are in one purchase unit
--   e.g. purchase_unit='carton', units_per_purchase_unit=30 means
--        1 carton = 30 pcs (where pcs is the inventory tracking unit)
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS purchase_unit VARCHAR(50),
  ADD COLUMN IF NOT EXISTS units_per_purchase_unit NUMERIC(10,3);

-- ── 2. VAT and purchase-unit flags on PO line items ───────────────────────────
-- vat_inclusive: is unit_cost VAT-inclusive? false = exclusive (Oman B2B default)
-- vat_rate: VAT % for this line (default 5%)
-- entered_in_purchase_unit: was the quantity entered in purchase units?
--   When true, received qty is multiplied by units_per_purchase_unit on the
--   linked inventory item before adding to stock.
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS entered_in_purchase_unit BOOLEAN NOT NULL DEFAULT false;

-- ── 3. Generated VAT computation columns ──────────────────────────────────────
-- net_unit_cost: VAT-exclusive cost per unit — used by food_cost calculations
--   vat_exclusive: net_unit_cost = unit_cost (already ex-VAT)
--   vat_inclusive: net_unit_cost = unit_cost / (1 + rate/100)
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS net_unit_cost NUMERIC(10,3)
    GENERATED ALWAYS AS (
      CASE WHEN vat_inclusive
        THEN ROUND(unit_cost / (1.0 + vat_rate / 100.0), 3)
        ELSE unit_cost
      END
    ) STORED;

-- input_vat_amount: total VAT paid on this line
--   vat_exclusive: input_vat = qty * unit_cost * rate/100
--   vat_inclusive: input_vat = gross - net  =  qty*unit_cost - qty*(unit_cost/(1+rate/100))
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS input_vat_amount NUMERIC(10,3)
    GENERATED ALWAYS AS (
      CASE WHEN vat_inclusive
        THEN ROUND(quantity * unit_cost - quantity * ROUND(unit_cost / (1.0 + vat_rate / 100.0), 3), 3)
        ELSE ROUND(quantity * unit_cost * vat_rate / 100.0, 3)
      END
    ) STORED;
