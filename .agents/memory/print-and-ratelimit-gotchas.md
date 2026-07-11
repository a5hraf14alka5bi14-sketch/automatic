---
name: Print pagination & auth rate-limit scoping
description: Two non-obvious production gotchas — printing position:fixed clips to page 1, and a strict login limiter mounted on the whole /api/auth prefix locks users out.
---

## Printing a receipt/document: never position:fixed (or absolute)
Browsers clip `position: fixed` / `position: absolute` elements to the FIRST
printed page, so a long receipt prints cut off after page 1.

**How to apply:** for any printable overlay, render the print target through
`createPortal(node, document.body)` so it is a top-level sibling of `#root`,
and in `@media print` do:
`body > *:not(#print-target){display:none}` + target `position:static; display:block`.
Normal document flow paginates across as many pages as needed. (ReceiptModal.jsx)

## Strict login limiter must be scoped to the login route only
Mounting the strict auth limiter on the whole `/api/auth` prefix
(`app.use('/api/auth', authLimiter, authRoutes)`) makes routine `/api/auth/me`
401s on app load consume the login-attempt budget, locking legitimate users out
of the DEPLOYED app with "Too many login attempts."

**How to apply:** mount `generalLimiter` on `/api` first, then the strict
limiter ONLY on `/api/auth/login`, then the auth router. Use
`skipSuccessfulRequests:true` so only FAILED logins count toward the cap.
**Why:** keeps brute-force protection on the real guessing endpoint without
penalizing normal session traffic (`/me`, `/refresh`).
