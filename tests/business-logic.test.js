import { describe, it, expect } from 'vitest'

// ── Tax & Order Total Calculations ───────────────────────────────────────────
function calcTax(subtotal, taxRatePct) {
  return parseFloat((subtotal * (taxRatePct / 100)).toFixed(3))
}

function calcTotal(subtotal, taxRatePct) {
  const tax = calcTax(subtotal, taxRatePct)
  return parseFloat((subtotal + tax).toFixed(3))
}

function calcSubtotal(cartItems) {
  return cartItems.reduce((sum, item) => sum + (parseFloat(item.price) * item.qty), 0)
}

describe('Tax & Order Total', () => {
  it('calculates 11% tax correctly', () => {
    const tax = calcTax(10, 11)
    expect(tax).toBe(1.1)
  })

  it('calculates total with tax', () => {
    const total = calcTotal(10, 11)
    expect(total).toBe(11.1)
  })

  it('calculates total with 0% tax rate', () => {
    expect(calcTotal(5, 0)).toBe(5)
  })

  it('calculates total from cart items', () => {
    const cart = [
      { price: '2.500', qty: 2 },
      { price: '1.000', qty: 3 },
    ]
    const subtotal = calcSubtotal(cart)
    expect(subtotal).toBe(8)
  })

  it('handles fractional OMR prices with 3-decimal precision', () => {
    const tax = calcTax(1.250, 11)
    expect(tax).toBe(0.138)
  })
})

// ── Split Bill ────────────────────────────────────────────────────────────────
function splitBill(total, guests) {
  if (guests <= 0) throw new Error('Guests must be > 0')
  return parseFloat((total / guests).toFixed(3))
}

describe('Split Bill', () => {
  it('splits evenly among 2 guests', () => {
    expect(splitBill(10, 2)).toBe(5)
  })

  it('splits among 4 guests', () => {
    expect(splitBill(11.100, 4)).toBe(2.775)
  })

  it('throws when guests is 0', () => {
    expect(() => splitBill(10, 0)).toThrow()
  })

  it('handles single guest (full amount)', () => {
    expect(splitBill(8.500, 1)).toBe(8.5)
  })
})

// ── Inventory Deduction Logic ─────────────────────────────────────────────────
function deductInventory(currentQty, deductAmt) {
  const result = parseFloat(currentQty) - parseFloat(deductAmt)
  return Math.max(0, parseFloat(result.toFixed(3)))
}

function shouldDeduct(prevStatus, newStatus) {
  return prevStatus !== 'completed' && newStatus === 'completed'
}

function shouldRestock(prevStatus, newStatus) {
  return prevStatus === 'completed' && newStatus === 'cancelled'
}

describe('Inventory Deduction', () => {
  it('deducts stock correctly', () => {
    expect(deductInventory(5.0, 1.5)).toBe(3.5)
  })

  it('does not go below zero', () => {
    expect(deductInventory(0.5, 2)).toBe(0)
  })

  it('triggers deduction only when transitioning to completed', () => {
    expect(shouldDeduct('pending', 'completed')).toBe(true)
    expect(shouldDeduct('preparing', 'completed')).toBe(true)
    expect(shouldDeduct('completed', 'completed')).toBe(false)
  })

  it('does not deduct for non-completed transitions', () => {
    expect(shouldDeduct('pending', 'preparing')).toBe(false)
    expect(shouldDeduct('pending', 'cancelled')).toBe(false)
  })

  it('restocks when cancelling a completed order', () => {
    expect(shouldRestock('completed', 'cancelled')).toBe(true)
    expect(shouldRestock('pending', 'cancelled')).toBe(false)
    expect(shouldRestock('completed', 'preparing')).toBe(false)
  })
})

// ── Loyalty Points ────────────────────────────────────────────────────────────
function calcLoyaltyPoints(orderTotal, pointsPerUnit, unitValue = 1) {
  if (!pointsPerUnit || pointsPerUnit <= 0) return 0
  return Math.floor(orderTotal / unitValue * pointsPerUnit)
}

function calcLoyaltyDiscount(points, pointsPerOmr) {
  if (!pointsPerOmr || pointsPerOmr <= 0) return 0
  return parseFloat((points / pointsPerOmr).toFixed(3))
}

function capRedemption(requestedPoints, availablePoints, maxDiscountOmr, orderTotal) {
  const cappedByBalance = Math.min(requestedPoints, availablePoints)
  const maxByOrder = Math.floor(orderTotal * (maxDiscountOmr || Infinity))
  return Math.min(cappedByBalance, maxByOrder)
}

describe('Loyalty Points', () => {
  it('calculates points for order total (1 point per OMR)', () => {
    expect(calcLoyaltyPoints(10.5, 1)).toBe(10)
  })

  it('returns 0 when pointsPerUnit is 0', () => {
    expect(calcLoyaltyPoints(100, 0)).toBe(0)
  })

  it('floors points to whole number', () => {
    expect(calcLoyaltyPoints(3.500, 1)).toBe(3)
  })

  it('scales with custom points rate', () => {
    expect(calcLoyaltyPoints(10, 5)).toBe(50)
  })

  it('handles zero order total', () => {
    expect(calcLoyaltyPoints(0, 1)).toBe(0)
  })

  it('converts points to OMR discount correctly', () => {
    expect(calcLoyaltyDiscount(100, 10)).toBe(10)
    expect(calcLoyaltyDiscount(50, 10)).toBe(5)
  })

  it('caps redemption at customer balance', () => {
    expect(capRedemption(200, 50, Infinity, 100)).toBe(50)
  })

  it('cannot redeem more points than available', () => {
    const available = 30
    const requested = 100
    expect(capRedemption(requested, available, Infinity, 1000)).toBe(available)
  })
})

