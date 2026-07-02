---
name: Auth token flow
description: Durable decisions about how auth/session tokens are stored and validated.
---

## Rule
Auth uses httpOnly cookies for the JWT access + refresh tokens — never localStorage for the token itself. localStorage may hold only a non-sensitive user profile cache (id/name/email/role) for instant UI render.

**Why:** localStorage tokens are readable by any injected script (XSS); httpOnly cookies are not JS-accessible.

**How to apply:** Cookies are set/cleared server-side (login/refresh/logout). `verifyToken` reads the cookie first, Authorization header as fallback. Frontend requests must send `credentials:'include'`. Requires `cookie-parser` mounted before routes.

## Secret handling
JWT secret lives in one shared module (`server/config/secret.js`) — never duplicate a hardcoded fallback across files. Fail-fast when `SESSION_SECRET` is missing in production; dev-only fallback with a warning.

**Why:** duplicated fallback secrets are easy to leave in and hard to rotate.

## CORS + WebSocket
Credentialed CORS must not reflect arbitrary origins in production — fail-fast unless `ALLOWED_ORIGIN` is set. The `/ws` WebSocket authenticates on upgrade by verifying the access-token cookie (same-origin handshakes send it automatically); no separate token plumbing needed on the client.

## Error exposure
A global Express error handler returns a generic message and logs details server-side; route handlers forward errors via `next(err)`. Never leak stack traces / internal messages to clients.

## Password policy (server-enforced)
min 8 chars · ≥1 uppercase · ≥1 lowercase · ≥1 digit. The auth router mounts before the global `verifyToken`, so authed auth-routes (e.g. change password, /me) must apply `verifyToken` inline.
