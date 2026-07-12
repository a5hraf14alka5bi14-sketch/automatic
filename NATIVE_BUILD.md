# Native App Builds — Build & Deployment Guide

This guide covers turning **Automatic Restaurant OS** (the existing React 19 +
Vite web app) into installable native apps:

| Platform | Technology | Output | Where to build |
|---|---|---|---|
| **iOS** | Capacitor 7 | `.ipa` (App Store / TestFlight) | **macOS + Xcode** (required by Apple) |
| **Android** | Capacitor 7 | `.aab` / `.apk` (Play Store) | macOS / Windows / Linux + Android Studio |
| **Windows** | Electron + electron-builder | `.exe` (NSIS installer) | **Windows** (recommended) |

> **Why you build these locally, not on Replit.** Replit runs Linux and cannot
> compile an iOS binary (Apple requires macOS + Xcode), cannot produce a signed
> Windows `.exe` cleanly, and cannot submit to the App Store / Play Store / MS
> Store. This repo is **scaffolded and configured** for you; the compile +
> signing + store submission happen on your own Mac / Windows machine.

---

## 0. Architecture — one codebase, three shells

```
             ┌────────────────────────────────────────────┐
             │  React 19 + Vite frontend  (src/, dist/)     │
             │  ── SAME bundle for web, iOS, Android, Win ──│
             └───────────────┬────────────────────────────┘
                             │  talks to ONE backend
                             ▼
             ┌────────────────────────────────────────────┐
             │  Express 5 API + WebSocket + PostgreSQL      │
             │  (deployed once, e.g. Replit Deployment)     │
             └────────────────────────────────────────────┘

  Web (browser)      → served same-origin as the API  → relative URLs
  iOS / Android      → Capacitor shell loads dist/     → absolute URL (VITE_API_BASE_URL)
  Windows            → Electron shell loads dist/       → absolute URL (VITE_API_BASE_URL)
```

**No business logic is duplicated.** The native shells are thin wrappers that
load the exact same built frontend. The only frontend change was centralizing
how API/WebSocket URLs are resolved (`src/config.js`).

### The one thing that matters: `VITE_API_BASE_URL`

`src/config.js` reads `import.meta.env.VITE_API_BASE_URL` at build time:

- **Unset / empty** (web build): API calls are **relative** (`/api/...`), because
  the browser is served from the same origin as the API. This is the default and
  keeps the existing web + PWA behavior unchanged.
- **Set to your deployed origin** (native builds): API + WebSocket calls become
  **absolute** (`https://your-app.example.com/api/...`, `wss://.../ws`), because
  a phone or desktop app is NOT served from your server's origin.

Always build the native `dist/` with `VITE_API_BASE_URL` pointing at your
**deployed** backend:

```bash
VITE_API_BASE_URL="https://your-app.replit.app" npm run build
```

---

## 1. Backend prerequisites for native clients

The web app authenticates with an httpOnly cookie (`credentials: 'include'`).
When the frontend runs inside a native shell it lives on a **different origin**
(`capacitor://localhost`, `http://localhost` for Electron, etc.), so the backend
must be reachable cross-origin:

1. **CORS** — allow the native origins and `credentials: true`.
2. **Cookies** — session cookies must be `SameSite=None; Secure` to be sent
   cross-site (requires HTTPS, which Replit Deployments provide).
3. **HTTPS** — mandatory for `SameSite=None` cookies, push, and App/Play store
   review.

> See **Limitations & Considerations** at the bottom for the auth-cookie caveat
> and the recommended alternatives (bearer token in `Authorization` header).

---

## 2. iOS & Android (Capacitor 7)

### Install & sync (already scaffolded here)

Capacitor 7 is installed and configured (`capacitor.config.json`, appId
`lb.automatic.restaurantos`). The `android/` project is scaffolded and the
`ios/` project is scaffolded (CocoaPods + Xcode steps must run on a Mac).

Every time you change frontend code, rebuild the web bundle and copy it in:

```bash
VITE_API_BASE_URL="https://your-app.replit.app" npm run build
npm run cap:sync          # = cap sync (copies dist/ + updates native deps)
```

Helper scripts in `package.json`:

| Script | Does |
|---|---|
| `npm run cap:sync` | `cap sync` — copy `dist/` into iOS+Android, update plugins |
| `npm run cap:add:android` | add the Android platform (already done) |
| `npm run cap:add:ios` | add the iOS platform (already done) |
| `npm run cap:open:android` | open the project in Android Studio |
| `npm run cap:open:ios` | open the project in Xcode (macOS only) |

### Android build (Android Studio)

1. `VITE_API_BASE_URL="https://your-app.replit.app" npm run build && npm run cap:sync`
2. `npm run cap:open:android` (opens Android Studio).
3. Set your app signing (Build → Generate Signed Bundle / APK → create keystore).
4. Build → **Generate Signed Bundle (`.aab`)** for Play Store, or `.apk` for
   sideloading.
