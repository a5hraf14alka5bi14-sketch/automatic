---
name: Order status reversal symmetry (stock + loyalty)
description: How reverting/cancelling a completed order must undo stock + loyalty exactly
---

# Reversing a completed order must be exactly symmetric

Deduction fires when an order ENTERS `completed`; the reversal fires whenever it LEAVES `completed` (cancelled OR reverted to an active status) — condition `wasCompleted && status !== 'completed'` in `server/routes/orders.js` PATCH `/:id/status`.

**Rule 1 — restock from recorded movements, NOT the recipe.**
Reversal restores stock by replaying the order's own `stock_movements`: `SUM(change)` per `inventory_item_id` where `reference_type='order' AND reference_id=<order>`, then applies `-net`.
**Why:** completion deduction clamps at zero (`GREATEST(0, quantity - deduct)`). If stock was insufficient at completion, the actual deducted amount is less than the recipe amount; recomputing from the recipe over-restocks above the pre-sale level. Replaying recorded deltas is self-correcting and also survives recipe-link edits between completion and cancellation. Reversal movements are themselves logged, so a later re-complete → re-cancel nets correctly.

**Rule 2 — loyalty reversal must mirror completion's `+earned − redeemed`.**
Completion does `loyalty_points += earned − redeemed`. Reversal must do `loyalty_points -= earned` AND `+= redeemed` (refund redeemed points), not just subtract earned. Redeemed points aren't stored directly — derive them from the order's `loyalty_discount` column: `redeemedPoints = round(loyalty_discount * loyaltyPerDollar)`. Also decrement `total_orders` and `total_spent`.
**Why:** subtracting only `earned` on revert leaves the customer at `−redeemed` vs their pre-completion balance. This bit us on `completed→pending` and on cancelling an order that used a redemption.

**How to apply:** any change to the deduction/loyalty math on completion must be mirrored in the leave-completed block. Regression coverage lives in `tests/integration.test.js` ("Order status reversal symmetry") — completes with redemption, reverts (asserts stock + loyalty + totals restored), re-completes (asserts single deduction, not doubled).
