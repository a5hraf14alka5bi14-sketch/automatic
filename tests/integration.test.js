// Integration tests — exercise the real Express app + PostgreSQL.
// Self-contained: every row created here is tagged with a unique run id and
// removed in afterAll, so the suite is safe to run against the dev database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'

const TAG = `itest_${Date.now()}`
const ADMIN_EMAIL = `${TAG}_admin@test.local`
const STAFF_EMAIL = `${TAG}_staff@test.local`
const MANAGER_EMAIL = `${TAG}_manager@test.local`
const PASSWORD = 'TestPass123'

const ids = { adminUser: null, staffUser: null, managerUser: null, menuItem: null, invItem: null, invItem2: null, recipe: null, customer: null, order: null }

async function seedUser(email, role) {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const r = await pool.query(
    'INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} ${role}`, email, hash, role]
  )
  return r.rows[0].id
}

async function login(email) {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD })
  expect(res.status).toBe(200)
  return agent
}

let admin, staff, manager

beforeAll(async () => {
  ids.adminUser = await seedUser(ADMIN_EMAIL, 'admin')
  ids.staffUser = await seedUser(STAFF_EMAIL, 'staff')
  ids.managerUser = await seedUser(MANAGER_EMAIL, 'manager')

  // Inventory item stored in kg; recipe expressed in g -> exercises conversion.
  const inv = await pool.query(
    "INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,'test',10,'kg',1,5) RETURNING id",
    [`${TAG} Flour`]
  )
  ids.invItem = inv.rows[0].id

  const inv2 = await pool.query(
    "INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,'test',3,'pcs',1,2) RETURNING id",
    [`${TAG} Napkins`]
  )
  ids.invItem2 = inv2.rows[0].id

  const menu = await pool.query(
    "INSERT INTO menu_items (name, category, price, available) VALUES ($1,'test',2.5,true) RETURNING id",
    [`${TAG} Manoushe`]
  )
  ids.menuItem = menu.rows[0].id

  const rec = await pool.query(
    "INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, ingredient_name, quantity, unit) VALUES ($1,$2,$3,200,'g') RETURNING id",
    [ids.menuItem, ids.invItem, `${TAG} Flour`]
  )
  ids.recipe = rec.rows[0].id

  const cust = await pool.query(
    'INSERT INTO customers (name, email) VALUES ($1,$2) RETURNING id',
    [`${TAG} Diner`, `${TAG}_cust@test.local`]
  )
  ids.customer = cust.rows[0].id

  admin = await login(ADMIN_EMAIL)
  staff = await login(STAFF_EMAIL)
  manager = await login(MANAGER_EMAIL)
})

afterAll(async () => {
  if (ids.order) await pool.query('DELETE FROM orders WHERE id=$1', [ids.order])
  await pool.query('DELETE FROM recipe_ingredients WHERE id=$1', [ids.recipe])
  await pool.query('DELETE FROM menu_items WHERE id=$1', [ids.menuItem])
  await pool.query('DELETE FROM inventory WHERE id = ANY($1)', [[ids.invItem, ids.invItem2].filter(Boolean)])
  await pool.query('DELETE FROM customers WHERE id=$1', [ids.customer])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[ids.adminUser, ids.staffUser, ids.managerUser].filter(Boolean)])
  await pool.end()
})

describe('Auth', () => {
  it('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/api/inventory')
    expect(res.status).toBe(401)
  })

  it('allows authenticated access', async () => {
    const res = await admin.get('/api/inventory')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('RBAC', () => {
  it('forbids staff from creating inventory (403)', async () => {
    const res = await staff.post('/api/inventory').send({ name: `${TAG} X`, quantity: 1, unit: 'kg' })
    expect(res.status).toBe(403)
  })

  it('lets staff read inventory (GET allowed)', async () => {
    const res = await staff.get('/api/inventory')
    expect(res.status).toBe(200)
  })

  it('lets admin create+delete inventory', async () => {
    const created = await admin.post('/api/inventory').send({ name: `${TAG} Temp`, quantity: 1, unit: 'kg' })
    expect(created.status).toBe(201)
    const del = await admin.delete(`/api/inventory/${created.body.id}`)
    expect(del.status).toBe(200)
    await pool.query('DELETE FROM inventory WHERE id=$1', [created.body.id])
  })
})

describe('Inventory deduction on order completion', () => {
  it('deducts converted quantity when an order is completed', async () => {
    const create = await admin.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: ids.menuItem, name: `${TAG} Manoushe`, quantity: 2, price: 2.5 }],
      subtotal: 5, tax: 0, total: 5,
    })
    expect(create.status).toBe(201)
    ids.order = create.body.id

    const before = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.invItem])
    expect(parseFloat(before.rows[0].quantity)).toBe(10)

    const complete = await admin.patch(`/api/orders/${ids.order}/status`).send({ status: 'completed', payment_method: 'cash' })
    expect(complete.status).toBe(200)

    // 200 g/item * 2 items = 400 g = 0.4 kg deducted from a 10 kg stock -> 9.6 kg
    const after = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.invItem])
    expect(parseFloat(after.rows[0].quantity)).toBeCloseTo(9.6, 3)

    // A stock movement of type 'sale' should have been logged.
    const mov = await pool.query(
      "SELECT * FROM stock_movements WHERE inventory_item_id=$1 AND movement_type='sale'",
      [ids.invItem]
    )
    expect(mov.rows.length).toBeGreaterThan(0)
  })

  it('restocks when a completed order is cancelled', async () => {
    const cancel = await admin.patch(`/api/orders/${ids.order}/status`).send({ status: 'cancelled', void_reason: 'Test cleanup' })
    expect(cancel.status).toBe(200)
    const after = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.invItem])
    expect(parseFloat(after.rows[0].quantity)).toBeCloseTo(10, 3)
  })
})

