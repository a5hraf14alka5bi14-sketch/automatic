-- 008: widen money columns to 3 decimal places (OMR uses 3-decimal baisa)
ALTER TABLE menu_items         ALTER COLUMN price     TYPE numeric(10,3);
ALTER TABLE menu_items         ALTER COLUMN food_cost TYPE numeric(10,3);
ALTER TABLE order_items        ALTER COLUMN price     TYPE numeric(10,3);
ALTER TABLE inventory          ALTER COLUMN cost      TYPE numeric(10,3);
ALTER TABLE recipe_ingredients ALTER COLUMN cost      TYPE numeric(10,3);
