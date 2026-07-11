---
name: Financial field stripping on role-open GETs
description: RBAC pattern — routes POS/Kitchen need stay open to all roles, but financial fields are stripped server-side for non-management.
---

The rule: when a GET endpoint must stay accessible to cashier/kitchen/staff
(POS menu, inventory stock warnings, dashboard counts), do NOT lock it with
requireRole — instead strip management-only fields from the response based on
`req.user.role` before `res.json`.

**Why:** locking these GETs breaks role-open pages (POS/Kitchen); leaving them
unfiltered leaks margin/cost/supplier/revenue data to low-privilege roles.
SELECT * routes silently leak newly added financial columns.

**How to apply:**
- Menu GETs strip `food_cost` (+ `avg_cost`/`avg_margin` on stats) for
  non-admin/manager; inventory GETs strip `cost`+`supplier_id`; dashboard
  stats strip revenue for kitchen/staff only (cashier handles cash, keeps
  day revenue — intentional).
- The frontend must hide (not zero-render) the corresponding UI when fields
  are absent, or non-managers see misleading "0.000 cost / 100% margin".
- Regression coverage lives in tests/rbac-financial-visibility.test.js — add
  new financial columns there when introduced.
