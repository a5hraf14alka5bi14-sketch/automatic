// Release Log sync status persistence — the signal the admin System page reads
// to surface a skipped post-merge sync (and that clears once the sync succeeds).
import { describe, it, expect, afterEach } from 'vitest'
import { rm } from 'node:fs/promises'
import {
  STATUS_PATH,
  readReleaseLogStatus,
  writeReleaseLogMismatch,
  clearReleaseLogStatus,
} from '../server/lib/release-log-status.js'

afterEach(async () => {
  await rm(STATUS_PATH, { force: true }).catch(() => {})
})

describe('release-log-status', () => {
  it('returns null when no mismatch has been recorded', async () => {
    await clearReleaseLogStatus()
    expect(await readReleaseLogStatus()).toBeNull()
  })

  it('persists a mismatch and reads it back', async () => {
    const written = await writeReleaseLogMismatch({
      packageVersion: 'v0.13.0',
      changelogVersion: 'v0.12.0',
    })
    expect(written).toMatchObject({
      versionMismatch: true,
      packageVersion: 'v0.13.0',
      changelogVersion: 'v0.12.0',
    })
    expect(written.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const read = await readReleaseLogStatus()
    expect(read).toMatchObject({
      versionMismatch: true,
      packageVersion: 'v0.13.0',
      changelogVersion: 'v0.12.0',
    })
  })

  it('clears the signal so the banner disappears automatically', async () => {
    await writeReleaseLogMismatch({ packageVersion: 'v0.13.0', changelogVersion: 'v0.12.0' })
    expect(await readReleaseLogStatus()).not.toBeNull()

    await clearReleaseLogStatus()
    expect(await readReleaseLogStatus()).toBeNull()
  })

  it('clearing an already-absent signal is a no-op (no throw)', async () => {
    await clearReleaseLogStatus()
    await expect(clearReleaseLogStatus()).resolves.toBeUndefined()
  })
})
