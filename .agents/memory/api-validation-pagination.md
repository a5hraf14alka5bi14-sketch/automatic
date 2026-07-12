---
name: API validation & pagination conventions
description: How input validation and list pagination are done across Express routes
---

# API validation & pagination conventions

**Validation:** Joi schemas live in `server/validators.js`; applied via the
`validate(schema, source='body')` middleware factory (`server/middleware/validate.js`).

- The middleware uses `allowUnknown:true` (does NOT strip unknowns) and `convert:true`,
  and reassigns the coerced value back to `req[source]`. So string numbers in a body get
  coerced to numbers before the handler runs.
- **Why allowUnknown, not stripUnknown:** handlers destructure known fields; stripping
  could silently drop a field a route reads. Every field a route reads must be declared in
  its schema anyway (for constraints), but leaving unknowns intact avoids surprise breakage.
- When adding a new POST/PATCH, add the schema + wire `validate(...)` as route middleware;
  remove the old inline `if (!x) return 400` checks (Joi `.required()` replaces them).

**Pagination (backward-compatible pattern):** GET list endpoints (`menu/all`, `customers`,
`inventory`) accept optional `?limit` & `?offset`.
- No params → return the full array (unchanged legacy behavior).
- Always set `X-Total-Count` header with the unpaginated count.
- `limit`/`offset` are parsed to ints and clamped (limit 0–500, offset ≥0); values are passed
  as parameterized `$n` — never interpolated — so the dynamic clause stays injection-safe.
- Response body stays a plain array (not `{data,total}`), so existing frontend consumers
  don't break.

**Note:** `node --watch` reloads on save, but adding a brand-new imported module
(e.g. a new middleware/validators file) can need a full workflow restart; if restart hits
`EADDRINUSE :3001`, kill the stale listener (`fuser -k 3001/tcp`) then restart.
