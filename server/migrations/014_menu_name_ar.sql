-- Bilingual menu: Arabic display name alongside the English name.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS name_ar VARCHAR(255);