// ── Date Filter ───────────────────────────────────────────────────────────────
function dateFilterLabel(period) {
  if (period === 'week')  return 'INTERVAL \'7 days\''
  if (period === 'month') return 'month'
  return 'today'
}

describe('Date Filter', () => {
  it('returns today filter by default', () => {
    expect(dateFilterLabel('today')).toBe('today')
    expect(dateFilterLabel('unknown')).toBe('today')
  })

  it('returns week filter', () => {
    expect(dateFilterLabel('week')).toContain('7 days')
  })

  it('returns month filter', () => {
    expect(dateFilterLabel('month')).toBe('month')
  })
})

// ── Role Validation ───────────────────────────────────────────────────────────
const VALID_ROLES = ['admin', 'manager', 'cashier']

function isValidRole(role) {
  return VALID_ROLES.includes(role)
}

function canManage(role) {
  return role === 'admin' || role === 'manager'
}

function canAdmin(role) {
  return role === 'admin'
}

describe('Role Validation', () => {
  it('accepts valid roles', () => {
    expect(isValidRole('admin')).toBe(true)
    expect(isValidRole('manager')).toBe(true)
    expect(isValidRole('cashier')).toBe(true)
  })

  it('rejects invalid roles', () => {
    expect(isValidRole('superuser')).toBe(false)
    expect(isValidRole('')).toBe(false)
    expect(isValidRole('ADMIN')).toBe(false)
  })

  it('canManage returns true for admin and manager only', () => {
    expect(canManage('admin')).toBe(true)
    expect(canManage('manager')).toBe(true)
    expect(canManage('cashier')).toBe(false)
  })

  it('canAdmin returns true for admin only', () => {
    expect(canAdmin('admin')).toBe(true)
    expect(canAdmin('manager')).toBe(false)
    expect(canAdmin('cashier')).toBe(false)
  })
})

// ── OMR Currency Formatting ───────────────────────────────────────────────────
function formatOMR(amount, symbol = 'OMR') {
  const n = parseFloat(amount || 0)
  return `${symbol} ${n.toFixed(3)}`
}

function parseOMR(str) {
  return parseFloat(str.replace(/[^\d.]/g, '')) || 0
}

describe('OMR Currency Formatting', () => {
  it('formats to 3 decimal places', () => {
    expect(formatOMR(12.99)).toBe('OMR 12.990')
    expect(formatOMR(1.5)).toBe('OMR 1.500')
    expect(formatOMR(0)).toBe('OMR 0.000')
  })

  it('prefixes with OMR symbol and space', () => {
    expect(formatOMR(5)).toMatch(/^OMR /)
  })

  it('parses OMR string back to number', () => {
    expect(parseOMR('OMR 12.990')).toBe(12.99)
    expect(parseOMR('OMR 0.500')).toBe(0.5)
  })

  it('handles null and undefined gracefully', () => {
    expect(formatOMR(null)).toBe('OMR 0.000')
    expect(formatOMR(undefined)).toBe('OMR 0.000')
  })
})

// ── Pagination ────────────────────────────────────────────────────────────────
function calcPagination(total, limit, offset) {
  const page = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)
  const hasNext = offset + limit < total
  const hasPrev = offset > 0
  return { page, totalPages, hasNext, hasPrev }
}

describe('Pagination', () => {
  it('calculates first page correctly', () => {
    const p = calcPagination(100, 20, 0)
    expect(p.page).toBe(1)
    expect(p.totalPages).toBe(5)
    expect(p.hasNext).toBe(true)
    expect(p.hasPrev).toBe(false)
  })

  it('calculates last page correctly', () => {
    const p = calcPagination(100, 20, 80)
    expect(p.page).toBe(5)
    expect(p.hasNext).toBe(false)
    expect(p.hasPrev).toBe(true)
  })

  it('handles single page results', () => {
    const p = calcPagination(5, 20, 0)
    expect(p.page).toBe(1)
    expect(p.totalPages).toBe(1)
    expect(p.hasNext).toBe(false)
    expect(p.hasPrev).toBe(false)
  })
})

// ── Health Check Response Shape ───────────────────────────────────────────────
function isHealthOk(response) {
  return (
    response &&
    response.status === 'ok' &&
    response.db === 'ok' &&
    typeof response.uptimeSeconds === 'number' &&
    typeof response.dbLatencyMs === 'number'
  )
}

function isHealthDegraded(response) {
  return response?.status === 'error' || response?.db === 'error'
}

describe('Health Check Shape', () => {
  it('validates a healthy response', () => {
    const healthy = { status: 'ok', db: 'ok', uptimeSeconds: 120, dbLatencyMs: 2, ts: Date.now() }
    expect(isHealthOk(healthy)).toBe(true)
  })

  it('detects a degraded response', () => {
    const degraded = { status: 'error', db: 'error', ts: Date.now() }
    expect(isHealthDegraded(degraded)).toBe(true)
    expect(isHealthOk(degraded)).toBe(false)
  })
})
