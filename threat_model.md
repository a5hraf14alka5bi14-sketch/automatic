# Threat Model

## Project Overview

Automatic Restaurant OS is a full-stack restaurant management system with a React/Vite frontend, an Express 5 backend, and PostgreSQL storage. It serves authenticated restaurant staff across multiple roles (`admin`, `manager`, `cashier`, `kitchen`, `staff`) and integrates with GitHub, Notion, and OpenAI through server-side API clients. In production, the built frontend, API, and WebSocket endpoint are served from a single origin on the Express server.

Production scope assumptions for this scan:
- Only production-reachable code is in scope.
- Mock/dev-only experiments are out of scope unless production reachability is demonstrated.
- Replit provides TLS for browser-to-server traffic, but server-to-database and server-to-third-party trust boundaries still matter.
- This repl is not currently deployed, so public internet reachability is assessed from the code paths rather than live exposure.

## Assets

- **User accounts and sessions** — JWT-backed session cookies, refresh tokens, role assignments, and TOTP secrets. Compromise enables impersonation and privilege escalation.
- **Customer data** — names, email addresses, phone numbers, addresses, notes, loyalty balances, and order history. This is business-sensitive personal data that must be restricted by role.
- **Operational business data** — orders, payments, discounts, stock levels, suppliers, reports, audit trails, and backups. Tampering here directly affects revenue, inventory accuracy, and financial reporting.
- **Application secrets** — `SESSION_SECRET`, database credentials, and third-party API keys for GitHub, Notion, OpenAI, and Sentry. Leakage can lead to full service compromise or third-party account abuse.
- **Administrative control plane** — system health, audit logs, backup/download/restore flows, integration configuration, and user/role management. Unauthorized access would provide broad control over the deployment and stored data.

## Trust Boundaries

- **Browser to API** — all client input is untrusted, even from authenticated staff. The server must recompute security-sensitive values and enforce authorization on every endpoint.
- **API to PostgreSQL** — the backend has broad database access. Injection or unsafe restore flows would have full impact on application data.
- **API to external services** — Notion, GitHub, OpenAI, and Sentry calls cross a high-trust boundary using stored secrets.
- **Authenticated to privileged staff** — `cashier`, `kitchen`, and `staff` should not automatically inherit `manager` or `admin` visibility. Role boundaries must be enforced on the backend, not only in React.
- **Runtime to backup artifacts** — backup download and restore endpoints cross into full-database export/import and therefore have extremely high impact if mis-scoped.

## Scan Anchors

- **Production entry points:** `server/index.js`, `server/events.js`, `src/App.jsx`
- **Highest-risk code areas:** `server/routes/auth.js`, `server/routes/orders.js`, `server/routes/admin.js`, `server/routes/integrations.js`, `server/routes/users.js`, `server/db.js`
- **Public surface:** `/api/health`, static asset + SPA routes, `/api/auth/*` login/refresh/logout
- **Authenticated surface:** most `/api/*` routes after global `verifyToken`; many non-management pages are reachable by any authenticated role
- **Admin/manager surface:** integrations, reports, settings, suppliers, admin operational endpoints
- **Usually dev-only / lower-priority areas:** `dist/`, backups on disk, docs, tests, attached assets

## Threat Categories

### Spoofing

The application relies on signed JWT cookies and optional TOTP for staff authentication. Session tokens must be signed with a strong production secret, refresh tokens must only mint valid sessions for existing users, and predictable/bootstrap credentials must never remain usable in a production deployment.

### Tampering

Restaurant staff can create orders, update order states, edit inventory, and manage menu data. The server must treat all client-supplied monetary values, discounts, quantities, and workflow state transitions as untrusted and recompute authoritative values from database records before persisting them.

### Information Disclosure

Customer records, loyalty balances, addresses, notes, audit logs, backups, and integration secrets are all sensitive. Backend routes must return only the minimum data each role needs, and operational or third-party secrets must never appear in logs, browser responses, or overly broad management endpoints.

### Denial of Service

The application exposes stateful APIs, backup/restore flows, WebSockets, and third-party sync actions. Expensive operations must be role-restricted, body-size-limited, and protected from abuse so a low-privilege user cannot exhaust compute, database, or external API quotas.

### Elevation of Privilege

The most important privilege boundary is between ordinary staff and management/admin functions. Backend role checks must prevent lower-privilege users from accessing customer PII, management reports, integration controls, administrative backup functions, or any mutation path that effectively grants financial or operational control beyond their role.