describe('Order status reversal symmetry (stock + loyalty)', () => {
  it('reverting a completed order restores stock and loyalty, and re-completing does not double-deduct', async () => {
    // Give the customer a loyalty balance so we can exercise redemption refunds.
    await pool.query('UPDATE customers SET loyalty_points=100, total_orders=0, total_spent=0 WHERE id=$1', [ids.customer])
    const snap = async () => {
      const c = (await pool.query('SELECT loyalty_points, total_orders, total_spent FROM customers WHERE id=$1', [ids.customer])).rows[0]
      const inv = parseFloat((await pool.query('SELECT quantity FROM inventory WHERE id=$1', [ids.invItem])).rows[0].quantity)
      return {
        loyalty: parseInt(c.loyalty_points), orders: parseInt(c.total_orders),
        spent: parseFloat(c.total_spent), inv,
      }
    }

    const base = await snap()
    expect(base.inv).toBeCloseTo(10, 3) // previous order was cancelled → back to 10 kg

    const create = await admin.post('/api/orders').send({
      type: 'takeaway', customer_id: ids.customer,
      items: [{ menu_item_id: ids.menuItem, name: `${TAG} Manoushe`, quantity: 1, price: 2.5 }],
      subtotal: 2.5, tax: 0, total: 2.5,
    })
    expect(create.status).toBe(201)
    const oid = create.body.id

    // Complete, redeeming 5 points.
    const done = await admin.patch(`/api/orders/${oid}/status`).send({ status: 'completed', payment_method: 'cash', loyalty_redemption_points: 5 })
    expect(done.status).toBe(200)
    const afterComplete = await snap()
    expect(afterComplete.inv).toBeCloseTo(9.8, 3) // 200 g deducted from 10 kg

    // Revert to an active status (NOT cancelled) — stock and loyalty must fully reverse.
    const revert = await admin.patch(`/api/orders/${oid}/status`).send({ status: 'pending', void_reason: 'Reversal test' })
    expect(revert.status).toBe(200)
    const afterRevert = await snap()
    expect(afterRevert.inv).toBeCloseTo(10, 3)
    expect(afterRevert.loyalty).toBe(base.loyalty) // earned removed AND redeemed refunded
    expect(afterRevert.orders).toBe(base.orders)
    expect(afterRevert.spent).toBeCloseTo(base.spent, 3)

    // Completing again must deduct exactly once more (not stack on the reverted sale).
    const done2 = await admin.patch(`/api/orders/${oid}/status`).send({ status: 'completed', payment_method: 'cash' })
    expect(done2.status).toBe(200)
    const afterRecomplete = await snap()
    expect(afterRecomplete.inv).toBeCloseTo(9.8, 3) // single deduction, not 9.6

    // Clean up this test's order + its movements.
    await pool.query("DELETE FROM stock_movements WHERE reference_type='order' AND reference_id=$1", [oid])
    await pool.query('DELETE FROM order_items WHERE order_id=$1', [oid])
    await pool.query('DELETE FROM orders WHERE id=$1', [oid])
  })
})

describe('Stock availability endpoint', () => {
  it('reports max sellable per dish from linked ingredients only', async () => {
    // invItem currently 9.8 kg, recipe uses 200 g/item → floor(9800/200) = 49
    const res = await admin.get('/api/menu/stock-availability')
    expect(res.status).toBe(200)
    expect(res.body[ids.menuItem]).toBe(49)
  })
})

