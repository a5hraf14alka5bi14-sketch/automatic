import pg from 'pg'
const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
})

export async function initDb() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS notion_projects (
        id SERIAL PRIMARY KEY,
        notion_id VARCHAR(255) UNIQUE NOT NULL,
        notion_url TEXT,
        name VARCHAR(500) NOT NULL,
        status VARCHAR(50) DEFAULT 'not_started',
        status_label VARCHAR(100),
        priority VARCHAR(50),
        start_date DATE,
        due_date DATE,
        total_tasks INTEGER DEFAULT 0,
        last_synced TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS notion_tasks (
        id SERIAL PRIMARY KEY,
        notion_id VARCHAR(255) UNIQUE NOT NULL,
        notion_url TEXT,
        name VARCHAR(500) NOT NULL,
        status VARCHAR(50) DEFAULT 'not_started',
        status_label VARCHAR(100),
        priority VARCHAR(50),
        due_date DATE,
        project_notion_id VARCHAR(255),
        last_synced TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'staff',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        description TEXT,
        available BOOLEAN DEFAULT true,
        image_url TEXT,
        prep_time INTEGER DEFAULT 15,
        tags TEXT DEFAULT '',
        food_cost DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS recipe_ingredients (
        id SERIAL PRIMARY KEY,
        menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
        inventory_item_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
        ingredient_name VARCHAR(255) NOT NULL,
        quantity DECIMAL(10,3) NOT NULL DEFAULT 1,
        unit VARCHAR(50) DEFAULT 'pcs',
        cost DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL DEFAULT 'dine-in',
        table_number INTEGER,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        subtotal DECIMAL(10,2) DEFAULT 0,
        tax DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(10,2) DEFAULT 0,
        notes TEXT,
        payment_method VARCHAR(50),
        paid_at TIMESTAMP,
        customer_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        menu_item_id INTEGER REFERENCES menu_items(id),
        quantity INTEGER NOT NULL DEFAULT 1,
        price DECIMAL(10,2) NOT NULL,
        name VARCHAR(255),
        notes TEXT,
        modifiers JSONB DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS modifier_groups (
        id SERIAL PRIMARY KEY,
        menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        required BOOLEAN DEFAULT false,
        max_selections INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS modifiers (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES modifier_groups(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        price_delta DECIMAL(10,3) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        quantity DECIMAL(10,3) NOT NULL DEFAULT 0,
        unit VARCHAR(50) DEFAULT 'pcs',
        min_quantity DECIMAL(10,3) DEFAULT 0,
        cost DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50),
        address TEXT,
        notes TEXT,
        loyalty_points INTEGER DEFAULT 0,
        total_orders INTEGER DEFAULT 0,
        total_spent DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS github_repos (
        id SERIAL PRIMARY KEY,
        github_id BIGINT UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        full_name VARCHAR(500) NOT NULL,
        description TEXT,
        language VARCHAR(100),
        html_url TEXT,
        stars INTEGER DEFAULT 0,
        forks INTEGER DEFAULT 0,
        open_issues INTEGER DEFAULT 0,
        is_private BOOLEAN DEFAULT false,
        is_fork BOOLEAN DEFAULT false,
        default_branch VARCHAR(100),
        pushed_at TIMESTAMP,
        last_synced TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)

    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_discount NUMERIC(10,3) DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]';
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent DECIMAL(10,2) DEFAULT 0;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS notion_id VARCHAR(255) UNIQUE;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS notion_id VARCHAR(255) UNIQUE;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS notion_id VARCHAR(255) UNIQUE;
      ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS notion_id VARCHAR(255) UNIQUE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS notion_id VARCHAR(255) UNIQUE;
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id SERIAL PRIMARY KEY,
        notion_id VARCHAR(255) UNIQUE,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        department VARCHAR(100),
        salary DECIMAL(10,2),
        hire_date DATE,
        status VARCHAR(50) DEFAULT 'active',
        last_synced TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS finance_entries (
        id SERIAL PRIMARY KEY,
        notion_id VARCHAR(255) UNIQUE,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        type VARCHAR(50) NOT NULL DEFAULT 'income',
        category VARCHAR(100),
        description TEXT,
        amount DECIMAL(10,3) NOT NULL DEFAULT 0,
        reference VARCHAR(255),
        last_synced TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sync_log (
        id SERIAL PRIMARY KEY,
        service VARCHAR(50) NOT NULL DEFAULT 'notion',
        direction VARCHAR(20) NOT NULL DEFAULT 'pull',
        status VARCHAR(20) NOT NULL DEFAULT 'success',
        items_synced INTEGER DEFAULT 0,
        items_total INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS notion_github_links (
        id SERIAL PRIMARY KEY,
        github_repo_id INTEGER REFERENCES github_repos(id) ON DELETE CASCADE,
        notion_project_id INTEGER REFERENCES notion_projects(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(github_repo_id, notion_project_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sync_log_service ON sync_log(service);
      CREATE INDEX IF NOT EXISTS idx_sync_log_created_at ON sync_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notion_github_links_repo ON notion_github_links(github_repo_id);
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        inventory_item_id INTEGER REFERENCES inventory(id) ON DELETE CASCADE,
        change DECIMAL(12,3) NOT NULL,
        quantity_after DECIMAL(12,3),
        movement_type VARCHAR(30) NOT NULL,
        reference_type VARCHAR(30),
        reference_id INTEGER,
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_quantity ON inventory(quantity);
      CREATE INDEX IF NOT EXISTS idx_recipe_ing_menu_item ON recipe_ingredients(menu_item_id);
      CREATE INDEX IF NOT EXISTS idx_recipe_ing_inventory ON recipe_ingredients(inventory_item_id);
      CREATE INDEX IF NOT EXISTS idx_modifier_groups_item ON modifier_groups(menu_item_id);
      CREATE INDEX IF NOT EXISTS idx_modifiers_group ON modifiers(group_id);
      CREATE INDEX IF NOT EXISTS idx_stock_mov_item ON stock_movements(inventory_item_id);
      CREATE INDEX IF NOT EXISTS idx_stock_mov_created ON stock_movements(created_at DESC);
    `)

    const settingsDefaults = [
      ['restaurant_name', 'Automatic'],
      ['restaurant_tagline', 'Restaurant OS'],
      ['tax_rate', '11'],
      ['currency_symbol', 'OMR'],
      ['tables_count', '10'],
      ['receipt_footer', 'Thank you for dining with us!'],
      ['loyalty_points_per_omr', '1'],
    ]
    // Migrate legacy loyalty key → OMR-based key (preserve existing value, avoid dupes)
    await client.query(
      `UPDATE settings SET key = 'loyalty_points_per_omr'
       WHERE key = 'loyalty_points_per_dollar'
         AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'loyalty_points_per_omr')`
    )
    await client.query(`DELETE FROM settings WHERE key = 'loyalty_points_per_dollar'`)
    for (const [key, value] of settingsDefaults) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, value]
      )
    }
    await client.query(
      `UPDATE settings SET value = 'OMR' WHERE key = 'currency_symbol' AND value = '$'`
    )

    const userCheck = await client.query('SELECT id FROM users WHERE email = $1', ['admin@automatic.com'])
    if (userCheck.rows.length === 0) {
      const bcrypt = await import('bcryptjs')
      const hash = await bcrypt.default.hash('admin123', 10)
      await client.query(
        'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
        ['Admin Manager', 'admin@automatic.com', hash, 'admin']
      )
    }

    const menuCheck = await client.query('SELECT id FROM menu_items LIMIT 1')
    if (menuCheck.rows.length === 0) {
      const items = [
        ['Grilled Chicken Shawarma', 'shawarma', 12.99, 'Tender grilled chicken with garlic sauce', 30, '🌯,chicken,popular', 4.20],
        ['Mixed Shawarma Plate', 'shawarma', 16.99, 'Chicken and meat shawarma with sides', 35, '🌯,mixed,popular', 5.50],
        ['Mixed Grill Platter', 'grills', 22.99, 'Assorted grilled meats with sides', 40, '🔥,grill,popular', 7.80],
        ['Shish Tawook', 'grills', 14.99, 'Marinated chicken skewers', 25, '🔥,chicken', 4.80],
        ['Lamb Kofta', 'grills', 16.99, 'Spiced minced lamb skewers', 30, '🔥,lamb', 5.90],
        ['Falafel Wrap', 'sandwiches', 8.99, 'Crispy falafel with tahini and veggies', 10, '🥪,vegetarian,falafel', 2.10],
        ['Kafta Sandwich', 'sandwiches', 9.99, 'Spiced meat sandwich with veggies', 12, '🥪,meat', 3.20],
        ['Hummus & Pita', 'appetizers', 6.99, 'Creamy hummus with fresh pita bread', 5, '🥙,vegetarian', 1.80],
        ['Fattoush Salad', 'salads', 7.49, 'Fresh salad with crispy bread', 8, '🥗,vegetarian,fresh', 2.30],
        ['Tabbouleh', 'salads', 7.49, 'Parsley, tomato and bulgur salad', 8, '🥗,vegetarian,fresh', 1.90],
        ['Lebanese Salad', 'salads', 6.99, 'Fresh seasonal vegetables', 5, '🥗,vegetarian', 1.60],
        ['Cheese Manakish', 'manakish', 7.99, 'Flatbread with akkawi cheese', 12, '🫓,cheese,breakfast', 2.50],
        ['Zaatar Manakish', 'manakish', 5.99, 'Flatbread with zaatar and olive oil', 10, '🫓,zaatar,breakfast,vegetarian', 1.50],
        ['Meat Manakish', 'manakish', 8.99, 'Flatbread with spiced minced meat', 15, '🫓,meat,breakfast', 3.00],
        ['Kafta Meal', 'meals', 15.99, 'Kafta with rice and salad', 25, '🍱,meal,complete', 5.20],
        ['Grilled Chicken Meal', 'meals', 14.99, 'Grilled chicken with rice and salad', 25, '🍱,meal,chicken', 4.90],
        ['Lemonade Mint', 'drinks', 3.99, 'Fresh lemon with mint leaves', 3, '🥤,fresh,cold', 0.70],
        ['Jallab Juice', 'drinks', 4.49, 'Rose water, grape juice and pine nuts', 3, '🥤,traditional', 0.90],
        ['Arabic Coffee', 'drinks', 2.99, 'Traditional cardamom coffee', 5, '☕,hot,traditional', 0.60],
        ['Lebanese Tea', 'drinks', 2.49, 'Herbal tea blend', 5, '☕,hot', 0.40],
        ['Kunafa', 'desserts', 5.99, 'Sweet cheese pastry with syrup', 15, '🍮,sweet,hot', 2.00],
        ['Baklava Plate', 'desserts', 4.99, 'Assorted honey nut pastries', 5, '🍮,sweet,cold', 1.80],
        ['Maamoul', 'desserts', 3.99, 'Date-filled semolina cookies', 5, '🍮,traditional', 1.20],
      ]
      for (const [name, category, price, description, prep_time, tags, food_cost] of items) {
        await client.query(
          'INSERT INTO menu_items (name, category, price, description, prep_time, tags, food_cost) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [name, category, price, description, prep_time, tags, food_cost]
        )
      }
    }

    const invCheck = await client.query('SELECT id FROM inventory LIMIT 1')
    if (invCheck.rows.length === 0) {
      const items = [
        ['Chicken', 'proteins', 15, 'kg', 5, 4.50],
        ['Lamb', 'proteins', 8, 'kg', 3, 9.00],
        ['Kafta Mix', 'proteins', 6, 'kg', 2, 7.00],
        ['Olive Oil', 'pantry', 10, 'L', 3, 6.00],
        ['Pita Bread', 'bread', 200, 'pcs', 50, 0.30],
        ['Tomatoes', 'vegetables', 12, 'kg', 4, 1.50],
        ['Lettuce', 'vegetables', 5, 'kg', 2, 2.00],
        ['Parsley', 'vegetables', 3, 'kg', 1, 3.00],
        ['Cucumber', 'vegetables', 4, 'kg', 2, 1.80],
        ['Onions', 'vegetables', 8, 'kg', 3, 0.80],
        ['Tahini', 'pantry', 4, 'kg', 1, 5.00],
        ['Zaatar Mix', 'pantry', 3, 'kg', 1, 8.00],
        ['Akkawi Cheese', 'dairy', 4, 'kg', 2, 12.00],
        ['Rice', 'grains', 20, 'kg', 5, 1.20],
        ['Bulgur', 'grains', 5, 'kg', 2, 1.50],
        ['Chickpeas', 'legumes', 3, 'kg', 2, 2.50],
        ['Lemons', 'fruits', 30, 'pcs', 10, 0.20],
        ['Semolina', 'grains', 4, 'kg', 1, 2.00],
        ['Kunafa Dough', 'pantry', 5, 'kg', 2, 6.00],
        ['Sugar', 'pantry', 10, 'kg', 3, 1.00],
      ]
      for (const [name, category, quantity, unit, min_quantity, cost] of items) {
        await client.query(
          'INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,$2,$3,$4,$5,$6)',
          [name, category, quantity, unit, min_quantity, cost]
        )
      }
    }

    const custCheck = await client.query('SELECT id FROM customers LIMIT 1')
    if (custCheck.rows.length === 0) {
      const customers = [
        ['Ahmed Al-Rashid', 'ahmed@example.com', '+961 70 123 456', 150, 12, 187.50],
        ['Fatima Hassan', 'fatima@example.com', '+961 71 234 567', 80, 6, 94.80],
        ['Karim Nasser', null, '+961 76 345 678', 30, 3, 42.00],
        ['Sara Mansour', 'sara@example.com', null, 200, 18, 285.60],
        ['Omar Khalil', 'omar@example.com', '+961 78 456 789', 0, 1, 14.99],
      ]
      for (const [name, email, phone, points, orders, spent] of customers) {
        await client.query(
          'INSERT INTO customers (name, email, phone, loyalty_points, total_orders, total_spent) VALUES ($1,$2,$3,$4,$5,$6)',
          [name, email, phone, points, orders, spent]
        )
      }
    }

    console.log('Database initialized successfully')
  } finally {
    client.release()
  }
}

// Record a stock movement. Pass a transaction client (or pool) as `db` so the
// log is written atomically with the inventory change. `change` is signed:
// negative = stock out (sale), positive = stock in (restock/adjustment).
export async function recordStockMovement(db, {
  inventoryItemId, change, quantityAfter = null,
  movementType, referenceType = null, referenceId = null, note = null
}) {
  if (!inventoryItemId || !change) return
  await db.query(
    `INSERT INTO stock_movements
       (inventory_item_id, change, quantity_after, movement_type, reference_type, reference_id, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [inventoryItemId, change, quantityAfter, movementType, referenceType, referenceId, note]
  )
}
