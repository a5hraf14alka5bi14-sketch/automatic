---
name: Express 5 + Tailwind 4 upgrade pitfalls
description: The two breaking changes that actually bit us when upgrading Express 4->5 and Tailwind 3->4
---

# Express 5 + Tailwind 4 upgrade

## Express 4 -> 5
The one breaking change that hit this app: a bare wildcard route
`app.get('*', ...)` for the SPA fallback throws under Express 5 (path-to-regexp v8
rejects bare `*`). Replace it with a plain middleware that serves the built
`index.html` for non-`/api` GET requests. Everything else in this codebase was
compatible (the Joi `validate()` middleware does not reassign `req.query`, which is
the other common v5 breakage — `req.query` is a getter-only in v5).

## Tailwind 3 -> 4
- PostCSS plugin moved: install `@tailwindcss/postcss`, set it as the plugin in
  `postcss.config.js`, and remove `autoprefixer` (Tailwind 4 handles it).
- `src/index.css` uses `@import "tailwindcss";` (not the old three `@tailwind`
  directives) plus `@config "../tailwind.config.js";` to keep the existing JS config.
- **Border color default changed:** v4 defaults `border-*` to `currentColor` instead
  of gray-200. Bare `border` classes render a different color. Added a small compat
  layer in `index.css` to restore the v3 default so existing borders don't shift.

**Why it matters:** these two (SPA wildcard, border-color default) are the only
changes that produce visible breakage; the rest of both upgrades was drop-in here.
