// Cashier/staff must not access financial reports, supplier data, or cost/margin
// fields. Management (manager) keeps full visibility. (Task: RBAC review pass.)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../server/index.js'
import { pool } from '../server/db.js'
import { hashPassword } from '../server/lib/password.js'

const TAG = `rbacfin_${Date.now()}`
const PASSWORD = 'TestPass123'
const users = {
  cashier: { email: `${TAG}_cashier@test.local`, id: null, agent: null },
  staff:   { email: `${TAG}_staff@test.local`,   id: null, agent: null },
  manager: { email: `${TAG}_manager@test.local`, id: null, agent: null },
}
const ids = { menuItem: null, invItem: null }

beforeAll(async () => {
  const hash = await hashPassword(PASSWORD)
  for (const [role, u] of Object.entries(users)) {
    const r = await pool.query(
      'INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
      [`${TAG} ${role}`, u.email, hash, role]
    )
    u.id = r.rows[0].id
    u.agent = request.agent(app)
    const res = await u.agent.post('/api/auth/login').send({ email: u.email, password: PASSWORD })
    expect(res.status).toBe(200)
  }
  const m = await pool.query(
    "INSERT INTO menu_items (name, category, price, food_cost, available, barcode) VALUES ($1,'test',10,4.5,true,$2) RETURNING id",
    [`${TAG} Dish`, `${TAG}bc`]
  )
  ids.menuItem = m.rows[0].id
  const i = await pool.query(
    "INSERT INTO inventory (name, category, quantity, unit, min_quantity, cost) VALUES ($1,'test',5,'kg',10,3.25) RETURNING id",
    [`${TAG} Ingredient`]
  )
  ids.invItem = i.rows[0].id
  const r = await pool.query(
    "INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, ingredient_name, quantity, unit, cost) VALUES ($1,$2,$3,0.5,'kg',1.75) RETURNING id",
    [ids.menuItem, ids.invItem, `${TAG} Ingredient`]
  )
  ids.recipe = r.rows[0].id
})

afterAll(async () => {
  await pool.query('DELETE FROM recipe_ingredients WHERE menu_item_id=$1', [ids.menuItem])
  await pool.query('DELETE FROM menu_items WHERE id=$1', [ids.menuItem])
  await pool.query('DELETE FROM inventory WHERE id=$1', [ids.invItem])
  const emails = Object.values(users).map(u => u.email)
  await pool.query('DELETE FROM audit_log WHERE user_email = ANY($1)', [emails])
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails])
})

describe('reports module is management-only', () => {
  const paths = ['/api/reports', '/api/reports/staff', '/api/reports/export?period=today', '/api/reports/menu-matrix']
  for (const p of paths) {
    it(`cashier gets 403 on GET ${p}`, async () => {
      const res = await users.cashier.agent.get(p)
      expect(res.status).toBe(403)
    })
  }
  it('staff gets 403 on GET /api/reports/staff', async () => {
    const res = await users.staff.agent.get('/api/reports/staff')
    expect(res.status).toBe(403)
  })
  it('manager can GET /api/reports/staff', async () => {
    const res = await users.manager.agent.get('/api/reports/staff')
    expect(res.status).toBe(200)
  })
})

describe('supplier data is management-only', () => {
  for (const p of ['/api/suppliers', '/api/suppliers/purchase-orders']) {
    it(`cashier gets 403 on GET ${p}`, async () => {
      const res = await users.cashier.agent.get(p)
      expect(res.status).toBe(403)
    })
  }
  it('staff gets 403 on POST /api/suppliers', async () => {
    const res = await users.staff.agent.post('/api/suppliers').send({ name: `${TAG} Sup` })
    expect(res.status).toBe(403)
  })
})

describe('finance entries (Notion integrations sync) are management-only', () => {
  it('cashier gets 403 on POST /api/integrations/notion/sync (finance)', async () => {
    const res = await users.cashier.agent.post('/api/integrations/notion/sync').send({ type: 'finance' })
    expect(res.status).toBe(403)
  })
  it('staff gets 403 on POST /api/integrations/notion/push (finance)', async () => {
    const res = await users.staff.agent.post('/api/integrations/notion/push').send({ type: 'finance' })
    expect(res.status).toBe(403)
  })
})

describe('menu GETs stay open but strip food_cost for non-management', () => {
  it('cashier GET /api/menu has no food_cost on any item', async () => {
    const res = await users.cashier.agent.get('/api/menu')
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    for (const item of res.body) expect(item).not.toHaveProperty('food_cost')
  })
  it('staff GET /api/menu/all has no food_cost', async () => {
    const res = await users.staff.agent.get('/api/menu/all')
    expect(res.status).toBe(200)
    for (const item of res.body) expect(item).not.toHaveProperty('food_cost')
  })
  it('cashier GET /api/menu/:id has no food_cost and recipe rows have no cost', async () => {
    const res = await users.cashier.agent.get(`/api/menu/${ids.menuItem}`)
    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('food_cost')
    expect(res.body.recipe.length).toBeGreaterThan(0)
    for (const ing of res.body.recipe) expect(ing).not.toHaveProperty('cost')
  })
  it('manager GET /api/menu/:id keeps recipe ingredient cost', async () => {
    const res = await users.manager.agent.get(`/api/menu/${ids.menuItem}`)
    expect(res.status).toBe(200)
    expect(res.body.recipe.length).toBeGreaterThan(0)
    expect(parseFloat(res.body.recipe[0].cost)).toBeCloseTo(1.75)
  })
  it('cashier GET /api/menu/barcode/:code has no food_cost', async () => {
    const res = await users.cashier.agent.get(`/api/menu/barcode/${TAG}bc`)
    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('food_cost')
    expect(res.body.name).toBe(`${TAG} Dish`)
  })
  it('cashier GET /api/menu/stats has no avg_cost/avg_margin', async () => {
    const res = await users.cashier.agent.get('/api/menu/stats')
    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('avg_cost')
    expect(res.body).not.toHaveProperty('avg_margin')
    expect(res.body).toHaveProperty('avg_price')
  })
  it('manager GET /api/menu/all still includes food_cost', async () => {
    const res = await users.manager.agent.get('/api/menu/all')
    expect(res.status).toBe(200)
    const dish = res.body.find(i => i.id === ids.menuItem)
    expect(parseFloat(dish.food_cost)).toBeCloseTo(4.5)
  })
  it('cashier gets 403 on GET /api/menu/food-cost', async () => {
    const res = await users.cashier.agent.get('/api/menu/food-cost')
    expect(res.status).toBe(403)
  })
})

