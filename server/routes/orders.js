import express from 'express'
import { pool, recordStockMovement } from '../db.js'
import { computeDeductAmount } from '../lib/inventory.js'
import { getStationSets, invalidateStationCache, DEFAULT_STATIONS } from '../lib/stations.js'
import { broadcast } from '../events.js'
import { sendPushNotification } from '../integrations/push.js'
import { validate } from '../middleware/validate.js'
import { requireRole } from '../middleware/auth.js'
import {
  orderCreateSchema, orderStatusSchema,
  orderDiscountSchema, orderRushSchema, orderItemDoneSchema
} from '../validators.js'
import { logger } from '../logger.js'

const router = express.Router()

async function getSettings(client) {
  const r = await client.query("SELECT key, value FROM settings WHERE key IN ('tax_rate','loyalty_points_per_omr')")
  const s = {}
  for (const row of r.rows) s[row.key] = row.value
  return {
    taxRate: parseFloat(s.tax_rate || '11') / 100,
    loyaltyPerDollar: parseInt(s.loyalty_points_per_omr || '1')
  }
}

const ORDERS_SELECT = `
  SELECT o.*,
    u.name AS staff_name,
    b.name AS branch_name, b.name_ar AS branch_name_ar,
    COUNT(oi.id) AS items_count,
    COALESCE(
      json_agg(
        json_build_object(
          'id', oi.id,
          'menu_item_id', oi.menu_item_id,
          'name', oi.name,
          'name_ar', mi.name_ar,
          'quantity', oi.quantity,
          'price', oi.price,
          'notes', oi.notes,
          'item_notes', oi.item_notes,
          'modifiers', COALESCE(oi.modifiers, '[]'::jsonb),
          'done', COALESCE(oi.done, false),
          'station', COALESCE(oi.station, 'kitchen')
        ) ORDER BY oi.id
      ) FILTER (WHERE oi.id IS NOT NULL),
      '[]'
    ) AS items,
    (SELECT COALESCE(
      json_agg(json_build_object('id',sp.id,'method',sp.method,'amount',sp.amount,'paid_at',sp.paid_at) ORDER BY sp.id),
      '[]'::json
    ) FROM split_payments sp WHERE sp.order_id = o.id) AS split_payments
  FROM orders o
  LEFT JOIN users u ON u.id = o.user_id
  LEFT JOIN branches b ON b.id = o.branch_id
  LEFT JOIN order_items oi ON oi.order_id = o.id
  LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
`

// Fields containing pricing/payment/void data — stripped for kitchen & staff roles.
// These roles need operational detail (items, table, status, rush) but not financial data.
const FINANCIAL_FIELDS = ['subtotal', 'tax', 'total', 'discount', 'discount_type',
  'payment_method', 'loyalty_discount', 'void_reason', 'voided_by', 'voided_at', 'split_payments']

function filterOrderFields(rows, role) {
  if (role !== 'kitchen' && role !== 'staff') return rows
  return rows.map(row => {
    const r = { ...row }
    for (const f of FINANCIAL_FIELDS) delete r[f]
    return r
  })
}

// Thrown by buildOrderFilters when a query param is malformed. Both order
// endpoints catch it and translate it into a clean 400 instead of a 500.
class FilterValidationError extends Error {
  constructor(message) { super(message); this.name = 'FilterValidationError' }
}

// Payment values the UI can send (the "all" option is never sent). Anything
// else is a hand-crafted request and is rejected rather than silently matching
// nothing.
const VALID_PAYMENTS = ['cash', 'card', 'other', 'unpaid']

// The order workflow states are a fixed workflow, so they stay a static list.
// Unknown values are hand-crafted requests: rejected rather than silently
// matching nothing (keeps status consistent with the payment/date behaviour).
const VALID_STATUSES = ['pending', 'preparing', 'ready', 'completed', 'cancelled']

// Stations come from the MANAGED list (the stations table, editable by
// admins/managers via /api/stations) — see server/lib/stations.js. Filter
// validation stays tolerant of retired managed stations and of legacy values
// already stored in order data, so retiring or renaming a station never turns
// existing filter links into 400s. Genuinely unknown stations (never managed,
// never used anywhere) are still rejected with a 400.
async function getValidStations() {
  return (await getStationSets()).valid
}

// Validate + normalise a date-range param to an ISO string. Rejects unparseable
// values (e.g. "notadate") so they never reach Postgres and blow up as a 500.
function normaliseDate(value, field) {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    throw new FilterValidationError(`Invalid ${field}: expected a valid date`)
  }
  return new Date(ms).toISOString()
}

