-- Migration 026: party size (PAX) and fire-together flag on orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS adults_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kids_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fire_together BOOLEAN NOT NULL DEFAULT false;
