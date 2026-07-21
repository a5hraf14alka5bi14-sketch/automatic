/**
 * CI helper: creates (or resets) the E2E test admin user in the test database.
 * Run before Playwright E2E tests in GitHub Actions.
 *
 * Usage: node scripts/ci-create-e2e-admin.js
 * Env:   DATABASE_URL, SESSION_SECRET (both already set in the CI workflow)
 */

import { pool }         from '../server/db.js'
import { hashPassword } from '../server/lib/password.js'

const EMAIL    = process.env.TEST_EMAIL    || 'admin@restaurant.com'
const PASSWORD = process.env.TEST_PASSWORD || 'admin123'

try {
  const hash = await hashPassword(PASSWORD)
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, must_change_password)
     VALUES ('CI Admin', $1, $2, 'admin', FALSE)
     ON CONFLICT (email) DO UPDATE
       SET password_hash       = EXCLUDED.password_hash,
           role                = 'admin',
           must_change_password = FALSE`,
    [EMAIL, hash]
  )
  console.log(`[ci-e2e] admin ready → ${EMAIL}`)
  await pool.end()
} catch (err) {
  console.error('[ci-e2e] failed:', err.message)
  process.exit(1)
}
