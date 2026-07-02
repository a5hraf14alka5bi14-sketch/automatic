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
