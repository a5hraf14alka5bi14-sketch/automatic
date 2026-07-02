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
