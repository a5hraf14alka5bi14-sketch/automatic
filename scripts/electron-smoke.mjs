#!/usr/bin/env node
// Electron packaged-startup smoke test — launches the desktop shell against the
// built dist/ and asserts the main UI actually renders (not a blank window).
//
// A regression in the custom app://bundle protocol serving or in Vite asset
// paths shows up as a blank window that no unit test catches. This script
// catches it by driving the real Electron shell with Playwright.
//
// Run on Windows or macOS (Electron cannot launch on Replit's Linux container):
//
//   VITE_API_BASE_URL="https://your-app.replit.app" npm run build
//   npm run electron:smoke
//
// Exit code 0 = window opened, #root rendered content, login screen visible.
// Any failure prints the reason and exits 1.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const TIMEOUT_MS = 30_000

function fail(msg) {
  console.error(`\n✖ SMOKE FAIL: ${msg}`)
  process.exit(1)
}

// ── Preflight: a built dist/ must exist ──────────────────────────────────────
if (!existsSync(path.join(DIST, 'index.html'))) {
  fail('dist/index.html not found — run `VITE_API_BASE_URL="https://…" npm run build` first.')
}

// ── Preflight: warn if the bundle was built without an absolute API base ─────
// A desktop bundle built with relative URLs will render but every API call will
// hit app://bundle/api/... and fail. Detect the baked-in base URL in the JS.
const assetsDir = path.join(DIST, 'assets')
let baked = null
if (existsSync(assetsDir)) {
  const { readdirSync } = await import('node:fs')
  for (const f of readdirSync(assetsDir).filter(f => f.endsWith('.js'))) {
    // src/config.js bakes VITE_API_BASE_URL as a literal that is immediately
    // .trim()ed / .replace()d — match either form the minifier emits.
    const m = readFileSync(path.join(assetsDir, f), 'utf8').match(/["'`](https:\/\/[^"'`]+)["'`]\s*\.(?:trim|replace)\(/)
    if (m) { baked = m[1]; break }
  }
}
if (!baked) {
  console.warn('⚠ Could not detect an absolute VITE_API_BASE_URL baked into dist/.')
  console.warn('  The UI will render, but logins will fail unless the bundle was built')
  console.warn('  with VITE_API_BASE_URL pointing at the deployed backend.')
} else {
  console.log(`ℹ Bundle backend: ${baked}`)
}

// ── Launch the real Electron shell via Playwright ────────────────────────────
let _electron
try {
  ;({ _electron } = await import('playwright-core'))
} catch {
  fail('playwright-core is not installed — run `npm install` first.')
}

console.log('ℹ Launching Electron shell…')

// Playwright's Electron driver can surface launch failures as uncaught
// exceptions (e.g. missing display libraries on Linux) — translate them into
// a clear smoke failure instead of a raw stack trace.
const launchHint = 'Electron failed to launch. This test must run on Windows or macOS with a display — not on Replit/Linux CI without one.'
process.on('uncaughtException', (err) => fail(`${launchHint}\n  (${err.message})`))
process.on('unhandledRejection', (err) => fail(`${launchHint}\n  (${err?.message || err})`))

let app
try {
  app = await _electron.launch({
    args: [path.join(ROOT, 'electron', 'main.js')],
    cwd: ROOT,
    timeout: TIMEOUT_MS,
  })
} catch (err) {
  fail(`Electron failed to launch: ${err.message}\n  (This test must run on Windows or macOS with a display — not on Replit/Linux CI without one.)`)
}

try {
  const win = await app.firstWindow({ timeout: TIMEOUT_MS })

  // Surface renderer errors — a broken app:// asset path logs failed requests.
  const consoleErrors = []
  win.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  win.on('pageerror', err => consoleErrors.push(String(err)))

  // 1. The window must be on the app://bundle origin (protocol registered).
  await win.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_MS })
  const url = win.url()
  if (!url.startsWith('app://bundle/')) fail(`Window loaded unexpected URL: ${url}`)
  console.log(`✔ Window loaded ${url}`)

  // 2. #root must render actual content (blank window = empty #root).
  await win.waitForFunction(
    () => { const r = document.getElementById('root'); return r && r.childElementCount > 0 },
    { timeout: TIMEOUT_MS }
  ).catch(() => fail(`#root never rendered any content (blank window).${consoleErrors.length ? '\n  Renderer errors:\n  - ' + consoleErrors.slice(0, 5).join('\n  - ') : ''}`))
  console.log('✔ #root rendered content')

  // 3. The login screen must be visible: email + password inputs.
  //    (A fresh install has no stored session, so the app boots to Login.)
  await win.waitForSelector('input[type="email"]', { timeout: TIMEOUT_MS })
    .catch(() => fail('Login email input never appeared — app did not reach the login screen.'))
  await win.waitForSelector('input[type="password"]', { timeout: TIMEOUT_MS })
    .catch(() => fail('Login password input never appeared.'))
  console.log('✔ Login screen rendered (email + password inputs visible)')

  // 4. No fatal renderer errors (failed asset loads, JS exceptions).
  const fatal = consoleErrors.filter(e => /Failed to load|ERR_|Uncaught/i.test(e))
  if (fatal.length) fail(`Renderer reported errors:\n  - ${fatal.slice(0, 5).join('\n  - ')}`)

  console.log('\n✔ SMOKE PASS — the desktop app opens to a working login screen.')
} finally {
  await app.close().catch(() => {})
}
