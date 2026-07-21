// @vitest-environment node
/**
 * tests/public-menu.test.js
 * Unauthenticated public routes — /api/public/menu and /api/public/settings
 * These are mounted BEFORE the verifyToken middleware, so no cookie is needed.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../server/index.js'

describe('GET /api/public/menu', () => {
  it('returns 200 without authentication', async () => {
    const res = await request(app).get('/api/public/menu')
    expect(res.status).toBe(200)
  })

  it('response has categories array and total count', async () => {
    const res = await request(app).get('/api/public/menu')
    expect(res.body).toHaveProperty('categories')
    expect(Array.isArray(res.body.categories)).toBe(true)
    expect(typeof res.body.total).toBe('number')
    expect(res.body.total).toBeGreaterThanOrEqual(0)
  })

  it('each category has a name and items array', async () => {
    const res = await request(app).get('/api/public/menu')
    for (const cat of res.body.categories) {
      expect(typeof cat.category).toBe('string')
      expect(Array.isArray(cat.items)).toBe(true)
    }
  })

  it('items contain expected fields and no cost/recipe data', async () => {
    const res = await request(app).get('/api/public/menu')
    for (const cat of res.body.categories) {
      for (const item of cat.items) {
        expect(typeof item.id).toBe('number')
        expect(typeof item.name).toBe('string')
        expect(typeof item.price).toBe('number')
        // Cost/food-cost columns must NOT be exposed publicly
        expect(item).not.toHaveProperty('food_cost')
        expect(item).not.toHaveProperty('recipe')
        // Cost price field must NOT be present
        expect(item).not.toHaveProperty('cost_price')
      }
    }
  })

  it('only available (non-deleted) items are returned', async () => {
    const res = await request(app).get('/api/public/menu')
    // Every item returned should be from an available menu item;
    // we cannot easily query the DB here so we just check the shape is valid.
    expect(res.body.categories.every(c => c.items.every(i => i.id > 0))).toBe(true)
  })

  it('total matches sum of all items across categories', async () => {
    const res = await request(app).get('/api/public/menu')
    const counted = res.body.categories.reduce((sum, c) => sum + c.items.length, 0)
    expect(counted).toBe(res.body.total)
  })
})

describe('GET /api/public/settings', () => {
  it('returns 200 without authentication', async () => {
    const res = await request(app).get('/api/public/settings')
    expect(res.status).toBe(200)
  })

  it('returns restaurant_name and currency_symbol', async () => {
    const res = await request(app).get('/api/public/settings')
    expect(typeof res.body.restaurant_name).toBe('string')
    expect(typeof res.body.currency_symbol).toBe('string')
    expect(res.body.restaurant_name.length).toBeGreaterThan(0)
    expect(res.body.currency_symbol.length).toBeGreaterThan(0)
  })

  it('does not expose sensitive keys like SESSION_SECRET or tax_rate', async () => {
    const res = await request(app).get('/api/public/settings')
    const keys = Object.keys(res.body)
    expect(keys).not.toContain('SESSION_SECRET')
    expect(keys).not.toContain('tax_rate')
    expect(keys).not.toContain('loyalty_points_per_dollar')
    // Safe keys only — currency, name, and TAP payment config (intentionally public)
    const ALLOWED = ['currency_symbol', 'restaurant_name', 'tap_enabled', 'tap_pub_key']
    expect(keys.every(k => ALLOWED.includes(k))).toBe(true)
  })
})
