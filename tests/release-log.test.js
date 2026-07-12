// Release Log sync — CHANGELOG parsing, SemVer type classification, and summary
// generation. Pure-function coverage (no Notion / DB calls).
import { describe, it, expect } from 'vitest'
import {
  parseChangelog,
  classifyType,
  buildSummary,
  enrichEntries,
  normalizeVersion,
  readPackageVersion
} from '../scripts/sync-release-log.js'

const SAMPLE = `# Changelog

---

## [v1.0.0] — 2026-08-01 — Big Bang

### Added
- **Multi-branch support** for chains
- **Online ordering** portal

## [v0.12.1] — 2026-07-06 — Hotfix

### Fixed
- **Crash on empty cart** resolved

## [v0.12.0] — 2026-07-05 — Security Hardening

### Security
- **Automated secret scanner** with pre-commit hook
- **Rate limiting** on AI endpoints

## [Unreleased]

### Planned
- **QR menu** for tables
`

describe('parseChangelog', () => {
  it('extracts only released versions, skipping Unreleased', () => {
    const entries = parseChangelog(SAMPLE)
    expect(entries.map(e => e.version)).toEqual(['v1.0.0', 'v0.12.1', 'v0.12.0'])
  })

  it('captures date, title and bold highlights', () => {
    const [first] = parseChangelog(SAMPLE)
    expect(first.date).toBe('2026-08-01')
    expect(first.title).toBe('Big Bang')
    expect(first.highlights).toEqual(['Multi-branch support', 'Online ordering'])
  })
})

describe('classifyType', () => {
  it('detects a major bump', () => {
    const entries = parseChangelog(SAMPLE)
    expect(classifyType(entries[0], entries[1])).toBe('Major')
  })
  it('detects a patch bump', () => {
    const entries = parseChangelog(SAMPLE)
    expect(classifyType(entries[1], entries[2])).toBe('Patch')
  })
  it('infers type from version when there is no predecessor', () => {
    expect(classifyType({ semver: { major: 0, minor: 12, patch: 0 } }, null)).toBe('Minor')
    expect(classifyType({ semver: { major: 0, minor: 0, patch: 3 } }, null)).toBe('Patch')
    expect(classifyType({ semver: { major: 2, minor: 0, patch: 0 } }, null)).toBe('Major')
  })
})

describe('buildSummary', () => {
  it('combines title and de-duplicated highlights', () => {
    const [first] = parseChangelog(SAMPLE)
    expect(buildSummary(first)).toBe('Big Bang — Multi-branch support, Online ordering')
  })
  it('caps very long summaries', () => {
    const long = { title: 'T', highlights: Array.from({ length: 200 }, (_, i) => `Feature ${i}`) }
    const s = buildSummary(long)
    expect(s.length).toBeLessThanOrEqual(400)
    expect(s.endsWith('…')).toBe(true)
  })
})

describe('enrichEntries', () => {
  it('attaches type and summary to every entry', () => {
    const enriched = enrichEntries(parseChangelog(SAMPLE))
    expect(enriched[0]).toMatchObject({ version: 'v1.0.0', type: 'Major' })
    expect(enriched[1]).toMatchObject({ version: 'v0.12.1', type: 'Patch' })
    expect(enriched[2]).toMatchObject({ version: 'v0.12.0', type: 'Minor' })
    expect(enriched[2].summary).toContain('Automated secret scanner')
  })
})

describe('normalizeVersion', () => {
  it('prefixes a bare semver with v', () => {
    expect(normalizeVersion('0.12.0')).toBe('v0.12.0')
  })
  it('leaves an already-prefixed version unchanged', () => {
    expect(normalizeVersion('v1.2.3')).toBe('v1.2.3')
  })
  it('trims surrounding whitespace', () => {
    expect(normalizeVersion('  0.5.1 ')).toBe('v0.5.1')
  })
  it('returns empty string for falsy input', () => {
    expect(normalizeVersion('')).toBe('')
    expect(normalizeVersion(null)).toBe('')
    expect(normalizeVersion(undefined)).toBe('')
  })
})

describe('readPackageVersion', () => {
  it('reads package.json and returns a normalised v-prefixed version', async () => {
    const v = await readPackageVersion()
    expect(v).toMatch(/^v\d+\.\d+\.\d+/)
  })
  it('agrees with the newest CHANGELOG entry (release + changelog stay in lockstep)', async () => {
    // This is the invariant the post-merge guard protects: the shipped version
    // (package.json) must match CHANGELOG.md's newest entry. If this test fails,
    // a release shipped without a matching changelog entry.
    const { readFile } = await import('node:fs/promises')
    const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
    const newest = parseChangelog(changelog)[0]
    const pkgVersion = await readPackageVersion()
    expect(newest.version).toBe(pkgVersion)
  })
})
