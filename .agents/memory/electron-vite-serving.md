---
name: Electron serving a Vite SPA
description: Why the Electron desktop shell serves dist/ over a custom app:// protocol instead of file://
---

Do NOT load a Vite-built SPA into Electron via `file://` (`loadFile`/`pathToFileURL(dist/index.html)`).

**Why:** Vite emits root-absolute asset URLs (`/assets/…`, `/favicon.png`, `/manifest.webmanifest`). Under `file://` those resolve against the filesystem root, not the app bundle, so the window boots to a blank/broken UI.

**How to apply:** Register a privileged custom scheme (e.g. `app`) before `app` is ready, then in `whenReady` use `protocol.handle` to map `app://bundle/<path>` onto files inside `dist/` (guard against `..` traversal), and `mainWindow.loadURL('app://bundle/index.html')`. Alternative: build a separate Electron bundle with Vite `base: './'`, but the custom protocol is more robust for SPA routing.

Also harden the shell: allowlist `https:`/`mailto:` before `shell.openExternal`, and `event.preventDefault()` in `will-navigate` for any URL outside the app origin. Keep `contextIsolation: true`, `nodeIntegration: false`; expose only a minimal bridge via a `.cjs` preload (preload must be CommonJS when package.json has `"type":"module"`).
