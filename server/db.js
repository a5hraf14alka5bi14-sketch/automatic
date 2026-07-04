import pg from 'pg'
import { readFile } from 'node:fs/promises'
const { Pool } = pg

// Use DEV_DATABASE_URL when set (non-production) so dev experiments never touch
// the production data. Falls back to DATABASE_URL (the Replit-provisioned DB).
const IS_PROD_DB = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1'
const DB_URL     = (!IS_PROD_DB && process.env.DEV_DATABASE_URL) || process.env.DATABASE_URL

if (!IS_PROD_DB && process.env.DEV_DATABASE_URL) {
  console.log('[db] Using DEV_DATABASE_URL (development)')
} else if (IS_PROD_DB) {
  console.log('[db] Using DATABASE_URL (production)')
}

export const pool = new Pool({
  connectionString: DB_URL,
  ssl: DB_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
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
        must_change_password BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

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

    // Upgrade financial columns to 3 decimal places (OMR standard)
    await client.query(`
      ALTER TABLE orders
        ALTER COLUMN total    TYPE NUMERIC(10,3) USING total::NUMERIC(10,3),
        ALTER COLUMN subtotal TYPE NUMERIC(10,3) USING subtotal::NUMERIC(10,3),
        ALTER COLUMN tax      TYPE NUMERIC(10,3) USING tax::NUMERIC(10,3);
      ALTER TABLE customers
        ALTER COLUMN total_spent TYPE NUMERIC(10,3) USING total_spent::NUMERIC(10,3);
    `)

    // Add FK constraints idempotently — clean up orphans first to avoid violations
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_user') THEN
          UPDATE orders SET user_id = NULL
            WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
          ALTER TABLE orders ADD CONSTRAINT fk_orders_user
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_customer') THEN
          UPDATE orders SET customer_id = NULL
            WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM customers);
          ALTER TABLE orders ADD CONSTRAINT fk_orders_customer
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
        END IF;
      END $$;
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
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
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
      const bootstrapSecret = process.env.BOOTSTRAP_ADMIN_SECRET
      if (IS_PROD_DB && !bootstrapSecret) {
        console.warn(
          '[db] Production environment detected with no admin account and no BOOTSTRAP_ADMIN_SECRET set. ' +
          'Skipping default admin seed. Set BOOTSTRAP_ADMIN_SECRET to create an initial admin on first run.'
        )
      } else {
        const initialPassword = bootstrapSecret || 'Admin123'
        const bcrypt = await import('bcryptjs')
        const hash = await bcrypt.default.hash(initialPassword, 10)
        await client.query(
          'INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1, $2, $3, $4, $5)',
          ['Admin Manager', 'admin@automatic.com', hash, 'admin', true]
        )
      }
    }

    // One-time maintenance: when SEED_INVENTORY is set, reset inventory to the
    // supplier-invoice list. Soft-deletes any active rows, then inserts every
    // item from seed-data/inventory-items.json. Used to sync the live site's
    // inventory (the production DB is not directly writable by tooling).
    // IMPORTANT: remove this secret right after it runs, otherwise inventory
    // would be reset again on the next restart/deploy.
    if (process.env.SEED_INVENTORY === 'true') {
      await client.query('UPDATE inventory SET deleted_at = now() WHERE deleted_at IS NULL')
      let seedItems
      try {
        seedItems = JSON.parse(
          await readFile(new URL('./seed-data/inventory-items.json', import.meta.url), 'utf8')
        )
      } catch (err) {
        throw new Error(`Failed to load inventory seed (server/seed-data/inventory-items.json): ${err.message}`)
      }
      for (const item of seedItems) {
        await client.query(
          'INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,$2,$3,$4,$5,$6)',
          [item.name, item.category ?? null, item.quantity ?? 0, item.unit ?? 'kg', item.min_quantity ?? 0, item.cost ?? 0]
        )
      }
      console.warn(
        `[db] SEED_INVENTORY is set — reset inventory and inserted ${seedItems.length} item(s). ` +
        'Remove this secret so inventory is not reset on restart.'
      )
    }

    const menuCheck = await client.query('SELECT id FROM menu_items LIMIT 1')
    if (menuCheck.rows.length === 0) {
      // Seed the real Arabic menu (names, real prices, drinks & desserts) from
      // the exported customer menu. Keeping it in a data file avoids a large
      // hardcoded array and keeps a fresh/production DB in sync with the real
      // menu instead of generic English demo dishes.
      let items
      try {
        items = JSON.parse(
          await readFile(new URL('./seed-data/menu-items.json', import.meta.url), 'utf8')
        )
      } catch (err) {
        throw new Error(`Failed to load menu seed (server/seed-data/menu-items.json): ${err.message}`)
      }
      for (const item of items) {
        await client.query(
          `INSERT INTO menu_items (name, category, price, description, prep_time, tags, food_cost, available, image_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            item.name, item.category, item.price, item.description ?? '',
            item.prep_time ?? 15, item.tags ?? '', item.food_cost ?? 0,
            item.available ?? true, item.image_url ?? null,
          ]
        )
      }
    }

    const invCheck = await client.query('SELECT id FROM inventory LIMIT 1')
    if (invCheck.rows.length === 0) {
      // Seed the real Arabic inventory (frozen goods, dairy, spices, etc.) from
      // the exported stock list. Keeping it in a data file avoids a large
      // hardcoded array and keeps a fresh/production DB in sync with the real
      // inventory instead of generic English demo supplies.
      let items
      try {
        items = JSON.parse(
          await readFile(new URL('./seed-data/inventory-items.json', import.meta.url), 'utf8')
        )
      } catch (err) {
        throw new Error(`Failed to load inventory seed (server/seed-data/inventory-items.json): ${err.message}`)
      }
      for (const item of items) {
        await client.query(
          'INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,$2,$3,$4,$5,$6)',
          [
            item.name, item.category ?? null, item.quantity ?? 0, item.unit ?? 'kg',
            item.min_quantity ?? 0, item.cost ?? 0,
          ]
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
