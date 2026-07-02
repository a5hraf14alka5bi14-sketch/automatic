---
name: Force default-admin password change
description: How the app forces a password change on first login
---

`users.must_change_password` BOOLEAN gates access. Seeded admin is created with it `true`; the app blocks everything until the password is changed.

- login (`POST /api/auth/login`) and `GET /api/auth/me` return `must_change_password`.
- `PATCH /api/auth/password` sets it back to `false`.
- Frontend: `src/App.jsx` renders a full-screen `ForcePasswordChange` (wrapping `ChangePassword` in `forced` mode) whenever `user.must_change_password` is truthy — before the router/app layout mounts.

**Why:** the default seeded admin password must not remain usable in production.

**How to apply:** any new user you want to force through onboarding — insert with `must_change_password=true`.
