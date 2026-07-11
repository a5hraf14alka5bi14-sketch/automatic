import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { resolveBundleAsset } from '../electron/resolve-asset.js'

// Windows desktop startup smoke test: the Electron shell serves the built SPA
// over the app://bundle protocol. This exercises the pure resolver that maps a
// request path onto a file in dist/ and guards against path traversal — the
// security-critical part of desktop startup that we CAN test on Linux (Electron
// itself can't launch here).
const DIST = path.join(process.cwd(), 'dist')

describe('resolveBundleAsset', () => {
  it('maps the root to index.html so the SPA shell loads', () => {
    const r = resolveBundleAsset(DIST, '/')
    expect(r.ok).toBe(true)
    expect(r.filePath).toBe(path.join(DIST, 'index.html'))
  })

  it('maps an empty path to index.html', () => {
    const r = resolveBundleAsset(DIST, '')
    expect(r.ok).toBe(true)
    expect(r.filePath).toBe(path.join(DIST, 'index.html'))
  })

  it('resolves a normal hashed asset inside dist/', () => {
    const r = resolveBundleAsset(DIST, '/assets/index-abc123.js')
    expect(r.ok).toBe(true)
    expect(r.filePath).toBe(path.join(DIST, 'assets', 'index-abc123.js'))
  })

  it('resolves a root-level static file (favicon)', () => {
    const r = resolveBundleAsset(DIST, '/favicon.png')
    expect(r.ok).toBe(true)
    expect(r.filePath).toBe(path.join(DIST, 'favicon.png'))
  })

  it('decodes percent-encoded paths', () => {
    const r = resolveBundleAsset(DIST, '/assets/my%20file.js')
    expect(r.ok).toBe(true)
    expect(r.filePath).toBe(path.join(DIST, 'assets', 'my file.js'))
  })

  it('refuses path traversal that escapes dist/', () => {
    expect(resolveBundleAsset(DIST, '/../secret.env').ok).toBe(false)
    expect(resolveBundleAsset(DIST, '/../../etc/passwd').ok).toBe(false)
  })

  it('refuses percent-encoded traversal', () => {
    expect(resolveBundleAsset(DIST, '/%2e%2e/%2e%2e/etc/passwd').ok).toBe(false)
  })

  it('does not treat a sibling dir sharing the dist prefix as inside dist/', () => {
    // e.g. /home/app/dist vs /home/app/dist-secrets
    const r = resolveBundleAsset('/home/app/dist', '/../dist-secrets/key')
    expect(r.ok).toBe(false)
  })
})
