---
name: Route authorization convention
description: Where role guards are required beyond global verifyToken
---
`app.use(verifyToken)` is applied globally in server/index.js, so every /api route requires a valid session — but it does NOT enforce role.

**Rule:** Any route that mutates config/secrets, triggers external sync/push, or makes paid third-party (OpenAI) calls must carry an explicit `requireRole('admin','manager')` guard. Admin-only user management uses `requireRole('admin')`. Read-only GET status/list endpoints may stay open to all authenticated roles.

**Why:** Integration config/sync/push and AI insight routes originally had only global verifyToken, letting any logged-in role (e.g. cashier) write API secrets, trigger syncs, and run paid OpenAI calls — a privilege-escalation + cost-abuse gap.

**How to apply:** When adding a new route under /api/integrations or /api/ai (or any mutation), add the requireRole middleware in the route definition, matching the existing pattern in menu.js/inventory.js/settings.js.
