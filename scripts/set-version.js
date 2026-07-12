/**
 * Set the project version in every place it is declared, in one command.
 *
 * The same version string is duplicated by hand across several files on each
 * release (package.json, CHANGELOG.md, README.md, replit.md). Editing each one
 * manually is error-prone and is exactly the drift that
 * `scripts/check-version-sync.js` exists to police. This script rewrites them
 * all at once so `npm run check:version` passes immediately afterward.
 *
 * Locations updated (mirrors check-version-sync.js's sources of truth):
 *   - package.json   "version" field
 *   - CHANGELOG.md   newest released "## [vX.Y.Z]" entry (a stub entry is added
 *                    when the version is new; historical entries are untouched)
 *   - README.md      the Version badge + "Current Version" header
 *   - replit.md      the "Current Version:" header + Release table row
 *
 * Safe to re-run: each edit is idempotent and re-running with the same version
 * is a no-op. Running with a new version adds a fresh CHANGELOG heading above
 * the existing history without modifying older entries.
 *
 * Usage:
 *   node scripts/set-version.js v0.13.0
 *   node scripts/set-version.js 0.13.0
 *   npm run release:set-version -- v0.13.0
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseChangelog } from './changelog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

// Parse "v0.13.0" / "0.13.0" into its parts, or null when malformed.
export function parseVersion(input) {
  if (!input) return null
  const m = String(input).trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return null
  const [, major, minor, patch] = m
  return {
    bare: `${major}.${minor}.${patch}`, // package.json stores no "v" prefix
    v: `v${major}.${minor}.${patch}`
  }
}

// Replace exactly one occurrence matched by `re`, keeping the captured prefix
// ($1) and swapping only the version digits for `bare`. Throws when the
// expected location is missing so drift can never be introduced silently.
function replaceOne(text, re, bare, label) {
  let hits = 0
  const out = text.replace(re, (_m, prefix) => {
    hits += 1
    return `${prefix}${bare}`
  })
  if (hits === 0) throw new Error(`Could not find version location: ${label}`)
  if (hits > 1) throw new Error(`Expected 1 match but found ${hits}: ${label}`)
  return out
}

// Insert a stub CHANGELOG entry for `ver` above the newest existing release, or
// leave the file untouched when an entry for that version already exists.
// Returns { text, added }.
export function ensureChangelogEntry(text, ver) {
  const existing = new RegExp(`^##\\s*\\[${ver.v.replace(/\./g, '\\.')}\\]`, 'm')
  if (existing.test(text)) return { text, added: false }

  const firstHeading = text.match(/^##\s*\[v\d+\.\d+\.\d+\]/m)
  if (!firstHeading) throw new Error('Could not find any release heading in CHANGELOG.md')

  const date = new Date().toISOString().slice(0, 10)
  const stub =
    `## [${ver.v}] — ${date} — Release ${ver.v}\n\n` +
    `### Changed\n` +
    `- Version bumped to ${ver.v}.\n\n` +
    `---\n\n`

  const idx = firstHeading.index
  const updated = text.slice(0, idx) + stub + text.slice(idx)
  return { text: updated, added: true }
}

// Guard: the release must not ship without its changelog entry sitting at the
// top of CHANGELOG.md. Reuses sync-release-log.js's parseChangelog (the same
// parser the Notion Release Log sync and check-version-sync.js run on) so the
// pre-bump check and the post-merge checks can never disagree about what the
// "newest entry" is. Throws when the newest parsed entry isn't `ver`, e.g. the
// version exists only as an older/mis-ordered heading, or the entry was added
// in a format parseChangelog can't read (wrong dash, missing date, etc.).
export function assertNewestChangelogEntry(changelogText, ver) {
  const entries = parseChangelog(changelogText)
  if (!entries.length) {
    throw new Error(
      'CHANGELOG.md has no parseable release entry — expected a heading like ' +
        `"## [${ver.v}] — YYYY-MM-DD — Title" for the new version`
    )
  }
  if (entries[0].version !== ver.v) {
    throw new Error(
      `CHANGELOG.md's newest entry is ${entries[0].version}, not ${ver.v} — ` +
        `the ${ver.v} release would ship without its changelog entry. ` +
        `Add "## [${ver.v}] — YYYY-MM-DD — Title" above ${entries[0].version} before bumping.`
    )
  }
}

// Pure: rewrite the version in all four raw file contents and return the new
// contents plus whether a CHANGELOG stub was added. Throws (via replaceOne /
// ensureChangelogEntry) when any expected location is missing, so a reformat
// that breaks a regex fails loudly instead of silently dropping a location.
// Kept separate from file I/O so it can be exercised directly in tests.
export function applyVersion({ pkgRaw, changelogRaw, readmeRaw, replitRaw }, ver) {
  // package.json — "version": "0.13.0"
  const pkg = replaceOne(
    pkgRaw,
    /("version"\s*:\s*")\d+\.\d+\.\d+(?=")/,
    ver.bare,
    'package.json ("version")'
  )

  // CHANGELOG.md — add a stub entry when the version is new, then verify the
  // newest parseable entry really is the version being released. This is the
  // pre-bump release gate: a mis-ordered or unparseable entry aborts the bump
  // here (nothing is written) instead of surfacing after the merge.
  const { text: changelog, added: changelogAdded } = ensureChangelogEntry(changelogRaw, ver)
  assertNewestChangelogEntry(changelog, ver)

  // README.md — Version badge + "Current Version" header.
  let readme = replaceOne(
    readmeRaw,
    /(Version-v)\d+\.\d+\.\d+(?=-)/,
    ver.bare,
    'README.md (Version badge)'
  )
  readme = replaceOne(
    readme,
    /(Current Version\s*[—–-]\s*v)\d+\.\d+\.\d+/i,
    ver.bare,
    'README.md (Current Version header)'
  )

  // replit.md — "Current Version:" header + Release table row.
  let replit = replaceOne(
    replitRaw,
    /(Current Version:\s*v)\d+\.\d+\.\d+/i,
    ver.bare,
    'replit.md (Current Version header)'
  )
  replit = replaceOne(
    replit,
    /(\*\*Release\*\*\s*\|\s*v)\d+\.\d+\.\d+/i,
    ver.bare,
    'replit.md (Release table row)'
  )

  return { pkg, changelog, readme, replit, changelogAdded }
}

// Read the four files from `dir`, rewrite the version, and write them back.
// Returns { ver, changelogAdded }. Throws on a malformed version or a missing
// location so callers (and tests) can assert the failure.
export async function setVersion(dir, arg) {
  const ver = parseVersion(arg)
  if (!ver) {
    throw new Error('Usage: node scripts/set-version.js <version>   e.g. v0.13.0')
  }

  const files = {
    pkg: path.join(dir, 'package.json'),
    changelog: path.join(dir, 'CHANGELOG.md'),
    readme: path.join(dir, 'README.md'),
    replit: path.join(dir, 'replit.md')
  }

  const [pkgRaw, changelogRaw, readmeRaw, replitRaw] = await Promise.all([
    readFile(files.pkg, 'utf8'),
    readFile(files.changelog, 'utf8'),
    readFile(files.readme, 'utf8'),
    readFile(files.replit, 'utf8')
  ])

  const { pkg, changelog, readme, replit, changelogAdded } = applyVersion(
    { pkgRaw, changelogRaw, readmeRaw, replitRaw },
    ver
  )

  await Promise.all([
    writeFile(files.pkg, pkg),
    writeFile(files.changelog, changelog),
    writeFile(files.readme, readme),
    writeFile(files.replit, replit)
  ])

  return { ver, changelogAdded }
}

async function main() {
  const arg = process.argv[2]
  if (!parseVersion(arg)) {
    console.error('Usage: node scripts/set-version.js <version>   e.g. v0.13.0')
    process.exit(1)
  }

  const { ver, changelogAdded } = await setVersion(root, arg)

  console.log(`Set version to ${ver.v} across:`)
  console.log(`  ✓ package.json ("version")`)
  console.log(`  ✓ CHANGELOG.md (${changelogAdded ? 'added stub entry' : 'entry already present'})`)
  console.log(`  ✓ README.md (Version badge + Current Version header)`)
  console.log(`  ✓ replit.md (Current Version header + Release row)`)
  console.log(`\nRun "npm run check:version" to confirm they all agree.`)
}

// Only run the CLI when executed directly (node scripts/set-version.js), not
// when imported by a test.
const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntryPoint) {
  main().catch((err) => {
    console.error('set-version failed:', err.message)
    process.exit(1)
  })
}
