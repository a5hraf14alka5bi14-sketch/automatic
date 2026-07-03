---
name: PWA install icons
description: How the install/home-screen icon is produced and cached for Automatic Restaurant OS
---

# PWA install icons

Install/home-screen icon = the restaurant logo. Source of truth: `src/assets/brand/logo-full.png`.

Icons live in `public/` and are referenced by absolute paths (Vite serves `public/` at root; `attached_assets/` is NOT served):
- `icon-192.png`, `icon-512.png` (manifest `purpose:any`)
- `icon-maskable-512.png` (manifest `purpose:maskable`)
- `apple-touch-icon.png` 180x180 (iOS home screen; iOS ignores the manifest and uses this)
- `favicon.png`/`favicon.ico`

**Rules when regenerating:**
- Flatten on WHITE, no transparency (`magick -background white ... -flatten`). iOS renders transparent apple-touch-icon regions as black.
- Maskable: white fills the entire canvas edge-to-edge; logo scaled to ~75% (safe zone), else launchers crop the corners and it looks broken.
- After changing icon bytes (same filenames), you MUST bump the service worker cache version in `public/sw.js` (`CACHE = 'auto-os-vN'`), because the fetch handler is cache-first for images — old icons persist otherwise.

**Why installs may still show the old icon:** OS caches the icon at install time. Users must remove and re-add / reinstall the app; production needs a republish.
