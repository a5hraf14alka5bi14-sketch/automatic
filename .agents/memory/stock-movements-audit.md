---
name: Stock movements audit correctness
description: How stock_movements logging stays consistent with clamped/atomic inventory writes
---

# Stock movements audit correctness

Movement rows must record the **actual applied delta**, never the requested amount.

**Why:** inventory updates clamp at zero (`GREATEST(0, quantity - $1)`). Logging the
requested deduction (e.g. -5) when only 1 unit existed (actual -1) silently corrupts the
audit trail and makes `quantity_after` inconsistent with the summed history.

**How to apply:**
- For any write that can clamp, return both old and new quantity in one statement and log
  `new - old`. Pattern used in `orders.js` completion/cancellation:
  ```sql
  WITH prev AS (SELECT quantity AS q FROM inventory WHERE id=$2)
  UPDATE inventory SET quantity = GREATEST(0, quantity - $1), updated_at=NOW()
  WHERE id=$2 RETURNING quantity AS new_q, (SELECT q FROM prev) AS old_q
  ```
  Then only log when `actualDelta !== 0`.
- Item creation + its `initial` movement must be one transaction (BEGIN/COMMIT/ROLLBACK on
  a single client, pass that client to `recordStockMovement`), or a failed movement insert
  leaves an item with no origin record.
- `recordStockMovement(db, ...)` takes either the pool or a transaction client — always pass
  the transaction client when inside BEGIN so the log commits/rolls back atomically.
- `recordStockMovement` silently skips zero deltas by default (`!change` guard). A stocktake
  that *confirms* the system quantity is still a real count and must be recorded (it drives
  the item's `last_counted_at` / "counted vs placeholder" status) — pass `allowZero: true`
  for that case only; other callers should keep skipping zero deltas.
