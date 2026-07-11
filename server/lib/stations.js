import { pool } from '../db.js'

// Stations the system always understands even on an empty database (they are
// also seeded into the stations table by migration 015).
export const DEFAULT_STATIONS = ['kitchen', 'bar']

// The station sets are needed on every filtered order request, so they are
// cached briefly. Mutations via /api/stations call invalidateStationCache()
// so changes are visible immediately.
const CACHE_MS = 30000
let cache = null
let cacheAt = 0

// Returns { valid, active, filterList }:
//  - valid:      Set of every station the filter validation tolerates —
//                managed stations (active AND retired) + defaults + any
//                legacy value still present in order data. Retiring a
//                station must never turn existing filter links into 400s.
//  - active:     Set of active managed station names — the list new work
//                (menu assignment, order routing) is allowed to target.
//  - filterList: active managed names in a stable order — what the
//                Kitchen/Orders filter dropdowns offer.
export async function getStationSets() {
  const now = Date.now()
  if (cache && now - cacheAt < CACHE_MS) return cache

  const [managed, used] = await Promise.all([
    pool.query('SELECT name, active FROM stations ORDER BY id'),
    pool.query(`
      SELECT DISTINCT station FROM (
        SELECT station FROM orders WHERE station IS NOT NULL AND station <> ''
        UNION
        SELECT station FROM order_items WHERE station IS NOT NULL AND station <> ''
      ) s
    `)
  ])

  const valid = new Set(DEFAULT_STATIONS)
  const active = new Set()
  const filterList = []
  for (const r of managed.rows) {
    valid.add(r.name)
    if (r.active) { active.add(r.name); filterList.push(r.name) }
  }
  for (const r of used.rows) valid.add(r.station)
  // Defensive: if every managed station were somehow deactivated, fall back
  // to the defaults so routing/filtering never dead-ends.
  if (!active.size) for (const s of DEFAULT_STATIONS) { active.add(s); filterList.push(s) }

  cache = { valid, active, filterList }
  cacheAt = now
  return cache
}

export function invalidateStationCache() { cache = null }

// Normalise a user-supplied station name into the slug form the rest of the
// system uses ('kitchen', 'bar', 'drinks', 'grill', …): lowercase, spaces
// collapsed to single hyphens, only [a-z0-9-]. Returns '' when nothing
// usable remains.
export function normaliseStationName(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}
