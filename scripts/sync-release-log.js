/**
 * Sync the CHANGELOG.md release history into the Notion "📦 Release Log" database.
 *
 * Reads every released version from CHANGELOG.md (Version, Release Date, Type,
 * Summary) and upserts one row per version into the Release Log data source,
 * skipping versions that are already present. Re-running is idempotent: it adds
 * only the versions Notion is missing and never creates duplicates.
 *
 * Usage:
 *   node scripts/sync-release-log.js            # add all missing versions
 *   node scripts/sync-release-log.js --latest   # only the newest CHANGELOG entry
 *   node scripts/sync-release-log.js --version=v0.12.0
 *   node scripts/sync-release-log.js --dry-run  # report what would change, write nothing
 *
 * The Notion database id can be overridden with NOTION_RELEASE_LOG_DB.
 * Requires a Notion API key (settings table or NOTION_API_KEY env).
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { queryDatabase, notionFetch } from '../server/integrations/notion.js'
import { pool } from '../server/db.js'
import { writeReleaseLogMismatch, clearReleaseLogStatus } from '../server/lib/release-log-status.js'
// Pure CHANGELOG parsing lives in ./changelog.js so it can be imported by
// tooling that runs before `npm ci` (e.g. the CI version-sync check) without
// pulling in `pg` via server/db.js. Re-exported here for backward compatibility.
import {
  normalizeVersion,
  readPackageVersion,
  parseChangelog,
  classifyType,
  buildSummary,
  enrichEntries
} from './changelog.js'

export {
  normalizeVersion,
  readPackageVersion,
  parseChangelog,
  classifyType,
  buildSummary,
  enrichEntries
}

// REST database id for the "📦 Release Log" DB (Release Management page).
const RELEASE_LOG_DB = process.env.NOTION_RELEASE_LOG_DB || 'e81ed09fcd93453388b7fbe6577a604d'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md')

// ── Notion helpers ─────────────────────────────────────────────────────────

function getPageVersion(page) {
  const items = page?.properties?.Version?.title || []
  return items.map(t => t.plain_text || '').join('').trim()
}

async function fetchExistingVersions() {
  const pages = await queryDatabase(RELEASE_LOG_DB)
  return new Set(pages.map(getPageVersion).filter(Boolean))
}

async function createReleaseRow(entry) {
  const body = {
    parent: { database_id: RELEASE_LOG_DB },
    properties: {
      Version: { title: [{ text: { content: entry.version } }] },
      'Release Date': { date: { start: entry.date } },
      Summary: { rich_text: [{ text: { content: entry.summary } }] },
      Type: { select: { name: entry.type } },
      Status: { select: { name: 'Done' } }
    }
  }
  return notionFetch('/pages', 'POST', body)
}

// ── Main ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { dryRun: false, latest: false, version: null }
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--latest') args.latest = true
    else if (a.startsWith('--version=')) args.version = a.slice('--version='.length).trim()
  }
  return args
}

export async function syncReleaseLog({ dryRun = false, latest = false, version = null } = {}) {
  const text = await readFile(CHANGELOG_PATH, 'utf8')
  let entries = enrichEntries(parseChangelog(text))
  if (!entries.length) throw new Error('No released versions found in CHANGELOG.md')

  if (version) {
    const norm = normalizeVersion(version)
    entries = entries.filter(e => e.version === norm)
    if (!entries.length) throw new Error(`Version ${norm} not found in CHANGELOG.md`)
  } else if (latest) {
    // Guard against shipping a release whose CHANGELOG entry is out of date.
    // The post-merge automation fires --latest whenever package.json's version
    // changed; if CHANGELOG.md's newest entry doesn't match the shipped version,
    // pushing it would silently sync a stale/mismatched version to Notion.
    const pkgVersion = await readPackageVersion()
    const newest = entries[0]
    if (pkgVersion && newest.version !== pkgVersion) {
      return {
        dryRun,
        versionMismatch: true,
        packageVersion: pkgVersion,
        changelogVersion: newest.version,
        added: [],
        skipped: [],
        total: 0,
        entries: []
      }
    }
    entries = [newest]
  }

  const existing = await fetchExistingVersions()
  const toAdd = entries.filter(e => !existing.has(e.version))
  const skipped = entries.filter(e => existing.has(e.version))

  const added = []
  for (const entry of toAdd) {
    if (dryRun) {
      added.push(entry.version)
      continue
    }
    await createReleaseRow(entry)
    added.push(entry.version)
  }

  return {
    dryRun,
    added,
    skipped: skipped.map(e => e.version),
    total: entries.length,
    entries: toAdd.map(e => ({ version: e.version, date: e.date, type: e.type, summary: e.summary }))
  }
}

// Run only when invoked directly (not when imported by tests).
const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntryPoint) {
  const args = parseArgs(process.argv.slice(2))
  syncReleaseLog(args)
    .then(async result => {
      if (result.versionMismatch) {
        console.warn(
          `[release-log] WARNING: package.json is ${result.packageVersion} but the newest ` +
          `CHANGELOG.md entry is ${result.changelogVersion}. Skipping sync — add a ` +
          `CHANGELOG entry for ${result.packageVersion} before releasing.`
        )
        // Persist the mismatch so the admin System page can surface it (and a
        // banner appears) — merge/CI logs alone aren't routinely read.
        if (!result.dryRun) {
          await writeReleaseLogMismatch({
            packageVersion: result.packageVersion,
            changelogVersion: result.changelogVersion,
          }).catch(err => console.warn('[release-log] could not persist mismatch status:', err.message))
        }
        // Non-zero exit so the post-merge automation does NOT mark this version
        // as synced and re-attempts once the CHANGELOG is fixed. It stays
        // non-blocking because post-merge.sh tolerates a failed sync.
        process.exitCode = 1
        return
      }
      // A clean run means the CHANGELOG and package.json agree again — clear any
      // outstanding mismatch signal so the banner disappears automatically.
      if (!result.dryRun) {
        await clearReleaseLogStatus().catch(() => { /* best-effort */ })
      }
      if (result.dryRun) {
        console.log(`[release-log] DRY RUN — ${result.added.length} version(s) would be added:`)
      } else {
        console.log(`[release-log] Added ${result.added.length} version(s) to Notion Release Log:`)
      }
      for (const e of result.entries) {
        console.log(`  + ${e.version} (${e.type}, ${e.date}) — ${e.summary}`)
      }
      if (result.skipped.length) {
        console.log(`[release-log] Skipped ${result.skipped.length} already present: ${result.skipped.join(', ')}`)
      }
      if (!result.entries.length && !result.dryRun) {
        console.log('[release-log] Nothing to add — Notion is already up to date.')
      }
    })
    .catch(err => {
      console.error('[release-log] Sync failed:', err.message)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
