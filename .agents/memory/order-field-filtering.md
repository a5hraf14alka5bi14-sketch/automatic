---
name: Order financial field filtering
description: Kitchen/staff roles receive orders with financial fields stripped; access token is 15m.
---

# Order Financial Field Filtering

## The rule
`filterOrderFields(rows, role)` in `server/routes/orders.js` strips `subtotal`, `tax`, `total`, `discount`, `discount_type`, `payment_method`, `loyalty_discount`, `void_reason`, `voided_by`, `voided_at` for `kitchen` and `staff` roles.

Applied on all GET order routes: `GET /`, `GET /table/:n`, `GET /customer/:customerId`, `GET /:id`.

**Why:** Kitchen staff need operational fields (items, table, status, rush) but must not see pricing or payment data — this closes an information-disclosure risk.

## Access token lifetime
`makeTokens()` in `server/routes/auth.js` issues access tokens with `expiresIn: '15m'` (was 2h). This bounds the window during which a `must_change_password=true` flag set by an admin takes effect — the token refresh re-queries the DB flag and the new token carries `mustChange=true`, blocking APIs via `enforcePasswordChange`.

**How to apply:** If auth issues arise (e.g. users getting unexpectedly logged out), check that the frontend's `apiFetch` 401-retry + cookie refresh is working. The 15m access token is intentional.