describe('Unlinked recipe ingredients are skipped on completion', () => {
  it('deducts only the linked ingredient and completes cleanly when a recipe has an unlinked row', async () => {
    // A dish whose recipe has one LINKED ingredient (deducts real stock) and
    // one UNLINKED ingredient (inventory_item_id NULL — intentionally not
    // stock-tracked). Completion must deduct only the linked one and never fail.
    const inv = await pool.query(
      "INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,'test',5,'kg',0,3) RETURNING id",
      [`${TAG} Cheese`]
    )
    const invId = inv.rows[0].id
    const menu = await pool.query(
      "INSERT INTO menu_items (name, category, price, available) VALUES ($1,'test',3.0,true) RETURNING id",
      [`${TAG} Mixed Dish`]
    )
    const mId = menu.rows[0].id
    // Linked row: 250 g of Cheese per item.
    await pool.query(
      "INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, ingredient_name, quantity, unit) VALUES ($1,$2,$3,250,'g')",
      [mId, invId, `${TAG} Cheese`]
    )
    // Unlinked row: no inventory_item_id — must be skipped entirely.
    await pool.query(
      "INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, ingredient_name, quantity, unit) VALUES ($1,NULL,$2,100,'g')",
      [mId, `${TAG} Untracked Spice`]
    )

    const create = await admin.post('/api/orders').send({
      type: 'takeaway',
      items: [{ menu_item_id: mId, name: `${TAG} Mixed Dish`, quantity: 2, price: 3.0 }],
      subtotal: 6, tax: 0, total: 6,
    })
    expect(create.status).toBe(201)
    const oid = create.body.id

    const complete = await admin.patch(`/api/orders/${oid}/status`).send({ status: 'completed', payment_method: 'cash' })
    expect(complete.status).toBe(200)

    // Linked Cheese: 250 g * 2 = 500 g = 0.5 kg deducted from 5 kg -> 4.5 kg.
    const after = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [invId])
    expect(parseFloat(after.rows[0].quantity)).toBeCloseTo(4.5, 3)

    // Exactly one linked ingredient generated a 'sale' movement; the unlinked
    // row produced none (it has no inventory_item_id to record against).
    const mov = await pool.query(
      "SELECT COUNT(*)::int AS c FROM stock_movements WHERE reference_type='order' AND reference_id=$1 AND movement_type='sale'",
      [oid]
    )
    expect(mov.rows[0].c).toBe(1)

    await pool.query("DELETE FROM stock_movements WHERE reference_type='order' AND reference_id=$1", [oid])
    await pool.query('DELETE FROM order_items WHERE order_id=$1', [oid])
    await pool.query('DELETE FROM orders WHERE id=$1', [oid])
    await pool.query('DELETE FROM recipe_ingredients WHERE menu_item_id=$1', [mId])
    await pool.query('DELETE FROM menu_items WHERE id=$1', [mId])
    await pool.query('DELETE FROM inventory WHERE id=$1', [invId])
  })
})

describe('Soft delete', () => {
  it('hides a deleted inventory item from the list but keeps the row', async () => {
    const del = await admin.delete(`/api/inventory/${ids.invItem2}`)
    expect(del.status).toBe(200)

    const list = await admin.get('/api/inventory?limit=500')
    expect(list.body.find(i => i.id === ids.invItem2)).toBeUndefined()

    const row = await pool.query('SELECT deleted_at FROM inventory WHERE id=$1', [ids.invItem2])
    expect(row.rows.length).toBe(1)
    expect(row.rows[0].deleted_at).not.toBeNull()
  })

  it('hides a deleted customer from the list but keeps the row', async () => {
    const del = await admin.delete(`/api/customers/${ids.customer}`)
    expect(del.status).toBe(200)

    const list = await admin.get('/api/customers?limit=500')
    expect(list.body.find(c => c.id === ids.customer)).toBeUndefined()

    const row = await pool.query('SELECT deleted_at FROM customers WHERE id=$1', [ids.customer])
    expect(row.rows[0].deleted_at).not.toBeNull()
  })

  it('hides a deleted menu item from /all but keeps the row', async () => {
    const del = await admin.delete(`/api/menu/${ids.menuItem}`)
    expect(del.status).toBe(200)

    const list = await admin.get('/api/menu/all')
    expect(list.body.find(m => m.id === ids.menuItem)).toBeUndefined()

    const row = await pool.query('SELECT deleted_at FROM menu_items WHERE id=$1', [ids.menuItem])
    expect(row.rows[0].deleted_at).not.toBeNull()
  })
})

// ── Regression: PO double-receive guard ──────────────────────────────────────
describe('PO double-receive guard', () => {
  it('returns 409 on second receive and increments inventory exactly once', async () => {
    const suppRes = await admin.post('/api/suppliers').send({ name: `${TAG} DoubleRecv Supplier` })
    expect(suppRes.status).toBe(201)
    const suppId = suppRes.body.id

    // Linked inventory item (starts at 0) so we can prove the restock runs once.
    const inv = await pool.query(
      "INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,'test',0,'kg',0,2) RETURNING id",
      [`${TAG} Widget Stock`]
    )
    const invId = inv.rows[0].id

    const poRes = await admin.post('/api/suppliers/purchase-orders').send({
      supplier_id: suppId,
      items: [{ inventory_id: invId, item_name: `${TAG} Widget`, quantity: 10, unit: 'kg', unit_cost: 2 }],
    })
    expect(poRes.status).toBe(201)
    const poId = poRes.body.id

    const r1 = await admin.post(`/api/suppliers/purchase-orders/${poId}/receive`)
    expect(r1.status).toBe(200)
    const afterFirst = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [invId])
    expect(parseFloat(afterFirst.rows[0].quantity)).toBeCloseTo(10, 3)

    const r2 = await admin.post(`/api/suppliers/purchase-orders/${poId}/receive`)
    expect(r2.status).toBe(409)
    // The rejected second receive must NOT have restocked again.
    const afterSecond = await pool.query('SELECT quantity FROM inventory WHERE id=$1', [invId])
    expect(parseFloat(afterSecond.rows[0].quantity)).toBeCloseTo(10, 3)

    await pool.query('DELETE FROM purchase_order_items WHERE purchase_order_id=$1', [poId])
    await pool.query('DELETE FROM purchase_orders WHERE id=$1', [poId])
    await pool.query('DELETE FROM suppliers WHERE id=$1', [suppId])
    await pool.query('DELETE FROM inventory WHERE id=$1', [invId])
  })
})

