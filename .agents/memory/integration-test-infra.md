---
name: Integration test infra
description: How API integration tests run against the dev DB safely
---

`server/index.js` exports `{ app, server }` and only boots (initDb + migrations +
listen) when it is the process entry point (`isEntryPoint` check). This lets
tests import `app` without starting the HTTP listener.

Integration tests (`tests/integration.test.js`) use `supertest` against `app`,
run against the **dev** DATABASE_URL, and are self-contained: every row is
tagged with a unique `itest_<timestamp>` and removed in `afterAll` (which also
calls `pool.end()`). Auth uses seeded users with `must_change_password=false`
and `request.agent(app)` to persist the login cookie (Bearer also works).

**Why:** there's no separate test DB; self-cleaning tagged rows keep the dev DB
clean. The auth rate limiter means you should log in once per user and reuse the
agent, not re-login per request.

**Gotchas when POSTing through Joi-validated routes in tests:**
- `Joi.string().email()` validates real TLDs, so `@test.local` is rejected (400).
  Seed rows via direct SQL if you want `.local`, but any request going through a
  create schema (e.g. `POST /api/users`) must use a routable TLD like
  `@example.com`.
- When a test mutates a shared `settings` key (e.g. `openai_api_key` via
  `PUT /api/integrations/:service/config`), capture the original value in
  `beforeAll` and restore it in `afterAll`. A blanket DELETE would wipe real dev
  integration config since env-vs-DB precedence means the row may already exist.
- Admin-created users default to `must_change_password=true` (set in the users
  POST route, not the DB default which is false).
