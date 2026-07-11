---
name: Loyalty points redemption
description: How loyalty earning and redemption work end-to-end at POS checkout
---

## Schema
`orders.loyalty_discount NUMERIC(10,3) DEFAULT 0` — added via ALTER TABLE … IF NOT EXISTS.

## Earning (existing)
When PATCH /:id/status → completed: `pointsEarned = floor(orderTotal × loyaltyPerOmr)`, added to customer.loyalty_points.

## Redemption (added)
- `loyalty_redemption_points` accepted in PATCH body (Joi: integer ≥ 0, optional).
- `loyaltyDiscount = pointsToRedeem / loyaltyPerOmr` (rounded to 3 decimals).
- Stored in `orders.loyalty_discount`.
- Net customer points = earned − redeemed (single UPDATE: `GREATEST(0, loyalty_points + earned − redeemed)`).

## POS UI (PaymentModal)
- `payModal` object includes `loyalty_points` (from selectedCustomer) and `loyalty_per_omr` (from settings).
- `maxRedeemable = min(customer_points, floor(orderTotal × loyaltyPerOmr))` — prevents redeeming more than the bill.
- Toggle button "🎁 Redeem Loyalty Points" shows pts → OMR conversion and live "Amount Due" update.
- `onConfirm(orderId, method, pointsToRedeem)` passes points up; `handlePayment` sends them in PATCH body.

**Why:** Points redemption only applies when a customer is linked to the order; no-customer orders skip the loyalty block entirely.

**How to apply:** If displaying "amount paid" on receipts or in order history, use `order.total - order.loyalty_discount` as the effective amount received.
