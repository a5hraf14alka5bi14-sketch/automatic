-- Phase 8 (POS & KDS Overhaul) columns on orders/order_items.
--
-- These columns are referenced throughout server/routes/orders.js,
-- server/validators.js, and the frontend, and are documented as delivered
-- in the project's Master Plan — but were never added to db.js or any
-- migration file. They exist on the long-running Replit database (added
-- out-of-band at some point), which is why this was never noticed until a
-- brand-new database (e.g. CI) was tried.
--
-- (orders.station / order_items.station are handled separately in
-- 015_stations.sql, since that migration's seed query needs them earlier.)
--
-- Column choices match how the code already uses them (see
-- server/routes/orders.js, server/validators.js):
--   - rush / done: boolean flags
--   - discount: same NUMERIC(10,3) precision as other money columns
--   - discount_type: 'fixed' | 'percent' (validators.js Joi.valid check)
--   - item_notes: short free text (Joi max length 500)

ALTER TABLE orders ADD COLUMN IF NOT EXISTS rush BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,3) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_notes TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS done BOOLEAN NOT NULL DEFAULT false;