// ── Regression: must_change_password propagates on token refresh ──────────────
describe('must_change_password propagation', () => {
  it('blocks API access after admin sets must_change_password and token is refreshed', async () => {
    const email = `${TAG}_mcp@test.local`
    const uid = await seedUser(email, 'staff')
    const agent = await login(email)

    const preRes = await agent.get('/api/menu/all')
    expect(preRes.status).toBe(200)

    await pool.query('UPDATE users SET must_change_password = true WHERE id = $1', [uid])

    // Once an admin mandates a password change, the very next refresh must be
    // rejected — the server will not mint a fresh session for a flagged account.
    const refreshRes = await agent.post('/api/auth/refresh')
    expect(refreshRes.status).toBe(403)
    expect(refreshRes.body.mustChangePassword).toBe(true)

    await pool.query('DELETE FROM users WHERE id=$1', [uid])
  })
})

// ── Regression: transparent bcrypt hash upgrade on login ─────────────────────
describe('Password hash upgrade on login', () => {
  it('re-hashes a legacy cost-10 password at cost 12 after a successful login', async () => {
    const email = `${TAG}_rehash@test.local`
    // seedUser hashes at bcrypt cost 10 (the legacy strength).
    const uid = await seedUser(email, 'staff')
    try {
      const before = await pool.query('SELECT password FROM users WHERE id=$1', [uid])
      expect(before.rows[0].password.split('$')[2]).toBe('10')

      // A normal successful login should transparently upgrade the stored hash.
      const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD })
      expect(res.status).toBe(200)

      const after = await pool.query('SELECT password FROM users WHERE id=$1', [uid])
      expect(after.rows[0].password.split('$')[2]).toBe('12')
      // The hash actually changed and still authenticates the same password.
      expect(after.rows[0].password).not.toBe(before.rows[0].password)
      const relog = await request(app).post('/api/auth/login').send({ email, password: PASSWORD })
      expect(relog.status).toBe(200)
    } finally {
      await pool.query('DELETE FROM users WHERE id=$1', [uid])
    }
  })
})

