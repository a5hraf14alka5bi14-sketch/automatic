---
name: PWA install prompt timing
description: Why the "Install this app" button must capture beforeinstallprompt at app load, not in the component
---

# PWA `beforeinstallprompt` capture timing

Chromium fires `beforeinstallprompt` **once, early during page load** — for this
app that is while the unauthenticated login screen is showing, long before the
post-login Sidebar (and its `InstallButton`) mount.

**Rule:** capture the event in a module-level listener imported before React
renders (`src/utils/installPrompt.js`, imported at the top of `src/main.jsx`),
store the deferred event, and let the button consume it via
`getInstallPrompt()` + `subscribeInstallPrompt()`. A prompt event can only be
used once — call `clearInstallPrompt()` after `.prompt()`.

**Why:** if the listener lives inside the (late-mounting) button component, the
event has already fired and been discarded, so the install button silently never
appears on Chromium — the user would have to full-reload after login. This was
flagged in code review and is the whole reason the capture is app-level.

**How to apply:** any new PWA install/AB-install UI must read the shared module,
never attach its own `beforeinstallprompt` listener. iOS Safari has no prompt
API at all — detect iOS and show manual "Share → Add to Home Screen" steps.
