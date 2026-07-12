---
name: Native app packaging (Capacitor + Electron)
description: How the web frontend is reused as iOS/Android/Windows native apps without duplicating business logic
---

The same built `dist/` powers web, iOS, Android, and Windows — no business-logic duplication. The shells are thin loaders.

**URL resolution is the linchpin:** `src/config.js` reads `import.meta.env.VITE_API_BASE_URL` at build time. Unset → API/WS calls stay **relative** (web, served same-origin as the API). Set → calls become **absolute** to the deployed backend (native shells are NOT same-origin). Always build native bundles with `VITE_API_BASE_URL="https://…deployed…" npm run build`. Helpers: `apiUrl()`, `wsUrl()`, `isNativePlatform()`, `isDesktop()`, `notifyDesktop()`.

**Capacitor pinned to v7, not v8.** **Why:** Capacitor 8 requires Node ≥ 22; this env runs Node 20. If Node is upgraded to 22+, v8 becomes an option.

**Cross-origin auth (IMPLEMENTED — bearer for native).** Web stays cookie-only (httpOnly, `credentials:'include'`, nothing in JS storage). Native shells (both Capacitor AND Electron — gate on `isNativePlatform() || isDesktop()`) can't send those cross-origin cookies, so they use bearer tokens: auth endpoints (login/refresh/PATCH password) ALSO return `token`+`refresh_token` in the JSON body (additive); native stores them (`src/utils/authToken.js`), sends `Authorization: Bearer`, refreshes via body `refresh_token`, and WS auth is `?token=` query param (browser WS API can't set headers; server rejects refresh-type tokens). **Why:** native origin != API origin. **Gotcha:** forced-password-change — the old access token carries `mustChange=true`, so native MUST store the rotated tokens returned by PATCH /password or it stays locked out.

**Build boundary:** Replit (Linux) cannot compile iOS/.exe or submit to stores. `android/`+`ios/` source projects are committed; build outputs + `release/` are git-ignored. See `NATIVE_BUILD.md` for per-platform steps.
