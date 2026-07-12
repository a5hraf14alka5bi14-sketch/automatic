---
name: PWA (installable web app) setup
description: How the app is made installable on iPhone/Android/Windows and the service-worker caching rules
---

# PWA setup

The app is a plain manual PWA (no vite-plugin-pwa, avoids Vite/Rolldown build quirks). Pieces:
- `public/manifest.webmanifest` — name/short_name, dir rtl, display standalone, theme #0f172a, bg #020617, icons 192/512 + maskable-512.
- Icons generated from square `public/favicon.png` (512x512) via ImageMagick `magick` (convert is deprecated in IMv7).
- `index.html` — manifest link + apple-mobile-web-app-* meta + apple-touch-icon=/icon-192.png + viewport-fit=cover.
- `src/main.jsx` — registers `/sw.js` on window load.
- `public/sw.js` — served from dist root (Vite copies public/). Cache name is versioned (`auto-os-vN`); bump it on meaningful shell/asset changes.

## Service worker caching rules (do NOT loosen)
**Why:** cache-first + Express SPA fallback can poison the cache with HTML served under a JS/asset URL, permanently breaking that client until cache clears.
**How to apply:**
- Bypass entirely: non-GET, cross-origin, `/api`, `/ws`.
- Navigations: network-first; only cache `/` when `res.ok && content-type is text/html`; offline fallback to cached `/`.
- Static: only cache when `request.destination` ∈ {script,style,image,font} AND `res.ok && res.type==='basic' && NOT text/html`.
- Server defense-in-depth: in the IS_PROD SPA fallback, return 404 (not index.html) for any path with a file extension so missing hashed assets never return HTML.

## "App won't open / works wrong on mobile" is usually a stale service worker
**Why:** if users installed/loaded the PWA during a broken deploy (e.g. prod ran in dev mode serving `/src/main.jsx`), the old SW keeps serving a stale/broken app shell. This looks like a mobile layout bug but is a caching bug.
**How to apply:** (1) bump `CACHE` (`auto-os-vN`) to evict poisoned caches; (2) `src/main.jsx` self-updates via `controllerchange` — reload once, guarded by `hadController` (skip the first-ever install so no reload on fresh visit) + a `refreshing` flag (no reload loop). SW already does `skipWaiting()`+`clients.claim()`. Tell affected users to fully close/reopen (or reinstall) once after deploy.
