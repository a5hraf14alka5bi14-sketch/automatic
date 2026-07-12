// Global capture of the PWA `beforeinstallprompt` event.
//
// Chromium fires this event ONCE, early during page load — typically while the
// unauthenticated login screen is showing, long before the (post-login) Sidebar
// and its InstallButton mount. If we only listened from inside that component we
// would miss the event and the install button would never appear.
//
// So we attach the listener at module load. This module is imported at the very
// top of main.jsx (before React renders), guaranteeing the listener exists
// before the browser dispatches the event. The captured event is stored and
// handed to whatever component mounts later.

let deferredPrompt = null
const listeners = new Set()

function notify() {
  listeners.forEach((fn) => fn(deferredPrompt))
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar so we can trigger the prompt from our own button.
    e.preventDefault()
    deferredPrompt = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

/** The most recently captured install prompt event, or null. */
export function getInstallPrompt() {
  return deferredPrompt
}

/** Forget the current prompt (a prompt event can only be used once). */
export function clearInstallPrompt() {
  deferredPrompt = null
  notify()
}

/**
 * Subscribe to changes in the captured prompt. Fires immediately is NOT done
 * here — read getInstallPrompt() for the initial value. Returns an unsubscribe.
 */
export function subscribeInstallPrompt(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
