---
name: RBAC guards vs. role-open pages
description: Endpoints consumed by role-open pages (like /pos) must not be locked to admin/manager, or the feature silently breaks for the very roles that use it.
---

# RBAC guards must match the page's audience

When adding `requireRole(...)` guards in a security-hardening pass, check **which
frontend pages call the endpoint** before restricting it. A GET endpoint can be
"data that looks management-only" yet be a hard dependency of an unrestricted page.

**Concrete case:** `GET /api/menu/stock-availability` feeds the POS stock-warning
UI. `/pos` is open to every authenticated role (no `RequireRole` in `App.jsx`), so
cashier/staff must be able to read it. A hardening task locked it to admin/manager,
which returned 403 for cashiers and **silently emptied `stockAvail`** (POS catches
the error and sets `{}`), disabling stock warnings for the primary POS users with
no visible error. Fix: leave it readable by any authenticated role (it exposes only
per-dish sellable counts, no prices/costs).

**Why:** frontend fetch failures often degrade silently (empty state), so an
over-restrictive guard produces a feature that looks fine but never warns.

**How to apply:** before guarding a GET route, grep the frontend for its path and
confirm every page that calls it is itself role-gated to the same (or narrower) set.
If a role-open page depends on it, keep it authenticated-only, not role-restricted.
Regression tests that assert 403 for such endpoints are encoding the bug — update
them to assert the corrected access.

**Related:** stock warnings also went stale after the first sale because
`refreshLowStock()` (sidebar badge) never refetched `stockAvail`. Any stock-mutating
POS flow (payment completion, table order complete/cancel) must call a dedicated
`refreshStockAvail()` to keep max-sellable counts current.