describe('Recipes page endpoints (food-cost + link-summary) are management-only', () => {
  it('manager can GET /api/menu/food-cost (Recipes page loads)', async () => {
    const res = await users.manager.agent.get('/api/menu/food-cost')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const dish = res.body.find(i => i.id === ids.menuItem)
    expect(dish).toBeTruthy()
    expect(dish).toHaveProperty('food_cost_pct')
  })
  it('staff gets 403 on GET /api/menu/food-cost', async () => {
    const res = await users.staff.agent.get('/api/menu/food-cost')
    expect(res.status).toBe(403)
  })
  it('manager can GET /api/menu/recipe/link-summary', async () => {
    const res = await users.manager.agent.get('/api/menu/recipe/link-summary')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('linked')
  })
  it('staff gets 403 on GET /api/menu/recipe/link-summary', async () => {
    const res = await users.staff.agent.get('/api/menu/recipe/link-summary')
    expect(res.status).toBe(403)
  })
  it('cashier gets 403 on GET /api/menu/recipe/unlinked', async () => {
    const res = await users.cashier.agent.get('/api/menu/recipe/unlinked')
    expect(res.status).toBe(403)
  })
})

describe('dashboard stats strip revenue for kitchen/staff (cashier keeps them)', () => {
  it('staff GET /api/dashboard/stats has no revenue figures', async () => {
    const res = await users.staff.agent.get('/api/dashboard/stats')
    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('todayRevenue')
    expect(res.body).not.toHaveProperty('monthRevenue')
    expect(res.body).not.toHaveProperty('avgOrderValue')
    expect(res.body).toHaveProperty('activeOrders')
  })
  it('cashier GET /api/dashboard/stats keeps revenue (handles payments — intentional)', async () => {
    const res = await users.cashier.agent.get('/api/dashboard/stats')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('todayRevenue')
    expect(res.body).toHaveProperty('avgOrderValue')
  })
})

describe('inventory GETs stay open but strip cost/supplier_id for non-management', () => {
  it('cashier GET /api/inventory has no cost or supplier_id', async () => {
    const res = await users.cashier.agent.get('/api/inventory')
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    for (const item of res.body) {
      expect(item).not.toHaveProperty('cost')
      expect(item).not.toHaveProperty('supplier_id')
    }
  })
  it('staff GET /api/inventory/low-stock has no cost or supplier_id', async () => {
    const res = await users.staff.agent.get('/api/inventory/low-stock')
    expect(res.status).toBe(200)
    for (const item of res.body) {
      expect(item).not.toHaveProperty('cost')
      expect(item).not.toHaveProperty('supplier_id')
    }
  })
  it('manager GET /api/inventory still includes cost', async () => {
    const res = await users.manager.agent.get('/api/inventory')
    expect(res.status).toBe(200)
    const item = res.body.find(i => i.id === ids.invItem)
    expect(parseFloat(item.cost)).toBeCloseTo(3.25)
  })
  it('cashier gets 403 on GET /api/inventory/stats (total stock value)', async () => {
    const res = await users.cashier.agent.get('/api/inventory/stats')
    expect(res.status).toBe(403)
  })
  it('cashier Inventory page load: items 200 while stats 403 (page must still render items)', async () => {
    // Regression: the Inventory page fetches both in parallel; a stats 403
    // must not prevent the (cost-stripped) items list from loading.
    const [itemsRes, statsRes] = await Promise.all([
      users.cashier.agent.get('/api/inventory'),
      users.cashier.agent.get('/api/inventory/stats'),
    ])
    expect(itemsRes.status).toBe(200)
    expect(Array.isArray(itemsRes.body)).toBe(true)
    expect(itemsRes.body.length).toBeGreaterThan(0)
    expect(statsRes.status).toBe(403)
  })
  it('cashier gets 403 on GET /api/inventory/movements', async () => {
    const res = await users.cashier.agent.get('/api/inventory/movements')
    expect(res.status).toBe(403)
  })
  it('cashier gets 403 on GET /api/inventory/impact (recipe→dish links)', async () => {
    const res = await users.cashier.agent.get('/api/inventory/impact')
    expect(res.status).toBe(403)
  })
  it('staff gets 403 on GET /api/inventory/impact', async () => {
    const res = await users.staff.agent.get('/api/inventory/impact')
    expect(res.status).toBe(403)
  })
  it('manager gets 200 on GET /api/inventory/impact', async () => {
    const res = await users.manager.agent.get('/api/inventory/impact')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})
