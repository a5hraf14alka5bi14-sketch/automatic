// Version-sync guard — locks in the drift detection so a reformat of any
// version line can't silently stop the check from matching. Pure-function
// coverage over crafted (aligned / mismatched / missing / reformatted) inputs.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractSources, evaluateSources } from '../scripts/check-version-sync.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

// A fully-aligned set of raw file contents, all declaring v0.12.0.
function alignedInputs(v = '0.12.0') {
  return {
    pkgRaw: JSON.stringify({ name: 'app', version: v }),
    changelogRaw: `# Changelog\n\n## [v${v}] — 2026-07-06 — Release\n\n### Added\n- **Thing**\n`,
    readme: `![Version](https://img.shields.io/badge/Version-v${v}-orange)\n\n## Current Version — v${v}\n`,
    replitMd: `# App\n\n## Current Version: v${v} — Release\n\n| | |\n|---|---|\n| **Release** | v${v} — Release |\n`
  }
}

describe('extractSources', () => {
  it('pulls the same version from every source when aligned', () => {
    const sources = extractSources(alignedInputs('0.12.0'))
    expect(sources).toHaveLength(6)
    for (const s of sources) {
      expect(s.version).toBe('v0.12.0')
    }
  })

  it('normalises bare and v-prefixed versions to a canonical vX.Y.Z', () => {
    const sources = extractSources(alignedInputs('1.2.3'))
    expect(new Set(sources.map((s) => s.version))).toEqual(new Set(['v1.2.3']))
  })
})

describe('evaluateSources', () => {
  it('passes when all versions agree', () => {
    const result = evaluateSources(extractSources(alignedInputs('0.12.0')))
    expect(result.ok).toBe(true)
    expect(result.distinct).toEqual(['v0.12.0'])
    expect(result.missing).toHaveLength(0)
  })

  it('fails when one source declares a different version (drift)', () => {
    const inputs = alignedInputs('0.12.0')
    // README badge lags behind everything else.
    inputs.readme = `![Version](https://img.shields.io/badge/Version-v0.11.0-orange)\n\n## Current Version — v0.12.0\n`
    const result = evaluateSources(extractSources(inputs))
    expect(result.ok).toBe(false)
    expect(result.distinct.length).toBeGreaterThan(1)
    expect(new Set(result.distinct)).toEqual(new Set(['v0.11.0', 'v0.12.0']))
  })

  it('fails when a version string is missing entirely', () => {
    const inputs = alignedInputs('0.12.0')
    // replit.md Release row was dropped.
    inputs.replitMd = `# App\n\n## Current Version: v0.12.0 — Release\n`
    const result = evaluateSources(extractSources(inputs))
    expect(result.ok).toBe(false)
    expect(result.missing.map((s) => s.label)).toContain('replit.md (Release table row)')
  })

  it('fails when a line is reformatted so its regex no longer matches', () => {
    const inputs = alignedInputs('0.12.0')
    // Someone reformats the README "Current Version" header to use a colon
    // instead of the expected dash separator. The header regex requires a dash,
    // so this must be reported missing, not silently pass.
    inputs.readme = `![Version](https://img.shields.io/badge/Version-v0.12.0-orange)\n\n## Current Version: v0.12.0\n`
    const result = evaluateSources(extractSources(inputs))
    expect(result.ok).toBe(false)
    expect(result.missing.map((s) => s.label)).toContain('README.md (Current Version header)')
  })

  it('fails when package.json is unparseable', () => {
    const inputs = alignedInputs('0.12.0')
    inputs.pkgRaw = '{ not valid json'
    const result = evaluateSources(extractSources(inputs))
    expect(result.ok).toBe(false)
    expect(result.missing.map((s) => s.label)).toContain('package.json ("version")')
  })
})

// Self-protecting wiring guard — makes sure the release version gate can't be
// silently deleted from CI or from package.json without a test going red.
describe('release version gate wiring', () => {
  it('keeps the check:version npm script defined in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
    expect(pkg.scripts).toBeTruthy()
    expect(pkg.scripts['check:version']).toBeTruthy()
    // The script must actually invoke the version-sync checker, not be an alias
    // to something unrelated.
    expect(pkg.scripts['check:version']).toContain('check-version-sync.js')
  })

  it('keeps the version gate step wired into the CI workflow', () => {
    const ci = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8')
    // Accept either the npm script or a direct call to the underlying script,
    // so a legitimate refactor of how the gate runs still passes.
    const runsGate =
      /npm run check:version/.test(ci) ||
      /node\s+scripts\/check-version-sync\.js/.test(ci)
    expect(runsGate).toBe(true)
  })
})
