---
name: Replit Auth OIDC add-on
description: How Replit OIDC sign-in coexists with the app's own JWT auth without weakening RBAC
---

Replit Auth is an ADDITIONAL web-only sign-in, not a replacement for email/password JWT.

**Rules:**
- No auto-account-creation: `/api/callback` matches an existing staff user by `users.replit_sub`, else by email — and the email fallback requires `claims.email_verified === true` (unverified email claim = account-takeover vector).
- Callback hostname must come from the `REPLIT_DOMAINS` allowlist (+`localhost` in dev), never trusted from the Host header — unknown host → 403.
- express-session (connect-pg-simple, `sessions` table) is used ONLY for the OAuth handshake (15 min TTL) and destroyed in the callback; ongoing auth stays on the app's own JWT cookies (`makeTokens`/`setAuthCookies` exported from routes/auth.js).
- Frontend button gated by `!API_BASE && !isNativePlatform() && !isDesktop()` — the redirect flow only works same-origin on the web build. App.jsx needs no change: its boot `/api/auth/me` check picks up the fresh cookies.
- `setupReplitAuth(app)` mounts routes synchronously (OIDC discovery is lazy/memoized) so `server/index.js` needs no top-level await; no-ops when `REPL_ID` unset.

**Why:** architect review flagged unverified-email linking and Host-header-derived callback URLs as RBAC bypass / callback-poisoning risks — both must stay guarded.
