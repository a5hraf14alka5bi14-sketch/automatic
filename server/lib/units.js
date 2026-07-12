// Unit conversion for inventory / recipe quantities.
//
// Recipe ingredients and inventory items can be expressed in different units
// (a recipe may call for 200 g of an item stored in kg). Deduction must convert
// the recipe quantity into the inventory item's unit before subtracting.
//
// Conversions are only defined WITHIN a dimension (mass, volume, count). Cross
// dimension conversions (e.g. pcs -> kg) are impossible and return null so the
// caller can fall back to a safe default.

// Factors express "how many base units per 1 of this unit" within a dimension.
const DIMENSIONS = {
  mass: { mg: 0.001, g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000 },
  volume: { ml: 1, milliliter: 1, cl: 10, l: 1000, liter: 1000, litre: 1000, liters: 1000 },
  count: { pcs: 1, pc: 1, piece: 1, pieces: 1, unit: 1, units: 1, dozen: 12, dz: 12 },
}

// Normalize a unit string: lowercase, trimmed, trailing-dot stripped.
export function normalizeUnit(unit) {
  if (unit == null) return ''
  return String(unit).trim().toLowerCase().replace(/\.$/, '')
}

// Find which dimension a unit belongs to, or null if unknown.
function dimensionOf(unit) {
  const u = normalizeUnit(unit)
  for (const [dim, table] of Object.entries(DIMENSIONS)) {
    if (u in table) return dim
  }
  return null
}

// True when two units can be converted between each other.
export function areCompatible(from, to) {
  const nf = normalizeUnit(from)
  const nt = normalizeUnit(to)
  if (nf === nt) return true
  const df = dimensionOf(nf)
  const dt = dimensionOf(nt)
  return df != null && df === dt
}

// Convert `qty` from unit `from` to unit `to`.
// Returns the converted number, or null when the units are incompatible
// (different dimensions, or one/both units are unknown and not identical).
export function convertQuantity(qty, from, to) {
  const n = Number(qty)
  if (!Number.isFinite(n)) return null
  const nf = normalizeUnit(from)
  const nt = normalizeUnit(to)
  if (nf === nt) return n
  const df = dimensionOf(nf)
  const dt = dimensionOf(nt)
  if (df == null || df !== dt) return null
  const table = DIMENSIONS[df]
  return n * (table[nf] / table[nt])
}
