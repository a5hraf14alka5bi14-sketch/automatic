---
name: Order completion side effects
description: Rule for keeping every order-completion path (status route, split-payment, any future path) financially symmetric.
---

**Rule:** Every code path that flips an order to `completed` must run the shared `applyCompletionEffects(client, orderId, {orderTotal, customerId, loyaltyRedemptionPoints})` helper in `server/routes/orders.js` inside a transaction with the order row locked (`SELECT ... FOR UPDATE`). Never re-implement inventory deduction or customer accounting inline.

**Why:** The split-payment auto-complete path once updated status directly, silently skipping inventory deduction, stock_movements audit rows, and customer total_spent/loyalty accrual — a financial-integrity bypass exploitable by any staff role.

Loyalty marker rule: `orders.loyalty_discount` must be **written on every completion** (explicit `0` when no redemption) and **cleared to 0 when an order leaves completed** (after the refund is applied). The reversal path derives refunded points from the stored marker, so a stale non-zero value from a previous cycle over-refunds points.

**How to apply:** Any new payment/settlement flow (e.g. future partial refunds, online payments) that completes orders should call the helper and honor the marker rules. Regression guard: `tests/order-integrity.test.js` ("Loyalty reversal symmetry" + split-payment integrity cases).
