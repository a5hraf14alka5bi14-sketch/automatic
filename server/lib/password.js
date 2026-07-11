import bcrypt from 'bcryptjs'
import { argon2id, argon2Verify } from 'hash-wasm'
import { randomBytes } from 'node:crypto'

// Argon2id is the modern, memory-hard password KDF recommended by OWASP. We use
// the pure-WASM `hash-wasm` implementation (no native compilation) so it runs
// identically on Replit (Linux), in the deployed container, and in CI.
//
// Parameters are OWASP-aligned (Password Storage Cheat Sheet):
//   memory 19 MiB, 3 iterations, parallelism 1.
// These give strong resistance to GPU/ASIC cracking while keeping per-login
// cost low enough for an interactive request.
export const ARGON2_PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 19456, // KiB (19 MiB)
  hashLength: 32,
}

// Legacy bcrypt hashes start with $2a$/$2b$/$2y$. Argon2id encoded hashes start
// with $argon2id$. We keep bcryptjs purely to VERIFY legacy hashes so existing
// accounts keep working; nothing new is ever hashed with bcrypt.
function isArgon2(hash) {
  return typeof hash === 'string' && hash.startsWith('$argon2')
}

function isBcrypt(hash) {
  return typeof hash === 'string' && /^\$2[aby]\$/.test(hash)
}

// Produce an Argon2id encoded hash string for a new/rotated password.
export async function hashPassword(plain) {
  return argon2id({
    password: plain,
    salt: randomBytes(16),
    ...ARGON2_PARAMS,
    outputType: 'encoded',
  })
}

// Verify a plaintext password against a stored hash of EITHER algorithm.
// Returns false (never throws) on malformed/unknown hashes.
export async function verifyPassword(plain, stored) {
  try {
    if (isArgon2(stored)) {
      return await argon2Verify({ password: plain, hash: stored })
    }
    if (isBcrypt(stored)) {
      return await bcrypt.compare(plain, stored)
    }
    return false
  } catch {
    return false
  }
}

// True when a stored hash should be transparently re-hashed to the current
// Argon2id parameters after a successful verify:
//   - any legacy bcrypt hash (wrong algorithm), or
//   - an Argon2id hash whose memory/iterations are below the current target.
export function needsRehash(stored) {
  if (isArgon2(stored)) {
    const m = /\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(stored)
    if (!m) return true
    const [, mem, iters] = m
    return Number(mem) < ARGON2_PARAMS.memorySize || Number(iters) < ARGON2_PARAMS.iterations
  }
  // bcrypt (or anything non-argon2) → upgrade to argon2id.
  return true
}
