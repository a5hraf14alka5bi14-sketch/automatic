---
name: Password hashing (Argon2id migration)
description: Why/how password hashing uses Argon2id with transparent bcrypt migration
---

# Password hashing — Argon2id with transparent bcrypt migration

All password hashing goes through `server/lib/password.js`:
`hashPassword` / `verifyPassword` / `needsRehash`. Never hash directly with
bcrypt anywhere else.

- **Algorithm:** Argon2id via **`hash-wasm`** (pure WASM). **Why hash-wasm and
  not `argon2`/`@node-rs/argon2`:** those are native modules needing compilation;
  hash-wasm runs identically on Replit/Linux, the deployed container, and CI with
  zero build step. Params are OWASP-aligned: m=19456 KiB, t=3, p=1.
- **`bcryptjs` is retained ONLY to verify legacy hashes.** `verifyPassword`
  detects the algorithm by prefix (`$argon2` vs `$2[aby]$`), verifies against the
  right one, and returns `false` (never throws) on malformed input.
- **Safe migration = transparent rehash on login.** You CANNOT strengthen a hash
  at rest without the plaintext (that's fundamental), so the only real strategy is
  lazy: after a successful login, if `needsRehash()` is true (legacy bcrypt, or a
  weaker Argon2id profile), re-hash to current Argon2id and persist via a
  compare-and-set `UPDATE … WHERE id=$ AND password=$oldHash` so a concurrent
  password change is never clobbered. No password reset needed.
- **Gotcha for tests:** many test helpers seed users with `bcrypt.hash(pw, 10)` —
  that's intentional (exercises the legacy→argon2id path). The login-upgrade
  regression test asserts the stored hash starts with `$argon2id$` afterwards.
- Argon2id is memory-hard, so the full vitest run is noticeably slower and heavier
  than under bcrypt — expect ~45-50s and don't set aggressive suite timeouts.
