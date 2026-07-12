// اختبار خصم المخزون — inventory deduction math (with unit conversion & clamping)
import { describe, it, expect } from 'vitest'
import { convertQuantity, normalizeUnit, areCompatible } from '../server/lib/units.js'
import { computeDeductAmount, applyStockChange } from '../server/lib/inventory.js'

describe('convertQuantity', () => {
  it('returns the same value for identical units', () => {
    expect(convertQuantity(5, 'kg', 'kg')).toBe(5)
  })

  it('converts grams to kilograms', () => {
    expect(convertQuantity(500, 'g', 'kg')).toBe(0.5)
  })

  it('converts kilograms to grams', () => {
    expect(convertQuantity(2, 'kg', 'g')).toBe(2000)
  })

  it('converts liters to milliliters', () => {
    expect(convertQuantity(1.5, 'l', 'ml')).toBe(1500)
  })

  it('converts milliliters to liters', () => {
    expect(convertQuantity(250, 'ml', 'l')).toBe(0.25)
  })

  it('handles unit aliases and casing (Grams -> KG)', () => {
    expect(convertQuantity(1000, 'Grams', 'KG')).toBe(1)
  })

  it('converts dozen to pcs', () => {
    expect(convertQuantity(2, 'dozen', 'pcs')).toBe(24)
  })

  it('returns null across incompatible dimensions (pcs -> kg)', () => {
    expect(convertQuantity(3, 'pcs', 'kg')).toBeNull()
  })

  it('returns null for unknown units that are not identical', () => {
    expect(convertQuantity(3, 'blob', 'kg')).toBeNull()
  })

  it('returns null for non-numeric quantity', () => {
    expect(convertQuantity('abc', 'kg', 'g')).toBeNull()
  })
})

describe('normalizeUnit / areCompatible', () => {
  it('normalizes casing, whitespace and trailing dot', () => {
    expect(normalizeUnit('  KG. ')).toBe('kg')
  })
  it('treats same-dimension units as compatible', () => {
    expect(areCompatible('g', 'kg')).toBe(true)
  })
  it('treats cross-dimension units as incompatible', () => {
    expect(areCompatible('ml', 'kg')).toBe(false)
  })
})

describe('computeDeductAmount', () => {
  it('multiplies recipe qty by order qty when units match', () => {
    expect(computeDeductAmount({ ingQty: 0.2, recipeUnit: 'kg', invUnit: 'kg', orderQty: 3 })).toBeCloseTo(0.6, 6)
  })

  it('converts recipe grams into inventory kg before multiplying', () => {
    // 200 g per item, inventory in kg, 3 items -> 0.6 kg
    expect(computeDeductAmount({ ingQty: 200, recipeUnit: 'g', invUnit: 'kg', orderQty: 3 })).toBeCloseTo(0.6, 6)
  })

  it('converts recipe kg into inventory g', () => {
    expect(computeDeductAmount({ ingQty: 1, recipeUnit: 'kg', invUnit: 'g', orderQty: 2 })).toBe(2000)
  })

  it('falls back to raw quantity when units are incompatible', () => {
    // pcs -> kg cannot convert; use raw qty (2 * 4 = 8)
    expect(computeDeductAmount({ ingQty: 2, recipeUnit: 'pcs', invUnit: 'kg', orderQty: 4 })).toBe(8)
  })

  it('returns 0 for non-positive order quantity', () => {
    expect(computeDeductAmount({ ingQty: 1, recipeUnit: 'kg', invUnit: 'kg', orderQty: 0 })).toBe(0)
  })

  it('returns 0 for invalid recipe quantity', () => {
    expect(computeDeductAmount({ ingQty: null, recipeUnit: 'kg', invUnit: 'kg', orderQty: 2 })).toBe(0)
  })
})

describe('applyStockChange', () => {
  it('subtracts stock normally', () => {
    expect(applyStockChange(10, -3)).toEqual({ next: 7, applied: -3 })
  })

  it('clamps at zero and reports the actual applied delta', () => {
    // only 2 in stock, try to remove 5 -> ends at 0, applied -2
    expect(applyStockChange(2, -5)).toEqual({ next: 0, applied: -2 })
  })

  it('adds stock back on restock', () => {
    expect(applyStockChange(4, 6)).toEqual({ next: 10, applied: 6 })
  })

  it('treats missing current stock as zero', () => {
    expect(applyStockChange(null, -3)).toEqual({ next: 0, applied: 0 })
  })
})
