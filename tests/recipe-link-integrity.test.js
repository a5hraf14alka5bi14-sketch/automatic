// Recipe ↔ inventory link integrity — broken-link visibility + safeguards.
// Regression for the incident where an inventory re-seed soft-deleted all
// recipe-linked items while the link summary kept reporting 100% linked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../server/index.js'
import { pool, reactivateRecipeLinkedInventory } from '../server/db.js'

const TAG = `rli_${Date.now()}`
const ADMIN_EMAIL = `${TAG}_admin@test.local`
const PASSWORD = 'TestPass123'
const ids = { admin: null, menu: null, inv: [], recipe: [] }

let admin

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const u = await pool.query(
    'INSERT INTO users (name,email,password,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id',
    [`${TAG} admin`, ADMIN_EMAIL, hash, 'admin']
  )
  ids.admin = u.rows[0].id

  const m = await pool.query(
    "INSERT INTO menu_items (name,category,price,available) VALUES ($1,'test',9.99,true) RETURNING id",
    [`${TAG} Dish`]
  )
  ids.menu = m.rows[0].id

  // Two inventory items: one recipe-linked, one free-standing.
  for (const name of [`${TAG} Linked Ing`, `${TAG} Free Ing`]) {
    const r = await pool.query(
      "INSERT INTO inventory (name,category,quantity,unit,min_quantity,cost) VALUES ($1,'test',10,'kg',1,2) RETURNING id",
      [name]
    )
    ids.inv.push(r.rows[0].id)
  }

  // One linked recipe row + one unlinked row.
  const r1 = await pool.query(
    'INSERT INTO recipe_ingredients (menu_item_id, ingredient_name, quantity, unit, inventory_item_id) VALUES ($1,$2,0.2,\'kg\',$3) RETURNING id',
    [ids.menu, `${TAG} Linked Ing`, ids.inv[0]]
  )
  const r2 = await pool.query(
    'INSERT INTO recipe_ingredients (menu_item_id, ingredient_name, quantity, unit) VALUES ($1,$2,0.1,\'kg\') RETURNING id',
    [ids.menu, `${TAG} Unlinked Ing`]
  )
  ids.recipe = [r1.rows[0].id, r2.rows[0].id]

  admin = request.agent(app)
  const login = await admin.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD })
  expect(login.status).toBe(200)
})

afterAll(async () => {
  await pool.query('DELETE FROM recipe_ingredients WHERE id = ANY($1)', [ids.recipe])
  await pool.query('DELETE FROM inventory WHERE id = ANY($1)', [ids.inv])
  await pool.query('DELETE FROM menu_items WHERE id=$1', [ids.menu])
  await pool.query('DELETE FROM users WHERE id=$1', [ids.admin])
  await pool.end()
})

describe('link-summary broken-link visibility', () => {
  it('counts an active link as linked with zero broken contribution', async () => {
    const res = await admin.get('/api/menu/recipe/link-summary')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('broken')
    expect(res.body).toHaveProperty('distinct_broken')
    expect(res.body.total).toBe(res.body.linked + res.body.unlinked + res.body.broken)
  })

  it('moves a row from linked to broken when its inventory item is soft-deleted', async () => {
    const before = (await admin.get('/api/menu/recipe/link-summary')).body
    await pool.query('UPDATE inventory SET deleted_at=NOW() WHERE id=$1', [ids.inv[0]])
    const after = (await admin.get('/api/menu/recipe/link-summary')).body
    expect(after.broken).toBe(before.broken + 1)
    expect(after.linked).toBe(before.linked - 1)
    expect(after.total).toBe(before.total)
  })
})

describe('startup self-heal (reactivateRecipeLinkedInventory)', () => {
  it('reactivates soft-deleted items still referenced by recipes', async () => {
    // Item was soft-deleted in the previous test and is still recipe-linked.
    const healed = await reactivateRecipeLinkedInventory(pool)
    expect(healed).toBeGreaterThanOrEqual(1)
    const row = await pool.query('SELECT deleted_at FROM inventory WHERE id=$1', [ids.inv[0]])
    expect(row.rows[0].deleted_at).toBeNull()
  })

  it('does not reactivate soft-deleted items with no recipe references', async () => {
    await pool.query('UPDATE inventory SET deleted_at=NOW() WHERE id=$1', [ids.inv[1]])
    const healed = await reactivateRecipeLinkedInventory(pool)
    expect(healed).toBe(0)
    const row = await pool.query('SELECT deleted_at FROM inventory WHERE id=$1', [ids.inv[1]])
    expect(row.rows[0].deleted_at).not.toBeNull()
    await pool.query('UPDATE inventory SET deleted_at=NULL WHERE id=$1', [ids.inv[1]])
  })
})

describe('DELETE /api/inventory/:id recipe guard', () => {
  it('blocks soft-deleting an item that recipes depend on (409)', async () => {
    const res = await admin.delete(`/api/inventory/${ids.inv[0]}`)
    expect(res.status).toBe(409)
    expect(res.body.recipe_lines).toBe(1)
    expect(res.body.recipe_dishes).toBe(1)
    expect(res.body.error).toMatch(/recipe/i)
    const row = await pool.query('SELECT deleted_at FROM inventory WHERE id=$1', [ids.inv[0]])
    expect(row.rows[0].deleted_at).toBeNull()
  })

  it('still allows deleting an unreferenced item', async () => {
    const res = await admin.delete(`/api/inventory/${ids.inv[1]}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('allows deletion after the recipe link is removed', async () => {
    await pool.query('UPDATE recipe_ingredients SET inventory_item_id=NULL WHERE id=$1', [ids.recipe[0]])
    const res = await admin.delete(`/api/inventory/${ids.inv[0]}`)
    expect(res.status).toBe(200)
  })
})