// Build a WHERE clause + params array from the shared order filters
// (status, station, payment, date range). Used by both the list and the
// status-count endpoints so filtering stays consistent across them.
// `alias` prefixes columns (e.g. 'o.') for the joined list query; the counts
// query runs against the bare orders table so passes ''.
function buildOrderFilters(query, { alias = '', includeStatus = true, validStations } = {}) {
  const { status, station, payment, date_from, date_to } = query
  const search = (query.search ?? query.q ?? '').trim()
  const params = []
  const where = []
  // Validate status even when it isn't applied (the counts endpoint passes
  // includeStatus:false) so a malformed value is rejected consistently on both
  // endpoints; only append the SQL clause when the status filter is in effect.
  if (status) {
    const statuses = status.split(',')
    const bad = statuses.find(s => !VALID_STATUSES.includes(s))
    if (bad) {
      throw new FilterValidationError(`Invalid status: expected one of ${VALID_STATUSES.join(', ')}`)
    }
    if (includeStatus) {
      params.push(statuses)
      where.push(`${alias}status = ANY($${params.length}::text[])`)
    }
  }
  if (station && station !== 'all') {
    const allowed = validStations || new Set(DEFAULT_STATIONS)
    if (!allowed.has(station)) {
      throw new FilterValidationError(`Invalid station: expected one of ${[...allowed].join(', ')}`)
    }
    params.push(station)
    where.push(`${alias}station = $${params.length}`)
  }
  if (payment && payment !== 'all') {
    if (!VALID_PAYMENTS.includes(payment)) {
      throw new FilterValidationError(`Invalid payment: expected one of ${VALID_PAYMENTS.join(', ')}`)
    }
    if (payment === 'unpaid') {
      where.push(`${alias}payment_method IS NULL`)
    } else {
      params.push(payment)
      where.push(`${alias}payment_method = $${params.length}`)
    }
  }
  if (date_from) {
    params.push(normaliseDate(date_from, 'date_from'))
    where.push(`${alias}created_at >= $${params.length}`)
  }
  if (date_to) {
    params.push(normaliseDate(date_to, 'date_to'))
    where.push(`${alias}created_at <= $${params.length}`)
  }
  // Free-text search: an exact order-id / table-number match when the term is
  // numeric, plus a partial (case-insensitive) customer-name match. The
  // customer match uses a subquery so it works against both the joined list
  // query (alias 'o.') and the bare counts query (alias '').
  if (search) {
    const conds = []
    if (/^\d+$/.test(search)) {
      const num = parseInt(search, 10)
      params.push(num); conds.push(`${alias}id = $${params.length}`)
      params.push(num); conds.push(`${alias}table_number = $${params.length}`)
    }
    params.push(`%${search}%`)
    conds.push(`${alias}customer_id IN (SELECT id FROM customers WHERE name ILIKE $${params.length})`)
    where.push(`(${conds.join(' OR ')})`)
  }
  if (query.branch_id) {
    const bid = parseInt(query.branch_id, 10)
    if (!bid || bid < 1) throw new FilterValidationError('Invalid branch_id: must be a positive integer')
    params.push(bid)
    where.push(`${alias}branch_id = $${params.length}`)
  }
  return { where, params, whereSQL: where.length ? ' WHERE ' + where.join(' AND ') : '' }
}

