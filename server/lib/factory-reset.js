/**
 * Factory reset — wipes OPERATIONAL data only, preserving configuration:
 * menu, categories, recipes, inventory items, suppliers, users/roles,
 * settings, taxes and integrations all survive.
 *
 * Deleted (with per-table counts returned):
 *   split_payments, order_items, orders, shifts, stock_movements,
 *   purchase_order_items, purchase_orders, finance_entries,
 *   audit_log, sync_log
 * Reset in place:
 *   customers   — rows kept, loyalty_points / total_orders / total_spent → 0
 *   inventory   — quantities zeroed ('zero' mode) or kept as opening stock
 *                 ('keep' mode); an 'initial' opening movement is recorded
 *                 for every remaining non-zero quantity
 *   settings    — cached AI summary keys removed
 * Sequences of all emptied tables are restarted at 1.
 *
 * Runs in a single transaction — all-or-nothing.
 */
import { recordStockMovement } from '../db.js'

// Ordered so FK children are deleted before their parents.
const PURGE_TABLES = [
  'split_payments',
  'order_items',
  'orders',
  'shifts',
  'stock_movements',
  'purchase_order_items',
  'purchase_orders',
  'finance_entries',
  'audit_log',
  'sync_log',
]

const AI_CACHE_KEYS = ['last_ai_summary', 'last_ai_summary_at']

export async function performFactoryReset(pool, { inventoryMode = 'keep' } = {}) {
  if (!['zero', 'keep'].includes(inventoryMode)) {
    throw Object.assign(new Error('inventoryMode must be "zero" or "keep"'), { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const deleted = {}
    for (const table of PURGE_TABLES) {
      const r = await client.query(`DELETE FROM ${table}`)
      deleted[table] = r.rowCount
    }

    // Restart sequences NOW, while every purged table is still empty —
    // opening stock movements inserted below must claim ids from 1 upward.
    for (const table of PURGE_TABLES) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), 1, false)
         WHERE pg_get_serial_sequence($1, 'id') IS NOT NULL`,
        [table]
      )
    }

    // Customers: keep the records, reset the operational counters.
    const cust = await client.query(
      `UPDATE customers SET loyalty_points = 0, total_orders = 0, total_spent = 0, updated_at = NOW()
       WHERE loyalty_points <> 0 OR total_orders <> 0 OR total_spent <> 0`
    )

    // Cached AI summary is derived from the deleted orders — clear it.
    await client.query(
      `DELETE FROM settings WHERE key = ANY($1::text[])`, [AI_CACHE_KEYS]
    )

    // Inventory quantities.
    let inventoryZeroed = 0
    if (inventoryMode === 'zero') {
      const r = await client.query(
        `UPDATE inventory SET quantity = 0, updated_at = NOW()
         WHERE deleted_at IS NULL AND quantity <> 0`
      )
      inventoryZeroed = r.rowCount
    }

    // Opening-stock movements for whatever quantity remains (fresh ledger).
    const remaining = await client.query(
      `SELECT id, quantity FROM inventory WHERE deleted_at IS NULL AND quantity > 0`
    )
    for (const row of remaining.rows) {
      const qty = parseFloat(row.quantity)
      await recordStockMovement(client, {
        inventoryItemId: row.id,
        change: qty,
        quantityAfter: qty,
        movementType: 'initial',
        referenceType: 'manual',
        note: 'Opening stock (factory reset)',
      })
    }

    await client.query('COMMIT')
    return {
      deleted,
      customers_reset: cust.rowCount,
      inventory_mode: inventoryMode,
      inventory_zeroed: inventoryZeroed,
      opening_stock_entries: remaining.rows.length,
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
