---
name: PWA install icons
description: How the install/home-screen icon is produced and cached for Automatic Restaurant OS
---

# PWA install icons

Install/home-screen icon = the restaurant logo. Source of truth: `src/assets/brand/logo-full.png`.

Icons live in `public/` and are referenced by absolute paths (Vite serves `public/` at root; `attached_assets/` is NOT served):
- `icon-192.png`, `icon-512.png` (manifest `purpose:any`)
- `icon-maskable-512.png` (manifest `purpose:maskable`)
- `apple-touch-icon-180.png` 180x180 (iOS home screen; iOS ignores the manifest and uses this). Filename is versioned (NOT `apple-touch-icon.png`) — see query-string rule below.
- `favicon.png`/`favicon.ico`

**Rules when regenerating:**
- Flatten on WHITE and STRIP the alpha channel entirely (`magick logo-full.png -resize 150x150 -background white -gravity center -extent 180x180 -alpha remove -alpha off -strip apple-touch-icon-180.png`). Apple guidance: apple-touch-icon must be OPAQUE. A leftover alpha channel (even fully-opaque, alpha min=255) violates guidance; verify with `identify` → want `Channels: 3.0 / TrueColor`, not RGBA. iOS renders transparent regions as black.
- iOS caches the home-screen icon by EXACT URL. A dark square with a stray white sliver = iOS SCREENSHOT FALLBACK (it captured the dark loading splash) = iOS did NOT get the icon, not a transparency-composite issue.
- **Do NOT cache-bust apple-touch-icon with a `?v=N` query string.** iOS Safari's "Add to Home Screen" frequently refuses to fetch an apple-touch-icon whose href carries a query string, and silently falls back to the screenshot. This project churned `?v=1`→`?v=8` with no effect for that reason. **Cache-bust with a NEW FILENAME instead** (e.g. `apple-touch-icon-180.png`) referenced by a clean, query-less `<link rel="apple-touch-icon" sizes="180x180">` (+ `apple-touch-icon-precomposed`). A new filename is a URL iOS has never cached, so it is always fresh.
- Maskable: white fills the entire canvas edge-to-edge; logo scaled to ~75% (safe zone), else launchers crop the corners and it looks broken.
- After changing icon bytes (same filenames), you MUST bump the service worker cache version in `public/sw.js` (`CACHE = 'auto-os-vN'`), because the fetch handler is cache-first for images — old icons persist otherwise.

**Why installs may still show the old icon:** OS caches the icon at install time. Users must remove and re-add / reinstall the app; production needs a republish.
