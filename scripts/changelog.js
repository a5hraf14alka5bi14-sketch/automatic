/**
 * Pure CHANGELOG.md parsing + version helpers.
 *
 * These functions are dependency-free (no server/db.js, no Notion, no `pg`) so
 * they can be imported by tooling that runs BEFORE `npm ci` installs the app's
 * runtime dependencies — most importantly the CI "version sync check" step,
 * which executes ahead of the dependency install. Keeping the parser here means
 * `scripts/check-version-sync.js` and `scripts/set-version.js` never transitively
 * pull in `pg` (via server/db.js) just to read the changelog.
 *
 * The Notion Release Log sync (`scripts/sync-release-log.js`) re-exports these
 * for backward compatibility.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_PATH = path.join(__dirname, '..', 'package.json')

// Normalise a version string so "0.12.0" and "v0.12.0" compare equal.
export function normalizeVersion(v) {
  if (!v) return ''
  const s = String(v).trim()
  return s.startsWith('v') ? s : `v${s}`
}

// Read the shipped version from package.json (the source of truth for what a
// merge actually released). Returns a normalised "vX.Y.Z" string.
export async function readPackageVersion() {
  const raw = await readFile(PACKAGE_PATH, 'utf8')
  const version = JSON.parse(raw).version
  return normalizeVersion(version)
}

// ── CHANGELOG parsing ──────────────────────────────────────────────────────

// Matches: "## [v0.12.0] — 2026-07-05 — Security & Quality Hardening (round 2)"
// The separator is an em-dash (—). "## [Unreleased]" has no version and is skipped.
const HEADING_RE = /^##\s*\[v(\d+)\.(\d+)\.(\d+)\]\s*[—-]\s*(\d{4}-\d{2}-\d{2})\s*[—-]\s*(.+?)\s*$/

export function parseChangelog(text) {
  const lines = text.split('\n')
  const entries = []
  let current = null

  for (const line of lines) {
    const m = line.match(HEADING_RE)
    if (m) {
      if (current) entries.push(current)
      const [, major, minor, patch, date, title] = m
      current = {
        version: `v${major}.${minor}.${patch}`,
        semver: { major: +major, minor: +minor, patch: +patch },
        date,
        title: title.trim(),
        highlights: []
      }
      continue
    }
    if (!current) continue
    // Stop collecting when we hit a non-version heading (e.g. "## [Unreleased]").
    if (/^##\s/.test(line) && !HEADING_RE.test(line)) {
      entries.push(current)
      current = null
      continue
    }
    // Collect bold highlights (**Feature name**) as the summary source material.
    const bolds = line.match(/\*\*(.+?)\*\*/g)
    if (bolds) {
      for (const b of bolds) {
        const cleaned = b.replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/[:：]\s*$/, '').trim()
        if (cleaned) current.highlights.push(cleaned)
      }
    }
  }
  if (current) entries.push(current)
  return entries
}

// Type = the SemVer level bumped relative to the previous (older) release.
// Falls back to inferring from the version itself when there is no predecessor.
export function classifyType(entry, prev) {
  const c = entry.semver
  if (prev) {
    const p = prev.semver
    if (c.major > p.major) return 'Major'
    if (c.minor > p.minor) return 'Minor'
    return 'Patch'
  }
  if (c.patch > 0) return 'Patch'
  if (c.minor > 0) return 'Minor'
  return 'Major'
}

const SUMMARY_MAX = 400

export function buildSummary(entry) {
  const highlights = [...new Set(entry.highlights)]
  let summary = highlights.length ? `${entry.title} — ${highlights.join(', ')}` : entry.title
  if (summary.length > SUMMARY_MAX) summary = summary.slice(0, SUMMARY_MAX - 1).trimEnd() + '…'
  return summary
}

// Attach the derived Type + Summary to each entry (entries are newest-first).
export function enrichEntries(entries) {
  return entries.map((entry, i) => ({
    ...entry,
    type: classifyType(entry, entries[i + 1]),
    summary: buildSummary(entry)
  }))
}
