// Pure inventory-deduction math, extracted so it can be unit tested
// independently of the database / Express layer.

import { convertQuantity } from './units.js'

// How much stock (in the INVENTORY item's unit) a single order line consumes.
//
// - ingQty:     recipe quantity per one menu item (in recipeUnit)
// - recipeUnit: unit the recipe quantity is expressed in
// - invUnit:    unit the inventory item is stored in
// - orderQty:   number of that menu item ordered
//
// The recipe quantity is converted into the inventory unit. When the units are
// incompatible (e.g. recipe in "pcs", inventory in "kg") conversion is
// impossible, so we fall back to the raw recipe quantity — matching the
// pre-conversion behaviour rather than silently dropping the deduction.
export function computeDeductAmount({ ingQty, recipeUnit, invUnit, orderQty }) {
  const perItemRaw = Number(ingQty)
  const qty = parseInt(orderQty, 10)
  if (!Number.isFinite(perItemRaw) || !Number.isFinite(qty) || qty <= 0) return 0
  const converted = convertQuantity(perItemRaw, recipeUnit, invUnit)
  const perItem = converted == null ? perItemRaw : converted
  return perItem * qty
}

// Apply a signed change to a current stock level, clamping at zero (stock can
// never go negative). Returns the new level and the delta that was actually
// applied (which differs from the requested change when clamping kicks in).
export function applyStockChange(current, change) {
  const cur = Number(current) || 0
  const next = Math.max(0, cur + Number(change))
  return { next, applied: next - cur }
}