// GET all orders — paginated (default 50, max 200) with X-Total-Count header.
// Supports server-side status / payment / date-range filtering so history
// search spans the whole dataset, not just the current page.
router.get('/', async (req, res) => {
  try {
    const { limit, offset } = req.query
    const validStations = await getValidStations()
    const { params, whereSQL } = buildOrderFilters(req.query, { alias: 'o.', validStations })

    // nosemgrep: config..semgrep.vendored-rules.javascript.express.security.injection.tainted-sql-string -- whereSQL is built from hardcoded clause templates in buildOrderFilters(); all user values are passed via the parameterized `params` array
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM orders o${whereSQL}`, params)
    res.set('X-Total-Count', String(total.rows[0].c))

    const lim = Math.min(Math.max(parseInt(limit) || 50, 1), 200)
    const off = Math.max(parseInt(offset) || 0, 0)

    let query = ORDERS_SELECT + whereSQL
    query += ` GROUP BY o.id, u.name, b.name, b.name_ar ORDER BY o.rush DESC, o.created_at DESC`
    params.push(lim); query += ` LIMIT $${params.length}`
    params.push(off); query += ` OFFSET $${params.length}`
    res.json(filterOrderFields((await pool.query(query, params)).rows, req.user?.role))
  } catch (err) {
    if (err instanceof FilterValidationError) return res.status(400).json({ error: err.message })
    logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' })
  }
})

// GET active order(s) for a specific table — must be before /:id
router.get('/table/:n', async (req, res) => {
  try {
    const n = parseInt(req.params.n)
    if (isNaN(n)) return res.status(400).json({ error: 'Invalid table number' })
    const result = await pool.query(
      `${ORDERS_SELECT}
       WHERE o.table_number=$1 AND o.status NOT IN ('completed','cancelled') AND o.type='dine-in'
       GROUP BY o.id, u.name, b.name, b.name_ar ORDER BY o.created_at DESC`,
      [n]
    )
    res.json(filterOrderFields(result.rows, req.user?.role))
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// GET orders by customer — must be before /:id
router.get('/customer/:customerId', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const result = await pool.query(
      `${ORDERS_SELECT} WHERE o.customer_id=$1 GROUP BY o.id, u.name, b.name, b.name_ar ORDER BY o.created_at DESC LIMIT 20`,
      [req.params.customerId]
    )
    res.json(filterOrderFields(result.rows, req.user?.role))
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// GET per-status counts across the whole (filtered) dataset — must be before /:id.
// Applies the same payment/date/station filters as the list, but NOT the status
// filter, so the tab badges show totals per status for the current filter set.
router.get('/counts', async (req, res) => {
  try {
    const validStations = await getValidStations()
    const { params, whereSQL } = buildOrderFilters(req.query, { includeStatus: false, validStations })
    const r = await pool.query(
      // nosemgrep: config..semgrep.vendored-rules.javascript.express.security.injection.tainted-sql-string -- whereSQL is built from hardcoded clause templates in buildOrderFilters(); all user values are passed via the parameterized `params` array
      `SELECT status, COUNT(*)::int AS c FROM orders${whereSQL} GROUP BY status`,
      params
    )
    const counts = {}
    let total = 0
    for (const row of r.rows) { counts[row.status] = row.c; total += row.c }
    counts.all = total
    res.json(counts)
  } catch (err) {
    if (err instanceof FilterValidationError) return res.status(400).json({ error: err.message })
    logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' })
  }
})

// GET the stations the UI can filter by — the ACTIVE managed list, so the
// Kitchen station filter reflects exactly what admins/managers configured
// (retired stations disappear from the dropdown; legacy values in old orders
// remain tolerated by the filter validation). Must be before /:id.
router.get('/stations', async (req, res) => {
  try {
    const { filterList } = await getStationSets()
    res.json(filterList)
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// GET single order — after all named sub-routes
router.get('/:id', async (req, res) => {
  try {
    const order = await pool.query(
      `${ORDERS_SELECT} WHERE o.id=$1 GROUP BY o.id, u.name, b.name, b.name_ar`,
      [req.params.id]
    )
    if (!order.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(filterOrderFields([order.rows[0]], req.user?.role)[0])
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// POST create order — cashier/manager/admin only (kitchen & staff cannot create financial orders)
router.post('/', requireRole('cashier', 'manager', 'admin'), validate(orderCreateSchema), async (req, res) => {
  // NOTE: client-supplied subtotal / tax / total are intentionally ignored.
  // The server recomputes all financial values from authoritative DB records.
  const { type, table_number, items, customer_id, notes, discount, discount_type, rush, station, branch_id } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Fetch authoritative tax rate from settings
    const { taxRate } = await getSettings(client)

    // Stations on new orders must come from the ACTIVE managed list. Anything
    // else (a retired station, a stale client, a hand-crafted value) routes to
    // the default 'kitchen' instead of silently creating an unmanaged station.
    const { active: activeStations } = await getStationSets()
    const coerceStation = s => (s && activeStations.has(s) ? s : 'kitchen')

    // Reprice every line item from authoritative menu / modifier data
    const repricedItems = []
    let rawSubtotal = 0

    for (const item of items) {
      let unitPrice = 0
      let itemName = item.name || null

      if (item.menu_item_id) {
        const m = await client.query(
          'SELECT name, price FROM menu_items WHERE id=$1 AND deleted_at IS NULL',
          [item.menu_item_id]
        )
        if (!m.rows.length) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: `Menu item ${item.menu_item_id} not found` })
        }
        unitPrice = parseFloat(m.rows[0].price)
        itemName = itemName || m.rows[0].name

        // Validate and sum modifier price-deltas from authoritative source.
        // Each submitted modifier id is verified to belong to a modifier_group
        // that is linked to this menu_item_id.  Any modifier id that is
        // missing, belongs to a different menu item, or is otherwise
        // unrecognised causes the entire order to be rejected so an
        // attacker cannot present a real menu_item_id while omitting valid
        // modifier ids to undercharge the order.
        const mods = Array.isArray(item.modifiers) ? item.modifiers : []
        for (const mod of mods) {
          if (!mod.id) continue // modifiers without an id carry no price (display-only)
          const modRow = await client.query(
            `SELECT m.price_delta
               FROM modifiers m
               JOIN modifier_groups mg ON mg.id = m.group_id
              WHERE m.id = $1 AND mg.menu_item_id = $2`,
            [mod.id, item.menu_item_id]
          )
          if (!modRow.rows.length) {
            await client.query('ROLLBACK')
            return res.status(400).json({
              error: `Modifier ${mod.id} is not valid for menu item ${item.menu_item_id}`
            })
          }
          unitPrice += parseFloat(modRow.rows[0].price_delta || 0)
        }
      } else {
        // Custom / open-priced item (no menu_item_id) — no authoritative source; clamp to ≥ 0
        unitPrice = Math.max(0, parseFloat(item.price || 0))
      }

      rawSubtotal += unitPrice * (item.quantity || 1)
      repricedItems.push({ ...item, _authPrice: unitPrice, name: itemName || 'Item' })
    }

    // Apply discount server-side — cap fixed to subtotal, cap percent to 100%
    // (same caps as PATCH /:id/discount so the stored discount is always ≤ what
    // the order is actually worth, regardless of the client-supplied value).
    const discountVal = Math.max(0, parseFloat(discount || 0))
    const discountType = discount_type === 'percent' ? 'percent' : 'fixed'
    const discountAmt = discountType === 'percent'
      ? rawSubtotal * Math.min(discountVal, 100) / 100
      : Math.min(discountVal, rawSubtotal)
    const discountedSub = Math.max(0, rawSubtotal - discountAmt)
    const serverTax   = parseFloat((discountedSub * taxRate).toFixed(3))
    const serverTotal = parseFloat((discountedSub + serverTax).toFixed(3))

    const orderResult = await client.query(
      `INSERT INTO orders
         (type, table_number, status, subtotal, tax, total, customer_id, notes,
          discount, discount_type, rush, station, user_id, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        type || 'dine-in', table_number || null, 'pending',
        parseFloat(discountedSub.toFixed(3)), serverTax, serverTotal,
        customer_id || null, notes || null,
        parseFloat(discountAmt.toFixed(3)), discountType,
        rush || false, coerceStation(station),
        req.user?.id || null,
        branch_id ? parseInt(branch_id, 10) : null
      ]
    )
    const order = orderResult.rows[0]

    for (const item of repricedItems) {
      await client.query(
        `INSERT INTO order_items
           (order_id, menu_item_id, quantity, price, name, notes, item_notes, modifiers, station)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          order.id, item.menu_item_id || null, item.quantity || 1,
          item._authPrice, item.name,
          item.notes || null, item.item_notes || null,
          JSON.stringify(Array.isArray(item.modifiers) ? item.modifiers : []),
          coerceStation(item.station)
        ]
      )
    }

    await client.query('COMMIT')
    invalidateStationCache()
    broadcast('order_created', { id: order.id, type: order.type, table_number: order.table_number, status: 'pending', rush: order.rush })
    // Notify admins/managers when a discount is applied at order creation.
    // Fire-and-forget — must never block or slow down the cashier response.
    // A secondary DB read fetches cashier name/email (not in JWT) for the payload.
    if (discountAmt > 0) {
      const _uid = req.user?.id || null
      const _oid = order.id
      const _bid = order.branch_id || null
      const _dAmt = parseFloat(discountAmt.toFixed(3))
      const _dType = discountType
      const _dInput = discountVal
      const _ip = req.ip || null
      pool.query('SELECT name, email FROM users WHERE id=$1', [_uid])
        .then(({ rows }) => {
          const payload = {
            orderId: _oid,
            cashierName: rows[0]?.name || null,
            cashierEmail: rows[0]?.email || null,
            discountAmt: _dAmt,
            discountType: _dType,
            discountInput: _dInput,
            branchId: _bid,
          }
          broadcast('discount_applied', payload)
          return pool.query(
            `INSERT INTO audit_log (user_id, user_email, method, path, status, ip, details)
             VALUES ($1,$2,'DISCOUNT',$3,200,$4,$5)`,
            [_uid, rows[0]?.email || null, `/api/orders/${_oid}/discount`, _ip, JSON.stringify(payload)]
          )
        })
        .catch(e => logger.error('[audit] discount log FAILED', { err: e.message }))
    }
    // Fire a server-side push to kitchen staff (no-op unless FCM configured).
    // Fire-and-forget: a push failure must never affect the order response.
    sendPushNotification(
      order.rush ? 'Rush order received' : 'New order received',
      `Order #${order.id}${order.table_number ? ` · Table ${order.table_number}` : ''}`,
      { role: 'kitchen', data: { orderId: order.id, type: 'order_created' } }
    ).catch(() => {})
    res.status(201).json(order)
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// PATCH toggle rush flag — kitchen can signal urgency; cashier/manager/admin can also set it
router.patch('/:id/rush', requireRole('kitchen', 'cashier', 'manager', 'admin'), validate(orderRushSchema), async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE orders SET rush=$1, updated_at=NOW() WHERE id=$2 RETURNING id, rush',
      [req.body.rush, req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    broadcast('order_updated', { id: parseInt(req.params.id), rush: req.body.rush })
    res.json(result.rows[0])
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// PATCH apply/remove discount
router.patch('/:id/discount', validate(orderDiscountSchema), async (req, res) => {
  const { discount, discount_type } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Sum original item prices to recalculate totals
    const items = await client.query(
      'SELECT SUM(price * quantity) AS raw_subtotal FROM order_items WHERE order_id=$1',
      [req.params.id]
    )
    const rawSubtotal = parseFloat(items.rows[0]?.raw_subtotal || 0)
    const { taxRate } = await getSettings(client)
    // Cap server-side: percent to 100%, fixed to the order subtotal — a
    // hand-crafted request cannot record a discount larger than the order.
    const discountAmt = discount_type === 'percent'
      ? rawSubtotal * Math.min(discount, 100) / 100
      : Math.min(discount, rawSubtotal)
    const discountedSub = Math.max(0, rawSubtotal - discountAmt)
    const newTax = parseFloat((discountedSub * taxRate).toFixed(3))
    const newTotal = parseFloat((discountedSub + newTax).toFixed(3))
    const result = await client.query(
      `UPDATE orders SET
         discount=$1, discount_type=$2,
         subtotal=$3, tax=$4, total=$5,
         updated_at=NOW()
       WHERE id=$6 AND status NOT IN ('completed','cancelled') RETURNING *`,
      [parseFloat(discountAmt.toFixed(3)), discount_type, parseFloat(discountedSub.toFixed(3)), newTax, newTotal, req.params.id]
    )
    if (!result.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Order not found or already completed' })
    }
    await client.query('COMMIT')
    const row = result.rows[0]
    // Notify admins/managers in real time — fire-and-forget, non-blocking.
    // A secondary DB read fetches cashier name/email (not in JWT) for the payload.
    if (parseFloat(row.discount) > 0) {
      const _uid = req.user?.id || null
      const _oid = row.id
      const _bid = row.branch_id || null
      const _dAmt = parseFloat(row.discount)
      const _dType = row.discount_type
      const _dInput = discount
      const _ip = req.ip || null
      pool.query('SELECT name, email FROM users WHERE id=$1', [_uid])
        .then(({ rows }) => {
          const payload = {
            orderId: _oid,
            cashierName: rows[0]?.name || null,
            cashierEmail: rows[0]?.email || null,
            discountAmt: _dAmt,
            discountType: _dType,
            discountInput: _dInput,
            branchId: _bid,
          }
          broadcast('discount_applied', payload)
          return pool.query(
            `INSERT INTO audit_log (user_id, user_email, method, path, status, ip, details)
             VALUES ($1,$2,'DISCOUNT',$3,200,$4,$5)`,
            [_uid, rows[0]?.email || null, `/api/orders/${_oid}/discount`, _ip, JSON.stringify(payload)]
          )
        })
        .catch(e => logger.error('[audit] discount log FAILED', { err: e.message }))
    }
    res.json(row)
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// PATCH toggle individual item done in kitchen — kitchen marks their items; cashier/manager/admin can too
router.patch('/:id/items/:itemId/done', requireRole('kitchen', 'cashier', 'manager', 'admin'), validate(orderItemDoneSchema), async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE order_items SET done=$1 WHERE id=$2 AND order_id=$3 RETURNING id, done',
      [req.body.done, req.params.itemId, req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' })
    broadcast('order_updated', { id: parseInt(req.params.id), type: 'item_done' })
    res.json(result.rows[0])
  } catch (err) { logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' }) }
})

// Apply the financial/stock side effects of an order becoming COMPLETED:
// recipe-based inventory deduction (with stock_movements audit rows) and
// customer accounting (total_spent, loyalty earn + capped redemption).
// Shared by PATCH /:id/status and the split-payment auto-complete path so a
// split-paid order can never bypass stock or loyalty accounting.
// Must run inside the caller's open transaction, with the order row locked.
async function applyCompletionEffects(client, orderId, { orderTotal, customerId, loyaltyRedemptionPoints }) {
  const orderItems = (await client.query(
    'SELECT menu_item_id, quantity FROM order_items WHERE order_id=$1 AND menu_item_id IS NOT NULL',
    [orderId]
  )).rows

  // Fetch every recipe ingredient for all of the order's menu items in ONE
  // JOIN query (replaces the previous per-item N+1), then group by menu item
  // in JS so each order line deducts its own recipe below.
  const menuIds = [...new Set(orderItems.map(oi => oi.menu_item_id))]
  const recipeByMenu = new Map()
  if (menuIds.length) {
    const recipeRows = (await client.query(
      `SELECT ri.menu_item_id, ri.inventory_item_id, ri.quantity AS ing_qty,
              ri.unit AS recipe_unit, i.unit AS inv_unit
       FROM recipe_ingredients ri
       JOIN inventory i ON i.id = ri.inventory_item_id
       WHERE ri.menu_item_id = ANY($1::int[]) AND ri.inventory_item_id IS NOT NULL`,
      [menuIds]
    )).rows
    for (const r of recipeRows) {
      if (!recipeByMenu.has(r.menu_item_id)) recipeByMenu.set(r.menu_item_id, [])
      recipeByMenu.get(r.menu_item_id).push(r)
    }
  }

  for (const oi of orderItems) {
    const recipe = recipeByMenu.get(oi.menu_item_id) || []
    for (const ri of recipe) {
      const deduct = computeDeductAmount({
        ingQty: ri.ing_qty, recipeUnit: ri.recipe_unit,
        invUnit: ri.inv_unit, orderQty: oi.quantity,
      })
      const upd = await client.query(
        `WITH prev AS (SELECT quantity AS q FROM inventory WHERE id=$2)
         UPDATE inventory SET quantity = GREATEST(0, quantity - $1), updated_at=NOW()
         WHERE id=$2
         RETURNING quantity AS new_q, (SELECT q FROM prev) AS old_q`,
        [deduct, ri.inventory_item_id]
      )
      const row = upd.rows[0]
      const actualDelta = row ? parseFloat(row.new_q) - parseFloat(row.old_q) : 0
      if (actualDelta !== 0) {
        await recordStockMovement(client, {
          inventoryItemId: ri.inventory_item_id, change: actualDelta,
          quantityAfter: row.new_q, movementType: 'sale',
          referenceType: 'order', referenceId: orderId
        })
      }
    }
  }

  if (customerId) {
    const { loyaltyPerDollar } = await getSettings(client)
    const pointsEarned = Math.floor(parseFloat(orderTotal) * loyaltyPerDollar)

    // Cap redemption points to (a) the customer's actual balance and
    // (b) the maximum points that can be absorbed by the order total.
    // Both caps operate on the point count so the stored monetary discount
    // stays perfectly consistent with the deducted points — ensuring the
    // reversal path can reconstruct the exact point count from the stored
    // discount without rounding drift.
    let requestedRedemption = loyaltyRedemptionPoints && loyaltyRedemptionPoints > 0
      ? parseInt(loyaltyRedemptionPoints) : 0
    if (requestedRedemption > 0) {
      const custRow = await client.query(
        'SELECT loyalty_points FROM customers WHERE id=$1',
        [customerId]
      )
      const actualBalance = parseInt(custRow.rows[0]?.loyalty_points ?? 0)
      // Cap 1: never redeem more than the customer actually has
      requestedRedemption = Math.min(requestedRedemption, Math.max(0, actualBalance))
      // Cap 2: never redeem more points than the order total can absorb
      const maxRedeemable = loyaltyPerDollar > 0
        ? Math.floor(parseFloat(orderTotal) * loyaltyPerDollar) : 0
      requestedRedemption = Math.min(requestedRedemption, maxRedeemable)
    }
    const pointsToRedeem = requestedRedemption

    // Monetary discount derived directly from capped pointsToRedeem so
    // round-tripping (points → discount → points) is always exact.
    const loyaltyDiscount = loyaltyPerDollar > 0
      ? parseFloat((pointsToRedeem / loyaltyPerDollar).toFixed(3)) : 0

    // ALWAYS persist (including explicit 0): a stale value from a previous
    // completion cycle would otherwise make the reversal path over-refund
    // redemption points that were never deducted this time.
    await client.query('UPDATE orders SET loyalty_discount=$1 WHERE id=$2', [loyaltyDiscount, orderId])
    await client.query(
      `UPDATE customers SET
        total_orders = total_orders + 1,
        total_spent = total_spent + $1,
        loyalty_points = GREATEST(0, loyalty_points + $2 - $3),
        updated_at = NOW()
       WHERE id = $4`,
      [parseFloat(orderTotal), pointsEarned, pointsToRedeem, customerId]
    )
  }
}

// PATCH update order status
router.patch('/:id/status', validate(orderStatusSchema), async (req, res) => {
  const { status, payment_method, loyalty_redemption_points, void_reason, void_manager_pin } = req.body

  // Every cancellation requires an explicit reason
  if (status === 'cancelled' && !void_reason?.trim()) {
    return res.status(400).json({ error: 'A reason is required when cancelling an order.' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // FOR UPDATE locks the row so concurrent status transitions serialize — prevents double-deduction
    const prev = await client.query('SELECT status, total, customer_id, loyalty_discount, payment_method FROM orders WHERE id=$1 FOR UPDATE', [req.params.id])
    if (!prev.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }) }
    const { status: prevStatus, total: orderTotal, customer_id, loyalty_discount: prevLoyaltyDiscount, payment_method: prevPaymentMethod } = prev.rows[0]
    const wasCompleted = prevStatus === 'completed'

    // Pay-later orders (payment_method IS NULL = payment not yet collected) can only be
    // moved to 'preparing' or 'ready' by kitchen staff. Cashiers must not advance the
    // kitchen workflow on orders where payment has been deferred.
    if (['preparing', 'ready'].includes(status) && prevPaymentMethod === null && req.user?.role === 'cashier') {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Pay-later orders can only be moved to preparing or ready by kitchen staff.' })
    }

    // Voiding a COMPLETED order requires manager/admin role or the correct override PIN
    if (status === 'cancelled' && wasCompleted) {
      if (!['admin', 'manager'].includes(req.user?.role)) {
        const pinRow = await client.query("SELECT value FROM settings WHERE key='void_manager_pin'")
        const storedPin = pinRow.rows[0]?.value
        if (storedPin && (!void_manager_pin || void_manager_pin !== storedPin)) {
          await client.query('ROLLBACK')
          return res.status(403).json({ error: 'Manager override PIN required to void a completed order.' })
        }
      }
    }

    // Build UPDATE dynamically to include void/payment fields only when relevant
    const sets   = []
    const params = [status, req.params.id]

    if (status === 'completed' && payment_method) {
      params.push(payment_method)
      sets.push(`payment_method=$${params.length}`, 'paid_at=NOW()')
    }
    if (status === 'cancelled') {
      params.push(void_reason.trim())
      sets.push(`void_reason=$${params.length}`)
      params.push(req.user?.id ?? null)
      sets.push(`voided_by=$${params.length}`, 'voided_at=NOW()')
    }

    const extraSQL = sets.length ? sets.join(', ') + ', ' : ''
    const result = await client.query(
      `UPDATE orders SET status=$1, ${extraSQL}updated_at=NOW() WHERE id=$2 RETURNING *`,
      params
    )

    if (status === 'completed' && !wasCompleted) {
      await applyCompletionEffects(client, parseInt(req.params.id), {
        orderTotal, customerId: customer_id,
        loyaltyRedemptionPoints: loyalty_redemption_points,
      })
    }

    // Restock whenever an order LEAVES the completed state (cancelled, or reverted
    // back to an active status). This keeps stock symmetric with the deduction
    // above and prevents double-deduction if the order is completed again later.
    if (wasCompleted && status !== 'completed') {
      const movementType = status === 'cancelled' ? 'cancellation' : 'reversal'
      // Reverse EXACTLY what this order applied to stock by replaying its recorded
      // movement deltas (net per ingredient). This stays symmetric even when the
      // completion deduction was clamped at zero — recomputing from the recipe
      // would otherwise over-restock above the pre-sale level.
      const net = await client.query(
        `SELECT inventory_item_id, SUM(change) AS net
         FROM stock_movements
         WHERE reference_type='order' AND reference_id=$1 AND inventory_item_id IS NOT NULL
         GROUP BY inventory_item_id
         HAVING SUM(change) <> 0`,
        [parseInt(req.params.id)]
      )
      for (const r of net.rows) {
        const restore = -parseFloat(r.net) // net is negative when stock was consumed
        if (restore === 0) continue
        const upd = await client.query(
          `WITH prev AS (SELECT quantity AS q FROM inventory WHERE id=$2)
           UPDATE inventory SET quantity = GREATEST(0, quantity + $1), updated_at=NOW()
           WHERE id=$2
           RETURNING quantity AS new_q, (SELECT q FROM prev) AS old_q`,
          [restore, r.inventory_item_id]
        )
        const row = upd.rows[0]
        const actualDelta = row ? parseFloat(row.new_q) - parseFloat(row.old_q) : 0
        if (actualDelta !== 0) {
          await recordStockMovement(client, {
            inventoryItemId: r.inventory_item_id, change: actualDelta,
            quantityAfter: row.new_q, movementType,
            referenceType: 'order', referenceId: parseInt(req.params.id)
          })
        }
      }
      if (customer_id) {
        const { loyaltyPerDollar } = await getSettings(client)
        // Reverse the completion's loyalty effect exactly: it added
        // (earned - redeemed), so we subtract earned and refund redeemed.
        const pointsEarned = Math.floor(parseFloat(orderTotal) * loyaltyPerDollar)
        const redeemedPoints = Math.round(parseFloat(prevLoyaltyDiscount || 0) * loyaltyPerDollar)
        await client.query(
          `UPDATE customers SET
            total_orders = GREATEST(0, total_orders - 1),
            total_spent = GREATEST(0, total_spent - $1),
            loyalty_points = GREATEST(0, loyalty_points - $2 + $3),
            updated_at = NOW()
           WHERE id = $4`,
          [parseFloat(orderTotal), pointsEarned, redeemedPoints, customer_id]
        )
      }
      // Clear the redeemed-discount marker now that it has been refunded —
      // a later re-completion must never see (and re-refund) a stale value.
      await client.query('UPDATE orders SET loyalty_discount=0 WHERE id=$1', [parseInt(req.params.id)])
    }

    await client.query('COMMIT')
    broadcast('order_updated', { id: parseInt(req.params.id), status })
    // Notify front-of-house staff when an order becomes ready for pickup.
    // Fire-and-forget after COMMIT: push failure must never affect the response.
    if (status === 'ready' && prevStatus !== 'ready') {
      const o = result.rows[0]
      sendPushNotification(
        'Order ready for pickup',
        `Order #${o.id}${o.table_number ? ` · Table ${o.table_number}` : ''} is ready`,
        { role: ['staff', 'cashier', 'manager', 'admin'], data: { orderId: o.id, type: 'order_ready' } }
      ).catch(() => {})
    }
    res.json(result.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// ── POST /api/orders/:id/split-payment ────────────────────────────────────────
// Runs in a single transaction with the order row locked (FOR UPDATE) so
// concurrent split payments serialize. Payments are rejected on completed /
// cancelled orders and capped to the outstanding balance. When the order
// becomes fully paid it is completed through the SAME side-effect path as
// PATCH /:id/status (inventory deduction + loyalty accounting) — split payment
// can never bypass stock or customer accounting.
router.post('/:id/split-payment', async (req, res) => {
  const { method, amount, notes } = req.body
  const METHODS = ['cash', 'card', 'other']
  if (!method || !METHODS.includes(method)) return res.status(400).json({ error: 'Invalid payment method' })
  const amt = parseFloat(amount)
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be positive' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const order = await client.query(
      'SELECT id, status, total, customer_id FROM orders WHERE id=$1 FOR UPDATE',
      [req.params.id]
    )
    if (!order.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }) }
    const { status, total, customer_id } = order.rows[0]
    if (status === 'completed' || status === 'cancelled') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Order is already ${status} — no further payments accepted` })
    }

    const orderTotal = parseFloat(total)
    const paidSoFar = parseFloat((await client.query(
      'SELECT COALESCE(SUM(amount),0) AS total_paid FROM split_payments WHERE order_id=$1',
      [req.params.id]
    )).rows[0].total_paid)
    const remaining = orderTotal - paidSoFar
    // Cap each payment to the outstanding balance (small tolerance for rounding).
    if (amt > remaining + 0.001) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Amount exceeds the remaining balance of ${Math.max(0, remaining).toFixed(3)}` })
    }

    const r = await client.query(
      'INSERT INTO split_payments (order_id, method, amount, notes) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, method, amt.toFixed(3), notes || null]
    )
    const totalPaid = parseFloat((paidSoFar + amt).toFixed(3))

    let completed = false
    if (totalPaid >= orderTotal - 0.001) {
      await client.query(
        "UPDATE orders SET status='completed', paid_at=NOW(), payment_method=$1, updated_at=NOW() WHERE id=$2",
        ['split', req.params.id]
      )
      // Same completion side effects as PATCH /:id/status — no bypass.
      await applyCompletionEffects(client, parseInt(req.params.id), {
        orderTotal, customerId: customer_id, loyaltyRedemptionPoints: 0,
      })
      completed = true
    }
    await client.query('COMMIT')
    if (completed) broadcast('order_updated', { id: parseInt(req.params.id), status: 'completed' })
    res.status(201).json({ payment: r.rows[0], total_paid: totalPaid, order_total: orderTotal })
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message, { path: req.path }); res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

// ── POST /api/orders/:id/pay ───────────────────────────────────────────────────
// Batch / atomic payment collection for pay-later orders.  Accepts the full
// payment in one shot — either a single method or a split across multiple
// methods — validates that the provided amounts sum to the order total
// (within 0.005 OMR rounding tolerance), clears any prior partial payments for
// this order, inserts the new split_payments rows, marks the order completed,
// and runs the same applyCompletionEffects path as PATCH /:id/status.
//
// Body: { splits: [{method, amount}, ...], loyalty_redemption_points? }
//   method  — 'cash' | 'card' | 'other'
//   amount  — positive number (in OMR)
//
// If splits has exactly one entry the order's payment_method is set to that
// method name (e.g. 'cash'); if there are two or more it is set to 'split'.
router.post('/:id/pay', requireRole('cashier', 'manager', 'admin'), async (req, res) => {
  const { splits, loyalty_redemption_points } = req.body
  const METHODS = ['cash', 'card', 'other']

  if (!Array.isArray(splits) || splits.length === 0) {
    return res.status(400).json({ error: 'splits must be a non-empty array of {method, amount}' })
  }
  for (const s of splits) {
    if (!METHODS.includes(s.method)) {
      return res.status(400).json({ error: `Invalid method "${s.method}" — expected one of ${METHODS.join(', ')}` })
    }
    const amt = parseFloat(s.amount)
    if (!(amt > 0)) {
      return res.status(400).json({ error: 'Each split amount must be a positive number' })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const order = await client.query(
      'SELECT id, status, total, customer_id FROM orders WHERE id=$1 FOR UPDATE',
      [req.params.id]
    )
    if (!order.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Order not found' })
    }
    const { status, total, customer_id } = order.rows[0]

    if (status === 'completed' || status === 'cancelled') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Order is already ${status} — no payment accepted` })
    }

    const orderTotal = parseFloat(total)
    const providedSum = splits.reduce((acc, s) => acc + parseFloat(s.amount), 0)

    if (Math.abs(providedSum - orderTotal) > 0.005) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        error: `Payment total ${providedSum.toFixed(3)} does not match order total ${orderTotal.toFixed(3)}`
      })
    }

    // Replace any existing partial split_payments so the cashier can retry
    // with a corrected split without being blocked by a prior partial attempt.
    await client.query('DELETE FROM split_payments WHERE order_id=$1', [req.params.id])

    const paymentRows = []
    for (const s of splits) {
      const r = await client.query(
        'INSERT INTO split_payments (order_id, method, amount) VALUES ($1,$2,$3) RETURNING *',
        [req.params.id, s.method, parseFloat(s.amount).toFixed(3)]
      )
      paymentRows.push(r.rows[0])
    }

    const finalPM = splits.length === 1 ? splits[0].method : 'split'
    await client.query(
      'UPDATE orders SET status=$1, payment_method=$2, paid_at=NOW(), updated_at=NOW() WHERE id=$3',
      ['completed', finalPM, req.params.id]
    )
    await applyCompletionEffects(client, parseInt(req.params.id), {
      orderTotal, customerId: customer_id, loyaltyRedemptionPoints: loyalty_redemption_points,
    })

    await client.query('COMMIT')
    broadcast('order_updated', { id: parseInt(req.params.id), status: 'completed' })

    const updatedOrder = (await pool.query(
      `${ORDERS_SELECT} WHERE o.id=$1 GROUP BY o.id, u.name, b.name, b.name_ar`,
      [req.params.id]
    )).rows[0]

    res.json({ order: updatedOrder, split_payments: paymentRows })
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err?.message, { path: req.path })
    res.status(500).json({ error: 'Server error' })
  } finally { client.release() }
})

export default router
