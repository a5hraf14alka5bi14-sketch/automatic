/**
 * Shared order-pricing helpers.
 *
 * Used by BOTH the authenticated staff endpoint (POST /api/orders) and the
 * public QR self-ordering endpoint (POST /api/public/orders).
 *
 * This is the ONLY place where menu prices and modifier deltas are fetched
 * from the database — neither endpoint trusts client-supplied prices.
 */

/**
 * Re-prices every item against the authoritative DB and validates modifiers.
 *
 * @param {import('pg').PoolClient} client  - active pg client inside a transaction
 * @param {Array}  items                    - raw items from the request body
 * @param {object} [opts]
 * @param {boolean} [opts.requireAvailable] - true → item must have available=true
 *                                            (used by QR endpoint; staff can ring
 *                                             up temporarily-unavailable items)
 * @returns {{ repricedItems: Array, rawSubtotal: number }}
 * @throws {{ status: number, error: string }} on validation failure
 */
export async function repriceItems(client, items, { requireAvailable = false } = {}) {
  const repricedItems = []
  let rawSubtotal = 0

  for (const item of items) {
    let unitPrice = 0
    let itemName = item.name || null

    if (item.menu_item_id) {
      const availClause = requireAvailable ? ' AND available = true' : ''
      const m = await client.query(
        `SELECT name, price FROM menu_items WHERE id=$1 AND deleted_at IS NULL${availClause}`,
        [item.menu_item_id]
      )
      if (!m.rows.length) {
        throw { status: 400, error: `Menu item ${item.menu_item_id} not found or unavailable` }
      }
      unitPrice = parseFloat(m.rows[0].price)
      itemName = itemName || m.rows[0].name

      // Validate every modifier id against the menu item it belongs to.
      // A forged / cross-item modifier id is rejected — the entire order fails.
      const mods = Array.isArray(item.modifiers) ? item.modifiers : []
      for (const mod of mods) {
        if (!mod.id) continue
        const modRow = await client.query(
          `SELECT m.price_delta
             FROM modifiers m
             JOIN modifier_groups mg ON mg.id = m.group_id
            WHERE m.id = $1 AND mg.menu_item_id = $2`,
          [mod.id, item.menu_item_id]
        )
        if (!modRow.rows.length) {
          throw { status: 400, error: `Modifier ${mod.id} is not valid for menu item ${item.menu_item_id}` }
        }
        unitPrice += parseFloat(modRow.rows[0].price_delta || 0)
      }
    } else {
      // Custom / open-priced item (no menu_item_id) — clamp to ≥ 0.
      // Not available to QR customers (schema requires menu_item_id), but
      // kept here so the shared function stays usable for staff open items.
      unitPrice = Math.max(0, parseFloat(item.price || 0))
    }

    rawSubtotal += unitPrice * (item.quantity || 1)
    repricedItems.push({ ...item, _authPrice: unitPrice, name: itemName || 'Item' })
  }

  return { repricedItems, rawSubtotal }
}

/**
 * Inserts order_items rows for a given order within a transaction.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} orderId
 * @param {Array}  repricedItems - output of repriceItems()
 * @param {Function} coerceStation - maps raw station value → valid active station
 */
export async function insertOrderItems(client, orderId, repricedItems, coerceStation) {
  for (const item of repricedItems) {
    await client.query(
      `INSERT INTO order_items
         (order_id, menu_item_id, quantity, price, name, notes, item_notes, modifiers, station)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        orderId,
        item.menu_item_id || null,
        item.quantity || 1,
        item._authPrice,
        item.name,
        item.notes || null,
        item.item_notes || null,
        JSON.stringify(Array.isArray(item.modifiers) ? item.modifiers : []),
        coerceStation(item.station),
      ]
    )
  }
}
