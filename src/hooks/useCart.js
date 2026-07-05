import { useState } from 'react'

// ── useCart ─────────────────────────────────────────────────────────────────
// Encapsulates POS cart state, line-item mutations, discount handling, and all
// money math (subtotal / discount / tax / total). Order-level context that is
// NOT part of the cart (order type, table, customer, notes, rush) stays in the
// POS component.
//
// Options:
//   taxRate    — fractional tax rate (e.g. 0.05 for 5%) used for the tax line
//   stockAvail — { menu_item_id: maxSellable | null } for the low-stock warning
//   showToast  — toast fn used to warn (but not block) when a sale would drive
//                a linked ingredient's stock negative
export function useCart({ taxRate = 0, stockAvail = {}, showToast } = {}) {
  const [cart, setCart] = useState([])
  const [itemNotes, setItemNotes] = useState({})
  const [expandedCartItem, setExpandedCartItem] = useState(null)
  const [discount, setDiscount] = useState({ amount: '', type: 'percent' })

  // Add an item (optionally with modifiers) to the cart. Warns — but never
  // blocks — if selling this dish would push a tracked ingredient negative.
  const addToCart = (item, selectedModifiers = []) => {
    const extraPrice = selectedModifiers.reduce((s, m) => s + parseFloat(m.price_delta || 0), 0)
    const unitPrice = parseFloat(item.price || 0) + extraPrice
    const modKey = selectedModifiers.map(m => m.id).sort().join(',')
    const cartId = `${item.id}:${modKey}`

    // `null`/undefined availability = untracked ingredient (unlimited).
    const max = stockAvail[item.id]
    if (max != null) {
      const alreadyInCart = cart.filter(c => c.id === item.id).reduce((s, c) => s + c.qty, 0)
      if (alreadyInCart + 1 > max) {
        showToast?.(
          max <= 0
            ? `⚠️ ${item.name}: نفد المخزون — البيع سيجعل مخزون أحد المكوّنات بالسالب`
            : `⚠️ ${item.name}: الكمية المتاحة ${max} فقط حسب المخزون`,
          'error'
        )
      }
    }

    setCart(prev => {
      const exists = prev.find(c => c.cartId === cartId)
      if (exists) return prev.map(c => c.cartId === cartId ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { cartId, id: item.id, name: item.name, price: unitPrice, qty: 1, modifiers: selectedModifiers, category: item.category }]
    })
  }

  const updateQty = (cartId, delta) => {
    setCart(prev => prev.map(c => c.cartId === cartId ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0))
    if (delta < 0) {
      setItemNotes(prev => {
        const next = { ...prev }
        if (cart.find(c => c.cartId === cartId)?.qty <= 1) delete next[cartId]
        return next
      })
    }
  }

  const removeItem = (cartId) => {
    setCart(prev => prev.filter(c => c.cartId !== cartId))
    setItemNotes(prev => { const next = { ...prev }; delete next[cartId]; return next })
    setExpandedCartItem(prev => (prev === cartId ? null : prev))
  }

  // Reset only the cart-owned state. Order-level fields (note, customer, rush)
  // are reset by the POS component.
  const clearCart = () => {
    setCart([])
    setItemNotes({})
    setDiscount({ amount: '', type: 'percent' })
    setExpandedCartItem(null)
  }

  // ── Money math ──────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, c) => s + (parseFloat(c.price) * c.qty), 0)
  const discountVal = discount.type === 'percent'
    ? subtotal * parseFloat(discount.amount || 0) / 100
    : Math.min(parseFloat(discount.amount || 0), subtotal)
  const discountedSub = Math.max(0, subtotal - discountVal)
  const tax = discountedSub * taxRate
  const total = discountedSub + tax
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)
  const hasDiscount = discountVal > 0

  return {
    // state
    cart, setCart,
    itemNotes, setItemNotes,
    expandedCartItem, setExpandedCartItem,
    discount, setDiscount,
    // mutations
    addToCart, updateQty, removeItem, clearCart,
    // computed
    subtotal, discountVal, discountedSub, tax, total, cartCount, hasDiscount,
  }
}
