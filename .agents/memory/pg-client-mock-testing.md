---
name: Mocking pg pool clients in tests
description: How to simulate mid-transaction DB failures via pool.connect without breaking the shared pool
---
# Simulating mid-transaction DB failures in supertest/vitest

To test transactional rollback, spy on `pool.connect` and wrap the checked-out
client's `query` to reject on a matched SQL string.

**Pitfalls (both bit us):**
- `pool.connect` is ALSO called internally by `pool.query(cb-style)` — the mock
  must pass callback invocations straight through (`if (cb) return origConnect(cb)`).
- Overriding `client.query` on the client instance POISONS the pooled client:
  it returns to the pool still wrapped, so later checkouts (even after
  `vi.restoreAllMocks()`) hit the fake failure and tests hang/timeout with
  confusing 5s timeouts. Fix: also wrap `client.release` to
  `delete client.query; delete client.release` before releasing.

**Why:** pg pool reuses client objects; instance-level monkey-patches outlive
the test that made them.

**How to apply:** see `tests/shift-close-transaction.test.js` (`failOn()` helper)
whenever a new transactional route needs a rollback regression test.
