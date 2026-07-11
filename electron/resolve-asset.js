// Pure, testable resolution of an app://bundle/<path> request onto a file inside
// the built SPA directory (dist/). Extracted from main.js so the security-
// critical path-traversal guard can be unit-tested without launching Electron
// (which can't run in the Replit Linux environment).
import path from 'node:path'

// Given the dist directory and a request pathname (from `new URL(url).pathname`),
// return { ok: true, filePath } for an allowed asset, or { ok: false } when the
// request escapes dist/ via path traversal. Empty/"/" maps to index.html so the
// SPA shell loads.
export function resolveBundleAsset(distDir, pathname) {
  let rel = decodeURIComponent(pathname || '')
  if (!rel || rel === '/') rel = '/index.html'
  const resolved = path.normalize(path.join(distDir, rel))
  if (resolved !== distDir && !resolved.startsWith(distDir + path.sep)) {
    return { ok: false }
  }
  return { ok: true, filePath: resolved }
}
