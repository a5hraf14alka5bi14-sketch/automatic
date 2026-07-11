// One-command version bump guard — locks in set-version.js so a reformat of any
// of the four version locations (package.json, CHANGELOG.md, README.md,
// replit.md) can't silently start throwing or, worse, quietly stop covering a
// location. Runs the real bumper against fixture copies of the actual repo files
// and confirms check-version-sync.js's parser agrees on the result.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, cp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setVersion, applyVersion, parseVersion, assertNewestChangelogEntry } from '../scripts/set-version.js'
import { extractSources, evaluateSources } from '../scripts/check-version-sync.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const FILES = ['package.json', 'CHANGELOG.md', 'README.md', 'replit.md']

// Copy the current, real repo files into a throwaway dir so the test exercises
// the exact formatting shipping today — if someone reformats a badge or the
// replit.md Release row, the copied fixture reformats with it and this test
// catches the break instead of a future release.
let dir
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'set-version-'))
  await Promise.all(FILES.map((f) => cp(path.join(root, f), path.join(dir, f))))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function readAll() {
  const [pkg, changelog, readme, replit] = await Promise.all(
    FILES.map((f) => readFile(path.join(dir, f), 'utf8'))
  )
  return { pkg, changelog, readme, replit }
}

describe('setVersion (end-to-end against real file fixtures)', () => {
  it('updates every location and check:version-style parsing agrees on the new version', async () => {
    const { ver } = await setVersion(dir, 'v9.9.9')
    expect(ver.v).toBe('v9.9.9')

    const { pkg, changelog, readme, replit } = await readAll()

    // package.json really parses and holds the bare version.
    expect(JSON.parse(pkg).version).toBe('9.9.9')
    // CHANGELOG got a fresh top entry for the new version.
    expect(changelog).toMatch(/^##\s*\[v9\.9\.9\]/m)

    // The independent check-version-sync parser must find v9.9.9 in all six
    // sources with no drift and nothing missing.
    const sources = extractSources({
      pkgRaw: pkg,
      changelogRaw: changelog,
      readme,
      replitMd: replit
    })
    const result = evaluateSources(sources)
    expect(result.ok).toBe(true)
    expect(result.missing).toHaveLength(0)
    expect(result.distinct).toEqual(['v9.9.9'])
  })

  it('is idempotent — re-running with the same version adds no duplicate CHANGELOG stub', async () => {
    await setVersion(dir, 'v9.9.9')
    const first = await readAll()
    const firstStubs = (first.changelog.match(/^##\s*\[v9\.9\.9\]/gm) || []).length
    expect(firstStubs).toBe(1)

    const { changelogAdded } = await setVersion(dir, 'v9.9.9')
    expect(changelogAdded).toBe(false)

    const second = await readAll()
    const secondStubs = (second.changelog.match(/^##\s*\[v9\.9\.9\]/gm) || []).length
    expect(secondStubs).toBe(1)
    // Every file is byte-identical on the second run.
    expect(second).toEqual(first)
  })

  it('rejects a malformed version instead of writing garbage', async () => {
    const before = await readAll()
    await expect(setVersion(dir, 'not-a-version')).rejects.toThrow(/Usage/)
    await expect(setVersion(dir, undefined)).rejects.toThrow(/Usage/)
    // Files are untouched after a rejected run.
    expect(await readAll()).toEqual(before)
  })
})

describe('applyVersion (pure) fails loudly when a location is reformatted away', () => {
  // A minimal, aligned set of raw contents matching the four expected shapes.
  function inputs() {
    return {
      pkgRaw: JSON.stringify({ name: 'app', version: '0.1.0' }, null, 2),
      changelogRaw: '# Changelog\n\n## [v0.1.0] — 2026-01-01 — Release\n\n### Added\n- Thing\n\n---\n',
      readmeRaw:
        '![Version](https://img.shields.io/badge/Version-v0.1.0-orange)\n\n## Current Version — v0.1.0\n',
      replitRaw:
        '# App\n\n## Current Version: v0.1.0 — Release\n\n| | |\n|---|---|\n| **Release** | v0.1.0 — Release |\n'
    }
  }

  const ver = parseVersion('v2.0.0')

  it('rewrites all locations when every shape is present', () => {
    const out = applyVersion(inputs(), ver)
    expect(JSON.parse(out.pkg).version).toBe('2.0.0')
    expect(out.changelogAdded).toBe(true)
    expect(out.readme).toContain('Version-v2.0.0-')
    expect(out.readme).toContain('Current Version — v2.0.0')
    expect(out.replit).toContain('Current Version: v2.0.0')
    expect(out.replit).toContain('**Release** | v2.0.0')
  })

  it('throws when the README badge is reformatted out of shape', () => {
    const bad = inputs()
    bad.readmeRaw = '![Version](https://example.com/version_v0.1.0.svg)\n\n## Current Version — v0.1.0\n'
    expect(() => applyVersion(bad, ver)).toThrow(/README\.md \(Version badge\)/)
  })

  it('throws when the replit.md Release row is reformatted out of shape', () => {
    const bad = inputs()
    bad.replitRaw = '# App\n\n## Current Version: v0.1.0 — Release\n\n| | |\n|---|---|\n| Release: | v0.1.0 |\n'
    expect(() => applyVersion(bad, ver)).toThrow(/replit\.md \(Release table row\)/)
  })

  it('throws when the CHANGELOG has no release heading to anchor a stub', () => {
    const bad = inputs()
    bad.changelogRaw = '# Changelog\n\nNo releases yet.\n'
    expect(() => applyVersion(bad, ver)).toThrow(/release heading in CHANGELOG/)
  })
})

describe('release gate — newest CHANGELOG entry must match the bumped version', () => {
  const ver = parseVersion('v2.0.0')

  it('passes when the newest entry is the new version (stub or hand-written)', () => {
    const ok =
      '# Changelog\n\n## [v2.0.0] — 2026-07-08 — Release v2.0.0\n\n### Changed\n- x\n\n---\n\n## [v0.1.0] — 2026-01-01 — Release\n'
    expect(() => assertNewestChangelogEntry(ok, ver)).not.toThrow()
  })

  it('throws when the version exists only as an older (mis-ordered) entry', () => {
    const misordered =
      '# Changelog\n\n## [v1.0.0] — 2026-06-01 — Release\n\n---\n\n## [v2.0.0] — 2026-05-01 — Early entry\n'
    expect(() => assertNewestChangelogEntry(misordered, ver)).toThrow(/newest entry is v1\.0\.0, not v2\.0\.0/)
  })

  it('throws when no entry parses at all', () => {
    expect(() => assertNewestChangelogEntry('# Changelog\n\nnothing here\n', ver)).toThrow(
      /no parseable release entry/
    )
  })

  it('applyVersion aborts (writes nothing) when the new version sits below a newer heading', () => {
    // v2.0.0 already exists in the changelog but NOT as the newest entry, so
    // ensureChangelogEntry leaves the file alone and the gate must fire.
    const bad = {
      pkgRaw: JSON.stringify({ name: 'app', version: '0.1.0' }, null, 2),
      changelogRaw:
        '# Changelog\n\n## [v3.0.0] — 2026-07-01 — Newer\n\n---\n\n## [v2.0.0] — 2026-06-01 — Target\n',
      readmeRaw:
        '![Version](https://img.shields.io/badge/Version-v0.1.0-orange)\n\n## Current Version — v0.1.0\n',
      replitRaw:
        '# App\n\n## Current Version: v0.1.0 — Release\n\n| | |\n|---|---|\n| **Release** | v0.1.0 — Release |\n'
    }
    expect(() => applyVersion(bad, ver)).toThrow(/would ship without its changelog entry/)
  })

  it('setVersion end-to-end leaves all files untouched when the gate fires', async () => {
    // Corrupt the fixture changelog so v9.9.9 exists below a newer heading.
    const clPath = path.join(dir, 'CHANGELOG.md')
    const cl = await readFile(clPath, 'utf8')
    const first = cl.match(/^##\s*\[v\d+\.\d+\.\d+\]/m)
    const injected =
      cl.slice(0, first.index) +
      '## [v99.0.0] — 2026-07-08 — Future release\n\n---\n\n## [v9.9.9] — 2026-07-01 — Old spot\n\n---\n\n' +
      cl.slice(first.index)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(clPath, injected)

    const before = await readAll()
    await expect(setVersion(dir, 'v9.9.9')).rejects.toThrow(/would ship without its changelog entry/)
    expect(await readAll()).toEqual(before)
  })
})

describe('parseVersion', () => {
  it('accepts v-prefixed and bare semver', () => {
    expect(parseVersion('v1.2.3')).toEqual({ bare: '1.2.3', v: 'v1.2.3' })
    expect(parseVersion('1.2.3')).toEqual({ bare: '1.2.3', v: 'v1.2.3' })
  })

  it('rejects malformed input', () => {
    for (const bad of ['', undefined, null, '1.2', 'v1.2.3.4', 'x.y.z', 'v1.2.3-rc1']) {
      expect(parseVersion(bad)).toBeNull()
    }
  })
})