// ── Regression: admin self-lockout guards ────────────────────────────────────
describe('Admin self-lockout protection', () => {
  it('blocks an admin from changing their own role and leaves it unchanged', async () => {
    const res = await admin.patch(`/api/users/${ids.adminUser}/role`).send({ role: 'staff' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Cannot change your own role')

    const check = await pool.query('SELECT role FROM users WHERE id=$1', [ids.adminUser])
    expect(check.rows[0].role).toBe('admin')
  })

  it('blocks an admin from deleting their own account and leaves the row intact', async () => {
    const res = await admin.delete(`/api/users/${ids.adminUser}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Cannot delete your own account')

    const check = await pool.query('SELECT id FROM users WHERE id=$1', [ids.adminUser])
    expect(check.rows.length).toBe(1)
  })
})

// ── Regression: kitchen role order field filtering ────────────────────────────
describe('Kitchen role order financial field filtering', () => {
  let kitchen
  const KITCHEN_EMAIL = `${TAG}_kitchen@test.local`

  beforeAll(async () => {
    await seedUser(KITCHEN_EMAIL, 'kitchen')
    kitchen = await login(KITCHEN_EMAIL)
  })

  it('strips financial fields from orders for kitchen role', async () => {
    const menu = await pool.query(
      "INSERT INTO menu_items (name, category, price, available) VALUES ($1,'test',5.0,true) RETURNING id",
      [`${TAG} KitchenTestDish`]
    )
    const mId = menu.rows[0].id

    const orderRes = await admin.post('/api/orders').send({
      type: 'dine-in', table_number: 1,
      items: [{ menu_item_id: mId, quantity: 1, price: 5.0, name: `${TAG} KitchenTestDish` }],
    })
    expect(orderRes.status).toBe(201)
    const oId = orderRes.body.id

    const res = await kitchen.get(`/api/orders/${oId}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(oId)
    expect(res.body.items).toBeDefined()
    expect(res.body.total).toBeUndefined()
    expect(res.body.subtotal).toBeUndefined()
    expect(res.body.tax).toBeUndefined()
    expect(res.body.discount).toBeUndefined()
    expect(res.body.payment_method).toBeUndefined()
    expect(res.body.void_reason).toBeUndefined()

    await pool.query('DELETE FROM order_items WHERE order_id=$1', [oId])
    await pool.query('DELETE FROM orders WHERE id=$1', [oId])
    await pool.query('DELETE FROM menu_items WHERE id=$1', [mId])
  })
})

// ── Elevation of privilege: user management ──────────────────────────────────
describe('User management privilege boundary', () => {
  it('forbids a non-admin from listing users (403)', async () => {
    const res = await staff.get('/api/users')
    expect(res.status).toBe(403)
  })

  it('forbids a non-admin from creating users (403)', async () => {
    const res = await staff.post('/api/users').send({
      name: `${TAG} Sneaky`,
      email: `${TAG}_sneaky@test.local`,
      password: PASSWORD,
      role: 'admin',
    })
    expect(res.status).toBe(403)
    // Nothing should have been written.
    const check = await pool.query('SELECT id FROM users WHERE email=$1', [`${TAG}_sneaky@test.local`])
    expect(check.rows.length).toBe(0)
  })

  it("forbids a non-admin from changing another user's role (403)", async () => {
    const res = await staff.patch(`/api/users/${ids.adminUser}/role`).send({ role: 'staff' })
    expect(res.status).toBe(403)
    // The admin's role must be untouched.
    const row = await pool.query('SELECT role FROM users WHERE id=$1', [ids.adminUser])
    expect(row.rows[0].role).toBe('admin')
  })

  it('forbids a non-admin from deleting another user (403)', async () => {
    const res = await staff.delete(`/api/users/${ids.adminUser}`)
    expect(res.status).toBe(403)
    // The target row must still exist.
    const row = await pool.query('SELECT id FROM users WHERE id=$1', [ids.adminUser])
    expect(row.rows.length).toBe(1)
  })

  it('forbids a manager from listing users (403)', async () => {
    const res = await manager.get('/api/users')
    expect(res.status).toBe(403)
  })

  it('forbids a manager from creating users (403)', async () => {
    const res = await manager.post('/api/users').send({
      name: `${TAG} MgrSneaky`,
      email: `${TAG}_mgrsneaky@test.local`,
      password: PASSWORD,
      role: 'admin',
    })
    expect(res.status).toBe(403)
    // Nothing should have been written.
    const check = await pool.query('SELECT id FROM users WHERE email=$1', [`${TAG}_mgrsneaky@test.local`])
    expect(check.rows.length).toBe(0)
  })

  it("forbids a manager from changing another user's role (403)", async () => {
    const res = await manager.patch(`/api/users/${ids.adminUser}/role`).send({ role: 'staff' })
    expect(res.status).toBe(403)
    // The admin's role must be untouched.
    const row = await pool.query('SELECT role FROM users WHERE id=$1', [ids.adminUser])
    expect(row.rows[0].role).toBe('admin')
  })

  it('forbids a manager from deleting another user (403)', async () => {
    const res = await manager.delete(`/api/users/${ids.adminUser}`)
    expect(res.status).toBe(403)
    // The target row must still exist.
    const row = await pool.query('SELECT id FROM users WHERE id=$1', [ids.adminUser])
    expect(row.rows.length).toBe(1)
  })

  it('lets an admin create a user, and the new user defaults to must_change_password', async () => {
    // Joi validates real TLDs, so use a routable-looking domain (still TAG-scoped).
    const email = `${TAG}_created@example.com`
    const res = await admin.post('/api/users').send({
      name: `${TAG} Created`,
      email,
      password: PASSWORD,
      role: 'cashier',
    })
    expect(res.status).toBe(201)
    expect(res.body.role).toBe('cashier')
    // Response must never echo the password (plain or hashed).
    expect(res.body.password).toBeUndefined()

    const newId = res.body.id
    const row = await pool.query('SELECT must_change_password FROM users WHERE id=$1', [newId])
    expect(row.rows[0].must_change_password).toBe(true)

    // And an admin can change that user's role.
    const patch = await admin.patch(`/api/users/${newId}/role`).send({ role: 'kitchen' })
    expect(patch.status).toBe(200)
    expect(patch.body.role).toBe('kitchen')

    await pool.query('DELETE FROM users WHERE id=$1', [newId])
  })

  // PATCH /:id/password is guarded by an inline isSelf||isAdmin check (not
  // requireRole). A manager/staff resetting ANOTHER user's password would be a
  // full account-takeover path, so it must be rejected with the target unchanged.
  it('forbids a manager from resetting another user\'s password (403, unchanged)', async () => {
    const before = await pool.query('SELECT password FROM users WHERE id=$1', [ids.adminUser])
    const res = await manager.patch(`/api/users/${ids.adminUser}/password`).send({ new_password: 'Hacked123' })
    expect(res.status).toBe(403)
    const after = await pool.query('SELECT password FROM users WHERE id=$1', [ids.adminUser])
    expect(after.rows[0].password).toBe(before.rows[0].password)
  })

  it('forbids a staff user from resetting another user\'s password (403, unchanged)', async () => {
    const before = await pool.query('SELECT password FROM users WHERE id=$1', [ids.adminUser])
    const res = await staff.patch(`/api/users/${ids.adminUser}/password`).send({ new_password: 'Hacked123' })
    expect(res.status).toBe(403)
    const after = await pool.query('SELECT password FROM users WHERE id=$1', [ids.adminUser])
    expect(after.rows[0].password).toBe(before.rows[0].password)
  })

  it('lets a user change their OWN password via the isSelf path', async () => {
    const email = `${TAG}_selfpw@test.local`
    const uid = await seedUser(email, 'staff')
    try {
      const agent = await login(email)
      const res = await agent.patch(`/api/users/${uid}/password`).send({
        current_password: PASSWORD,
        new_password: 'NewSelf456',
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      // The new password actually authenticates, proving the change took effect.
      const relog = await request(app).post('/api/auth/login').send({ email, password: 'NewSelf456' })
      expect(relog.status).toBe(200)
    } finally {
      // Clean up even if an assertion above fails, so no row is left behind.
      await pool.query('DELETE FROM users WHERE id=$1', [uid])
    }
  })
})

// ── Information disclosure + privilege: integration secrets ───────────────────
describe('Integration secrets do not leak and are management-only', () => {
  const KNOWN_SECRET = `${TAG}_sk-supersecret-value-1234567890`
  let originalOpenAI = null

  beforeAll(async () => {
    // Preserve any existing dev config so our write can be rolled back exactly.
    const r = await pool.query("SELECT value FROM settings WHERE key='openai_api_key'")
    originalOpenAI = r.rows[0]?.value ?? null
  })

  afterAll(async () => {
    // Restore the original value (or remove the row if there was none) so this
    // block never taints real dev integration config.
    if (originalOpenAI === null) {
      await pool.query("DELETE FROM settings WHERE key='openai_api_key'")
    } else {
      await pool.query("UPDATE settings SET value=$1 WHERE key='openai_api_key'", [originalOpenAI])
    }
  })

  it('forbids a non-admin/manager from reading the integrations hub (403)', async () => {
    const res = await staff.get('/api/integrations')
    expect(res.status).toBe(403)
  })

  it('forbids a non-admin/manager from mutating integration config (403)', async () => {
    const res = await staff.put('/api/integrations/openai/config').send({ apiKey: KNOWN_SECRET })
    expect(res.status).toBe(403)
    // The forbidden write must not have persisted anything.
    const check = await pool.query("SELECT value FROM settings WHERE key='openai_api_key'")
    const stored = check.rows[0]?.value || ''
    expect(stored.includes(KNOWN_SECRET)).toBe(false)
  })

  it('never returns raw secret values when reading integration status (masked)', async () => {
    // Store a known secret through the real admin config path, then read it back.
    const put = await admin.put('/api/integrations/openai/config').send({ apiKey: KNOWN_SECRET })
    expect(put.status).toBe(200)

    const res = await admin.get('/api/integrations')
    expect(res.status).toBe(200)
    expect(res.body.openai.configured).toBe(true)

    // The raw secret must never appear anywhere in the serialized response,
    // and the masked value must actually be masked (contain bullet chars).
    const serialized = JSON.stringify(res.body)
    expect(serialized.includes(KNOWN_SECRET)).toBe(false)
    expect(res.body.openai.masked).toContain('•')
  })

  it('never returns the raw Notion API key from /api/notion/config (masked)', async () => {
    const res = await admin.get('/api/notion/config')
    expect(res.status).toBe(200)
    // Config exposes only a masked key + presence flags, never the raw value.
    expect(res.body.apiKey).toBeUndefined()
    if (res.body.configured) {
      expect(res.body.apiKeyMasked).toContain('•')
    }
  })

  it('forbids a non-admin/manager from reading Notion config (403)', async () => {
    const res = await staff.get('/api/notion/config')
    expect(res.status).toBe(403)
  })
})

// ── DoS / EoP: expensive integration action endpoints are management-only ─────
// These endpoints trigger third-party API calls (Notion pull/push, GitHub sync,
// OpenAI summary/chat). A low-privilege role must be rejected by the router-level
// requireRole guard BEFORE any external call is made — protecting against a
// staff/cashier exhausting external API quotas or driving up spend.
describe('Expensive integration actions reject low-privilege roles', () => {
  let cashier
  const CASHIER_EMAIL = `${TAG}_cashier_intg@test.local`

  beforeAll(async () => {
    await seedUser(CASHIER_EMAIL, 'cashier')
    cashier = await login(CASHIER_EMAIL)
  })

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email=$1', [CASHIER_EMAIL])
  })

  it('forbids staff from triggering a Notion pull sync (403)', async () => {
    const res = await staff.post('/api/integrations/notion/sync').send({ type: 'menu' })
    expect(res.status).toBe(403)
  })

  it('forbids cashier from triggering a Notion pull sync (403)', async () => {
    const res = await cashier.post('/api/integrations/notion/sync').send({ type: 'menu' })
    expect(res.status).toBe(403)
  })

  it('forbids staff from triggering a Notion push (403)', async () => {
    const res = await staff.post('/api/integrations/notion/push').send({ type: 'menu' })
    expect(res.status).toBe(403)
  })

  it('forbids cashier from triggering a Notion push (403)', async () => {
    const res = await cashier.post('/api/integrations/notion/push').send({ type: 'menu' })
    expect(res.status).toBe(403)
  })

  it('forbids staff from triggering a GitHub sync (403)', async () => {
    const res = await staff.post('/api/integrations/github/sync').send({})
    expect(res.status).toBe(403)
  })

  it('forbids cashier from triggering a GitHub sync (403)', async () => {
    const res = await cashier.post('/api/integrations/github/sync').send({})
    expect(res.status).toBe(403)
  })

  it('forbids staff from generating an OpenAI daily summary (403)', async () => {
    const res = await staff.post('/api/integrations/openai/summary').send({})
    expect(res.status).toBe(403)
  })

  it('forbids cashier from generating an OpenAI daily summary (403)', async () => {
    const res = await cashier.post('/api/integrations/openai/summary').send({})
    expect(res.status).toBe(403)
  })

  it('forbids staff from calling OpenAI chat (403)', async () => {
    const res = await staff.post('/api/integrations/openai/chat').send({ messages: [{ role: 'user', content: 'hi' }] })
    expect(res.status).toBe(403)
  })

  it('forbids cashier from calling OpenAI chat (403)', async () => {
    const res = await cashier.post('/api/integrations/openai/chat').send({ messages: [{ role: 'user', content: 'hi' }] })
    expect(res.status).toBe(403)
  })

  // Info-disclosure/EoP: reading auto-sync config and recent sync logs must be
  // management-only, matching their PUT/POST counterparts and the rest of the
  // integrations hub. A low-privilege role must not see sync configuration or logs.
  it('forbids staff from reading Notion auto-sync config (403)', async () => {
    const res = await staff.get('/api/integrations/notion/auto-sync')
    expect(res.status).toBe(403)
  })

  it('forbids cashier from reading Notion auto-sync config (403)', async () => {
    const res = await cashier.get('/api/integrations/notion/auto-sync')
    expect(res.status).toBe(403)
  })

  it('forbids staff from reading Notion sync status/logs (403)', async () => {
    const res = await staff.get('/api/integrations/notion/sync/status')
    expect(res.status).toBe(403)
  })

  it('forbids cashier from reading Notion sync status/logs (403)', async () => {
    const res = await cashier.get('/api/integrations/notion/sync/status')
    expect(res.status).toBe(403)
  })
})

// Even an *authorized* manager/admin can drain external API quotas (or drive up
// spend) by hammering the costly integration endpoints. A per-user rate limiter
// must reject excess requests with a 429 BEFORE the handler fires any real
// third-party call. To assert "no external call is made" without stubbing the
// network, we spend the budget with empty-body chat requests: openai/chat
// returns 400 for empty `messages` *before* touching OpenAI, yet the rate
// limiter (mounted ahead of the handler) still counts each one. Once the budget
// is exhausted, the next request is short-circuited with a 429 — proving the
// limit trips ahead of any external call.
describe('Costly integration actions are rate-limited per user', () => {
  it('returns 429 with a retry hint once the per-user budget is exhausted', async () => {
    const MAX = 10 // must match costlyIntegrationLimiter.max in integrations.js
    let last
    for (let i = 0; i < MAX + 1; i++) {
      last = await admin.post('/api/integrations/openai/chat').send({ messages: [] })
    }
    // The first MAX requests short-circuit at the handler's empty-messages guard
    // (400, no external call); the request that exceeds the budget is a 429 from
    // the limiter middleware — which runs before the handler, so no OpenAI call.
    expect(last.status).toBe(429)
    expect(last.body.error).toMatch(/too many/i)
    expect(last.body.retry_after_seconds).toBeGreaterThan(0)
  })
})

// ── Regression guard: GET and PUT /notion/auto-sync must agree on shape ───────
// Task #55 fixed a bug where PUT dropped `enabled` and `interval_minutes` from
// its response, which the frontend only survived because of a fallback. If the
// two endpoints ever disagree on their response shape again, the auto-sync
// toggle silently breaks. These tests lock in a matching shape across GET/PUT
// and verify the enable / disable / interval-change paths round-trip through the
// persisted settings table.
describe('Notion auto-sync GET/PUT return a matching, persisted shape', () => {
  // Keys both endpoints must expose so the frontend can render consistently.
  const SHARED_KEYS = ['enabled', 'interval_minutes', 'running', 'interval_min']
  let originalEnabled = null
  let originalInterval = null

  beforeAll(async () => {
    // Preserve any existing dev settings so we can restore them exactly and
    // never leave the shared dev auto-sync config (or a live timer) tainted.
    const e = await pool.query("SELECT value FROM settings WHERE key='notion_auto_sync_enabled'")
    const i = await pool.query("SELECT value FROM settings WHERE key='notion_auto_sync_interval'")
    originalEnabled = e.rows[0]?.value ?? null
    originalInterval = i.rows[0]?.value ?? null
  })

  afterAll(async () => {
    // Stop any timer this suite started and restore the original settings rows.
    await admin.put('/api/integrations/notion/auto-sync').send({ enabled: false })
    for (const [key, val] of [
      ['notion_auto_sync_enabled', originalEnabled],
      ['notion_auto_sync_interval', originalInterval]
    ]) {
      if (val === null) {
        await pool.query('DELETE FROM settings WHERE key=$1', [key])
      } else {
        await pool.query(
          "INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2",
          [key, val]
        )
      }
    }
  })

  it('GET and PUT expose the same shared response keys', async () => {
    const get = await admin.get('/api/integrations/notion/auto-sync')
    expect(get.status).toBe(200)
    const put = await admin.put('/api/integrations/notion/auto-sync').send({ enabled: false })
    expect(put.status).toBe(200)

    for (const key of SHARED_KEYS) {
      expect(get.body).toHaveProperty(key)
      expect(put.body).toHaveProperty(key)
    }
  })

  it('enabling with an interval persists and round-trips through GET', async () => {
    const put = await admin.put('/api/integrations/notion/auto-sync').send({ enabled: true, interval_minutes: 30 })
    expect(put.status).toBe(200)
    expect(put.body.enabled).toBe(true)
    expect(put.body.interval_minutes).toBe(30)
    expect(put.body.running).toBe(true)
    expect(put.body.interval_min).toBe(30)

    // Persisted settings must reflect the change.
    const stored = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('notion_auto_sync_enabled','notion_auto_sync_interval')"
    )
    const map = Object.fromEntries(stored.rows.map(r => [r.key, r.value]))
    expect(map.notion_auto_sync_enabled).toBe('true')
    expect(map.notion_auto_sync_interval).toBe('30')

    // A fresh GET must report the same enabled/interval the PUT reported.
    const get = await admin.get('/api/integrations/notion/auto-sync')
    expect(get.status).toBe(200)
    expect(get.body.enabled).toBe(true)
    expect(get.body.interval_minutes).toBe(30)
    expect(get.body.running).toBe(true)
    expect(get.body.interval_min).toBe(30)
  })

  it('changing the interval while enabled updates the persisted value', async () => {
    const put = await admin.put('/api/integrations/notion/auto-sync').send({ enabled: true, interval_minutes: 45 })
    expect(put.status).toBe(200)
    expect(put.body.interval_minutes).toBe(45)
    expect(put.body.interval_min).toBe(45)

    const stored = await pool.query("SELECT value FROM settings WHERE key='notion_auto_sync_interval'")
    expect(stored.rows[0]?.value).toBe('45')
  })

  // Task #60: a saved interval must survive a server restart. The PUT persists
  // to the settings table and arms an in-memory timer — but on the next boot the
  // timer is gone and only the settings row remains. This simulates a restart by
  // clearing the in-memory timer and re-running the boot init, then proves the
  // engine re-arms itself with the PERSISTED interval (not a hardcoded default).
  it('re-arms the persisted interval after a simulated server restart', async () => {
    const { initSyncEngine } = await import('../server/index.js')
    const { stopAutoSync, getSyncEngineStatus } = await import('../server/integrations/sync-engine.js')

    // Persist a non-default interval through the real PUT path.
    const put = await admin.put('/api/integrations/notion/auto-sync').send({ enabled: true, interval_minutes: 30 })
    expect(put.status).toBe(200)
    expect(put.body.interval_minutes).toBe(30)

    // Simulate a process restart: the in-memory timer dies, settings survive.
    stopAutoSync()
    expect(getSyncEngineStatus().running).toBe(false)

    // Boot init must read the persisted settings and re-arm the engine at 30 min,
    // proving the choice is not silently reverted to the 15-min default on boot.
    await initSyncEngine()
    const status = getSyncEngineStatus()
    expect(status.running).toBe(true)
    expect(status.interval_min).toBe(30)

    // And a fresh GET still reports the persisted interval after the restart.
    const get = await admin.get('/api/integrations/notion/auto-sync')
    expect(get.status).toBe(200)
    expect(get.body.enabled).toBe(true)
    expect(get.body.interval_minutes).toBe(30)
    expect(get.body.running).toBe(true)
    expect(get.body.interval_min).toBe(30)
  })

  it('disabling persists enabled=false and stops the timer', async () => {
    const put = await admin.put('/api/integrations/notion/auto-sync').send({ enabled: false })
    expect(put.status).toBe(200)
    expect(put.body.enabled).toBe(false)
    expect(put.body.running).toBe(false)
    expect(put.body.interval_min).toBe(null)

    const stored = await pool.query("SELECT value FROM settings WHERE key='notion_auto_sync_enabled'")
    expect(stored.rows[0]?.value).toBe('false')

    const get = await admin.get('/api/integrations/notion/auto-sync')
    expect(get.status).toBe(200)
    expect(get.body.enabled).toBe(false)
    expect(get.body.running).toBe(false)
  })
})
