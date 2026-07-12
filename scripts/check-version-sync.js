/**
 * Verify the project version is consistent across every place it is declared.
 *
 * The same version string is duplicated by hand in several files on each
 * release, so they can silently drift apart (e.g. README showing an older
 * version than package.json). This check reads the version from each source of
 * truth and fails loudly if any of them disagree.
 *
 * Sources checked:
 *   - package.json                  "version" field
 *   - CHANGELOG.md                  newest released "## [vX.Y.Z]" entry
 *   - README.md                     the Version badge + "Current Version" header
 *   - replit.md                     the "Current Version:" header + Release row
 *
 * Usage:
 *   node scripts/check-version-sync.js      # exits 1 (with a report) on drift
 *   npm run check:version
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseChangelog } from './changelog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

// Normalise any "0.12.0" / "v0.12.0" to the canonical "v0.12.0" form.
function normalize(v) {
  if (!v) return null
  const m = String(v).match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? `v${m[1]}.${m[2]}.${m[3]}` : null
}

// Pull the first capture group of `re` from `text`, or null when absent.
function firstMatch(text, re) {
  const m = text.match(re)
  return m ? m[1] : null
}

// Pure: derive the labelled version sources from the raw file contents. Kept
// separate from file I/O so it can be exercised directly in tests with crafted
// (mismatched / reformatted / missing) inputs.
export function extractSources({ pkgRaw, changelogRaw, readme, replitMd }) {
  let pkgVersion = null
  try {
    pkgVersion = normalize(JSON.parse(pkgRaw).version)
  } catch {
    pkgVersion = null
  }

  // parseChangelog returns entries newest-first; the first is the latest release.
  const changelogEntries = parseChangelog(changelogRaw || '')
  const changelogVersion = changelogEntries.length ? normalize(changelogEntries[0].version) : null

  return [
    { label: 'package.json ("version")', version: pkgVersion },
    { label: 'CHANGELOG.md (newest entry)', version: changelogVersion },
    {
      label: 'README.md (Version badge)',
      version: normalize(firstMatch(readme || '', /Version-v?(\d+\.\d+\.\d+)-/))
    },
    {
      label: 'README.md (Current Version header)',
      version: normalize(firstMatch(readme || '', /Current Version\s*[—–-]\s*v?(\d+\.\d+\.\d+)/i))
    },
    {
      label: 'replit.md (Current Version header)',
      version: normalize(firstMatch(replitMd || '', /Current Version:\s*v?(\d+\.\d+\.\d+)/i))
    },
    {
      label: 'replit.md (Release table row)',
      version: normalize(firstMatch(replitMd || '', /\*\*Release\*\*\s*\|\s*v?(\d+\.\d+\.\d+)/i))
    }
  ]
}

// Pure: reduce the labelled sources to a pass/fail verdict.
export function evaluateSources(sources) {
  const missing = sources.filter((s) => !s.version)
  const found = sources.filter((s) => s.version)
  const distinct = [...new Set(found.map((s) => s.version))]
  const ok = missing.length === 0 && distinct.length === 1
  return { ok, missing, found, distinct }
}

async function collectSources() {
  const [pkgRaw, changelogRaw, readme, replitMd] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8'),
    readFile(path.join(root, 'CHANGELOG.md'), 'utf8'),
    readFile(path.join(root, 'README.md'), 'utf8'),
    readFile(path.join(root, 'replit.md'), 'utf8')
  ])

  return extractSources({ pkgRaw, changelogRaw, readme, replitMd })
}

async function main() {
  const sources = await collectSources()

  const { ok, missing, distinct } = evaluateSources(sources)

  console.log('Version sync check:\n')
  for (const s of sources) {
    const mark = s.version ? '  ' : '❌'
    console.log(`  ${mark} ${s.label.padEnd(34)} ${s.version || '(not found)'}`)
  }
  console.log('')

  if (ok) {
    console.log(`✅ All version references agree: ${distinct[0]}`)
    return
  }

  if (missing.length) {
    console.error(
      `❌ Could not find a version in: ${missing.map((s) => s.label).join(', ')}`
    )
  }
  if (distinct.length > 1) {
    console.error(`❌ Version mismatch — found ${distinct.length} distinct versions: ${distinct.join(', ')}`)
  }
  console.error('\nUpdate every reference above so they all match before releasing.')
  process.exit(1)
}

// Only run the CLI when executed directly (node scripts/check-version-sync.js),
// not when imported by a test.
const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntryPoint) {
  main().catch((err) => {
    console.error('check-version-sync failed:', err)
    process.exit(1)
  })
}
