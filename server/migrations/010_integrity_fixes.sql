-- 010: DB integrity fixes
-- (a) Widen DECIMAL(10,2) financial columns to NUMERIC(10,3) for OMR consistency
-- (b) Add UNIQUE constraint on recipe_ingredients to prevent duplicate ingredient rows
-- All changes are idempotent via DO $$ blocks — safe to re-run.

DO $$
BEGIN
  -- Widen finance_entries.amount if the table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finance_entries' AND column_name = 'amount'
  ) THEN
    ALTER TABLE finance_entries
      ALTER COLUMN amount TYPE NUMERIC(10,3) USING amount::NUMERIC(10,3);
  END IF;

  -- Widen modifier_groups.additional_price if the column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modifier_groups' AND column_name = 'additional_price'
  ) THEN
    ALTER TABLE modifier_groups
      ALTER COLUMN additional_price TYPE NUMERIC(10,3) USING additional_price::NUMERIC(10,3);
  END IF;

  -- Add unique constraint on recipe_ingredients if not already present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recipe_ingredients_unique'
      AND table_name = 'recipe_ingredients'
  ) THEN
    ALTER TABLE recipe_ingredients
      ADD CONSTRAINT recipe_ingredients_unique
      UNIQUE (menu_item_id, inventory_item_id);
  END IF;
END $$;
