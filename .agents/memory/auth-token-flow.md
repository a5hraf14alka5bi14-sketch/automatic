---
name: Auth token flow
description: How JWT access/refresh tokens are stored, used, and renewed in the frontend and backend.
---

## Rule
localStorage stores `auth_user` as JSON: `{id, name, email, role, token, refresh_token}`. Access token expires in 2h; refresh token expires in 30d.

## Backend (server/routes/auth.js)
- `POST /api/auth/login` → returns `{token, refresh_token, user}`
- `POST /api/auth/refresh` → body `{refresh_token}`, validates JWT type:'refresh', returns new `{token, refresh_token}`
- `PATCH /api/auth/password` → requires `verifyToken` middleware imported directly (auth router is before global verifyToken middleware in index.js)

## Frontend (src/utils/api.js)
- `apiFetch` adds `Authorization: Bearer <token>` header
- On 401: calls `tryRefresh()` which POSTs to `/api/auth/refresh` with stored refresh token
- If refresh succeeds: updates localStorage token, retries original request
- If refresh fails: clears localStorage, reloads page
- `refreshPromise` singleton prevents concurrent refresh races

## Password policy (enforced server-side)
min 8 chars · at least one uppercase · at least one lowercase · at least one digit

## Demo credentials
`admin@automatic.com` / `Admin123` (meets policy; was changed from admin123 when policy was introduced)

**Why:** Auth routes mount BEFORE global `verifyToken` middleware, so PATCH /password must import and apply verifyToken directly.
