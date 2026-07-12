// Persisted status of the automated post-merge Release Log sync.
//
// When a release ships whose package.json version doesn't match CHANGELOG.md's
// newest entry, the sync (scripts/sync-release-log.js) skips itself and records
// the mismatch here. The admin System page reads this via GET
// /api/admin/release-log-status and shows a banner, so a forgotten changelog
// entry is visible where the team already looks — not just in merge/CI logs.
//
// The signal clears automatically: the next successful sync (once the CHANGELOG
// is fixed) removes the file, and the banner disappears.
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Lives alongside .local/.release-log-synced-version (the sync-state marker the
// post-merge automation already persists), so it survives across merges.
const STATUS_PATH = path.join(__dirname, '..', '..', '.local', '.release-log-status.json')

export { STATUS_PATH }

// Returns the mismatch payload when a sync is currently skipped, otherwise null.
export async function readReleaseLogStatus() {
  try {
    const raw = await readFile(STATUS_PATH, 'utf8')
    const data = JSON.parse(raw)
    return data && data.versionMismatch ? data : null
  } catch {
    // Missing/unreadable/corrupt file = no outstanding mismatch.
    return null
  }
}

// Record that the sync was skipped because the versions don't match.
export async function writeReleaseLogMismatch({ packageVersion, changelogVersion }) {
  const status = {
    versionMismatch: true,
    packageVersion,
    changelogVersion,
    detectedAt: new Date().toISOString(),
  }
  await mkdir(path.dirname(STATUS_PATH), { recursive: true })
  await writeFile(STATUS_PATH, JSON.stringify(status, null, 2))
  return status
}

// Clear the outstanding mismatch (called after a successful sync).
export async function clearReleaseLogStatus() {
  try {
    await rm(STATUS_PATH)
  } catch {
    // Already absent — nothing to clear.
  }
}
