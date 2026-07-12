import { describe, it, expect } from 'vitest'
import { ROUTE_ROLES, canAccessRoute } from '../src/utils/auth.js'

describe('recipes route guard', () => {
  it('restricts recipes to admin and manager', () => {
    expect(ROUTE_ROLES.recipes).toEqual(['admin', 'manager'])
    expect(canAccessRoute('recipes', 'admin')).toBe(true)
    expect(canAccessRoute('recipes', 'manager')).toBe(true)
    expect(canAccessRoute('recipes', 'cashier')).toBe(false)
    expect(canAccessRoute('recipes', 'kitchen')).toBe(false)
    expect(canAccessRoute('recipes', 'staff')).toBe(false)
  })

  it('leaves open pages open', () => {
    expect(canAccessRoute('pos', 'cashier')).toBe(true)
    expect(canAccessRoute('kitchen', 'kitchen')).toBe(true)
  })
})
