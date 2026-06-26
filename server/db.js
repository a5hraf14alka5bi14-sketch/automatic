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
        name VARCHAR(255)
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
        loyalty_points INTEGER DEFAULT 0,
        total_orders INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)

    // Seed admin user
    const userCheck = await client.query('SELECT id FROM users WHERE email = $1', ['admin@automatic.com'])
    if (userCheck.rows.length === 0) {
      const bcrypt = await import('bcryptjs')
      const hash = await bcrypt.default.hash('admin123', 10)
      await client.query(
        'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
        ['Admin Manager', 'admin@automatic.com', hash, 'admin']
      )
    }

    // Seed menu items
    const menuCheck = await client.query('SELECT id FROM menu_items LIMIT 1')
    if (menuCheck.rows.length === 0) {
      const items = [
        ['Grilled Chicken Shawarma', 'mains', 12.99, 'Tender grilled chicken with garlic sauce'],
        ['Mixed Grill Platter', 'mains', 22.99, 'Assorted grilled meats with sides'],
        ['Falafel Wrap', 'wraps', 8.99, 'Crispy falafel with tahini and veggies'],
        ['Hummus & Pita', 'starters', 6.99, 'Creamy hummus with fresh pita bread'],
        ['Lebanese Salad', 'salads', 7.49, 'Fresh fattoush or tabbouleh'],
        ['Lamb Kofta', 'mains', 16.99, 'Spiced minced lamb skewers'],
        ['Lemonade Mint', 'drinks', 3.99, 'Fresh lemon with mint leaves'],
        ['Arabic Coffee', 'drinks', 2.99, 'Traditional cardamom coffee'],
        ['Kunafa', 'desserts', 5.99, 'Sweet cheese pastry with syrup'],
        ['Baklava Plate', 'desserts', 4.99, 'Assorted honey nut pastries'],
        ['Cheese Manakish', 'breakfast', 7.99, 'Flatbread with akkawi cheese'],
        ['Zaatar Manakish', 'breakfast', 5.99, 'Flatbread with zaatar and olive oil'],
      ]
      for (const [name, category, price, description] of items) {
        await client.query(
          'INSERT INTO menu_items (name, category, price, description) VALUES ($1,$2,$3,$4)',
          [name, category, price, description]
        )
      }
    }

    // Seed inventory
    const invCheck = await client.query('SELECT id FROM inventory LIMIT 1')
    if (invCheck.rows.length === 0) {
      const items = [
        ['Chicken', 'proteins', 15, 'kg', 5, 4.50],
        ['Lamb', 'proteins', 8, 'kg', 3, 9.00],
        ['Olive Oil', 'pantry', 10, 'L', 3, 6.00],
        ['Pita Bread', 'bread', 200, 'pcs', 50, 0.30],
        ['Tomatoes', 'vegetables', 12, 'kg', 4, 1.50],
        ['Lettuce', 'vegetables', 5, 'kg', 2, 2.00],
        ['Tahini', 'pantry', 4, 'kg', 1, 5.00],
        ['Rice', 'grains', 20, 'kg', 5, 1.20],
        ['Chickpeas', 'legumes', 3, 'kg', 2, 2.50],
        ['Lemons', 'fruits', 30, 'pcs', 10, 0.20],
      ]
      for (const [name, category, quantity, unit, min_quantity, cost] of items) {
        await client.query(
          'INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,$2,$3,$4,$5,$6)',
          [name, category, quantity, unit, min_quantity, cost]
        )
      }
    }

    // Seed customers
    const custCheck = await client.query('SELECT id FROM customers LIMIT 1')
    if (custCheck.rows.length === 0) {
      const customers = [
        ['Ahmed Al-Rashid', 'ahmed@example.com', '+961 70 123 456', 150, 12],
        ['Fatima Hassan', 'fatima@example.com', '+961 71 234 567', 80, 6],
        ['Karim Nasser', null, '+961 76 345 678', 30, 3],
        ['Sara Mansour', 'sara@example.com', null, 200, 18],
        ['Omar Khalil', 'omar@example.com', '+961 78 456 789', 0, 1],
      ]
      for (const [name, email, phone, points, orders] of customers) {
        await client.query(
          'INSERT INTO customers (name, email, phone, loyalty_points, total_orders) VALUES ($1,$2,$3,$4,$5)',
          [name, email, phone, points, orders]
        )
      }
    }

    console.log('Database initialized successfully')
  } finally {
    client.release()
  }
}
