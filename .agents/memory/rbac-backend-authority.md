---
name: RBAC backend authority + password-change enforcement
description: Where server-side role checks and forced-password-change enforcement live
---

Frontend route guards (ROUTE_ROLES in src/utils/auth.js, RequireRole in App.jsx, Sidebar nav filter) are UX only — the backend is the authority.

- `verifyToken` is applied globally in server/index.js BEFORE all `/api/*` routers except `/api/auth` (which is mounted earlier so login/logout/refresh/me/password stay reachable).
- Management routers are guarded at router level with `router.use(requireRole('admin','manager'))`: reports, notion, integrations. Menu/inventory/customers use their own finer-grained guards (see role-based-access.md).
- **Forced password change is enforced server-side**, not just in the UI: the access JWT carries a `mustChange` claim; `enforcePasswordChange` middleware (after verifyToken in index.js) returns 403 `{mustChangePassword:true}` on every protected route while the claim is set. login/refresh set the claim from `users.must_change_password`; PATCH /api/auth/password clears the flag AND re-issues cookies with `mustChange:false`.

**Why:** frontend-only guards are trivially bypassed via direct HTTP; a default-admin who never changes the password could otherwise call any API with a valid token.

**How to apply:** any new management page → add `requireRole` on its router, don't rely on the frontend guard. If you add a route that a mustChange user legitimately needs, it must be under `/api/auth` (before verifyToken) or it will be blocked.