5. Upload the `.aab` at [play.google.com/console](https://play.google.com/console).

Permissions already declared in `android/app/src/main/AndroidManifest.xml`:
`CAMERA` (barcode scanning), `POST_NOTIFICATIONS` (push), and a deep-link
`intent-filter` for the `lb.automatic.restaurantos` scheme.

### iOS build (Xcode — macOS only)

1. On your Mac: `VITE_API_BASE_URL="https://your-app.replit.app" npm run build`
2. `npx cap sync ios` then `sudo gem install cocoapods` (first time) and
   `cd ios/App && pod install`.
3. `npm run cap:open:ios` (opens Xcode).
4. Set your Apple **Team** + **Bundle Identifier** under Signing & Capabilities.
5. Add the **Push Notifications** capability (for `@capacitor/push-notifications`).
6. Product → Archive → Distribute App → App Store Connect (TestFlight / release).

`ios/App/App/Info.plist` already contains `NSCameraUsageDescription` (Arabic) and
a `CFBundleURLTypes` deep-link scheme.

### Native features included

| Feature | Plugin | Where |
|---|---|---|
| Camera barcode / QR scan | `@capacitor-mlkit/barcode-scanning` | `src/components/NativeScanButton.jsx` (renders only on native), wired into POS |
| Push notifications | `@capacitor/push-notifications` | permission + register on native; server sends to FCM/APNs |
| Splash screen | `@capacitor/splash-screen` | configured via `capacitor.config.json` |
| Offline storage | `@capacitor/preferences` + existing offline POS queue | works offline, syncs on reconnect |
| Deep links | native intent-filter / URL scheme | `lb.automatic.restaurantos://…` |
| App icon | generated from `public/icon-512.png` | run `cap` icon tooling or set in Studio/Xcode |

---

## 3. Windows desktop (Electron)

Electron, electron-builder, and electron-updater are installed. The shell lives
in `electron/` and loads the built `dist/` frontend.

| File | Purpose |
|---|---|
| `electron/main.js` | main process — window, native menus, single-instance, deep-link protocol (`auto-os://`), auto-update, notification IPC |
| `electron/preload.cjs` | safe bridge — exposes `window.desktop.notify()` to the renderer (contextIsolation on) |
| `electron-builder.json` | NSIS Windows installer config, icons, protocol registration, update feed |

### Run in dev

```bash
VITE_API_BASE_URL="https://your-app.replit.app" npm run build
npm run electron:dev      # launches Electron against the built dist/
```

### Build the Windows installer (.exe)

Run this **on Windows** (electron-builder cross-compilation from Linux for a
signed Windows target is unreliable):

```bash
VITE_API_BASE_URL="https://your-app.replit.app" npm run build
npm run electron:build    # electron-builder --win → release/*.exe (NSIS)
```

The installer lands in `release/`. It creates desktop + Start-menu shortcuts and
registers the `auto-os://` deep-link protocol.

### Auto-update

`electron-updater` checks the `publish` feed in `electron-builder.json` (set the
`generic` `url`, or switch to a GitHub Releases provider). Updates are only
checked in packaged (`app.isPackaged`) builds. Point `url` at wherever you host
the generated `latest.yml` + installer.

### Desktop features included

- **Native application menu** (File / Edit / View / Window / Help).
- **Desktop notifications** — the Kitchen page fires a native OS notification on
  each new order via `window.desktop.notify()` (falls back to the web
  `Notification` API in the browser).
- **Single-instance lock** — re-launching focuses the existing window.
- **External links** open in the system browser, not inside the app.

### Windows startup smoke test

The desktop shell serves the built SPA over the internal `app://bundle`
protocol. The security-critical part — mapping a request path onto a file in
`dist/` and refusing path traversal outside it — is extracted into the pure,
testable `electron/resolve-asset.js` and covered by
`tests/electron-asset-resolution.test.js` (runs on Linux; Electron itself
cannot launch here). Run it with `npx vitest run tests/electron-asset-resolution.test.js`.

**Automated startup smoke test (run on Windows/macOS).** `npm run electron:smoke`
(`scripts/electron-smoke.mjs`) drives the real Electron shell with
`playwright-core` and fails loudly if the app opens to a blank window:

```bash
VITE_API_BASE_URL="https://your-app.replit.app" npm run build
npm run electron:smoke
```

It asserts, in order:

1. the window loads on the `app://bundle/` origin (custom protocol registered),
2. `#root` renders actual content (a blank window = empty `#root`),
3. the login screen appears (email + password inputs — a fresh launch has no
   stored session),
4. no fatal renderer errors (failed asset loads / uncaught exceptions).

It also detects the API base URL baked into `dist/` and warns if the bundle was
built without an absolute `VITE_API_BASE_URL` (the UI would render but every
login would fail). The script needs a machine that can actually launch Electron
— Windows or macOS (or Linux with a display); it exits with a clear message on
Replit. Run it against the same `dist/` you are about to package, since the
installer bundles that exact directory.

After building the `.exe` **on Windows**, do this manual smoke pass before
shipping:

1. **Launch** — double-click the installer, then the app. The window opens with
   the app title and the login screen renders (assets loaded → `app://bundle`
   protocol works).
2. **API reachability** — log in against your deployed backend
   (`VITE_API_BASE_URL` must have been set at build time). A successful login
   confirms the bearer-token flow over HTTPS.
3. **Live updates** — from another device, create an order; the Kitchen page
   should update over the WebSocket and fire a desktop notification.
4. **Single instance** — launch the app again; it should focus the existing
   window instead of opening a second one.
5. **External links** — click an external link; it opens in the system browser.
6. **Deep link** — open an `auto-os://…` URL; the running app handles it.

If step 1 fails (blank window), it's almost always the `app://bundle` asset
path — the unit test above catches regressions in that logic before you build.

---

## 4. Common commands cheat-sheet

```bash
# Web (unchanged default — relative API, same-origin)
npm run build

# Native bundle (absolute API → your deployed backend)
VITE_API_BASE_URL="https://your-app.replit.app" npm run build

# Mobile
npm run cap:sync
npm run cap:open:android      # Android Studio
npm run cap:open:ios          # Xcode (macOS)

# Desktop
npm run electron:dev          # run locally
npm run electron:build        # build Windows .exe (run on Windows)
```

---

## 5. Limitations & Considerations

1. **You must build on the right OS.** iOS → macOS + Xcode. Windows `.exe` →
   Windows. Store submission (App Store / Play / MS Store) is manual and done
   from your machine + developer accounts. Replit (Linux) cannot do these.

2. **Auth: native uses bearer tokens (implemented).** The web app keeps using the
   httpOnly session cookie with `credentials: 'include'` — unchanged. Native
   shells load from a different origin where those cookies aren't sent, so:
   - `/api/auth/login`, `/api/auth/refresh` and `PATCH /api/auth/password` now
     **also return** `token` + `refresh_token` in the JSON body (additive; web
     ignores them). See `server/routes/auth.js`.
   - On native (`isNativePlatform()`), the frontend stores these tokens
     (`src/utils/authToken.js`), sends `Authorization: Bearer <token>` on every
     `apiFetch`, and refreshes by POSTing `{ refresh_token }` to `/api/auth/refresh`
     (`src/utils/api.js`). Web stores nothing in JS and stays cookie-only.
   - The WebSocket (`/ws`) can't send an Authorization header from the browser
     API, so native passes the access token as `?token=` (`src/config.js`
     `wsUrl()`); the server accepts it in `server/events.js` `verifyClient`
     (refresh-type tokens are rejected).
   - On app restart, the boot session check (`/api/auth/me` in `src/App.jsx`)
     retries once after a token refresh, so the 15-minute access-token TTL
     doesn't log staff out between launches — the 30-day refresh token keeps the
     session alive on iOS, Android and Windows.
   - **CORS**: the production server always allows the fixed native shell
     origins (`https://localhost`, `capacitor://localhost`, `http://localhost`
     for Capacitor; `app://bundle` for Electron) with credentials. Additional
     browser origins can be added via `ALLOWED_ORIGIN` (comma-separated). See
     `server/index.js`.
   - You still need HTTPS in production. If you ever also want cookies to work
     cross-origin, set them `SameSite=None; Secure` — bearer auth makes this
     optional for native.

3. **Push notifications — plumbing implemented, provider setup is yours.**
   `@capacitor/push-notifications` registers the device and yields an FCM
   (Android/Web) / APNs (iOS) token; `src/native/push.js` requests permission and
   POSTs the token to `POST /api/push/register` (stored in the `device_tokens`
   table, migration 013). The server sends a push to `kitchen` staff on every new
   order, and to front-of-house roles (`staff`, `cashier`, `manager`, `admin`)
   when an order transitions to `ready` (`server/routes/orders.js` →
   `sendPushNotification`).
   **To actually deliver**, set the `FCM_SERVICE_ACCOUNT` env var on the deployed
   backend to your Firebase service-account JSON (see `server/integrations/push.js`).
   When it's unset, push is a logged no-op — safe everywhere, including Replit
   (Linux), which can't reach a real device or run the store toolchains. APNs for
   iOS is configured through Firebase (recommended) using the same code path.

4. **Capacitor is pinned to v7** (not v8) because Capacitor 8 requires Node ≥ 22
   and this environment runs Node 20. Keep Node 20 → stay on Capacitor 7. If you
   upgrade Node to 22+, you may move to Capacitor 8.

5. **Native project folders are committed; build outputs are not.** `android/`
   and `ios/` source projects are in git; generated outputs (`android/app/build`,
   `ios/App/Pods`, `release/`, etc.) are git-ignored — regenerate them with
   `cap sync` / a build.

6. **Code signing & notarization** (Apple notarization, Windows Authenticode)
   are your responsibility and require paid developer certificates.
