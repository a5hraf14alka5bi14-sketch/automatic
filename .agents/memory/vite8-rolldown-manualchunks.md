---
name: Vite 8 / Rolldown manualChunks
description: Vite 8 build gotcha for manualChunks config
---

Vite 8 uses Rolldown for `vite build`. Rolldown requires `build.rollupOptions.output.manualChunks` to be a **function** `(id) => 'chunkName'`, NOT the object form `{ vendor: [...] }`. The object form throws `TypeError: manualChunks is not a function` at build time (dev server is unaffected).

**Why:** upgrading Vite 5→8 (to fix the path-traversal/esbuild vuln) broke the existing object-form config.

**How to apply:** keep manualChunks as a function; match on `id.includes('node_modules')` + package path substrings. Vite 8 needs `@vitejs/plugin-react` v6+.
