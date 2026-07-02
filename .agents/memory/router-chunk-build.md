---
name: Router chunk build dependency
description: Why vite build can fail with a "router" manualChunk before react-router-dom is installed
---

The Vite config declares a `router` entry in `manualChunks`. If `react-router-dom`
is referenced by that chunk (or imported anywhere) but not installed, `vite build`
fails even though the dev server may appear fine.

**Why:** A prior sprint added the `router` manualChunk / router usage before the
package was installed, causing a confusing production-build-only failure while HMR
looked healthy.

**How to apply:** When wiring URL routing, install `react-router-dom` first, then
run `npx vite build` to confirm the router chunk resolves. `react-router-dom` v7 is
used here with the v6-compatible API (BrowserRouter / Routes / Route / NavLink /
useNavigate / useLocation).
