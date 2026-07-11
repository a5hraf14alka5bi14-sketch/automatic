import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Side-effect import: starts capturing the PWA `beforeinstallprompt` event
// before React renders, so the (post-login) install button never misses it.
import './utils/installPrompt.js'
import * as Sentry from '@sentry/react'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
    integrations: [],
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Gracefully fade out the branded loading splash (in index.html) once the app
// has mounted, instead of letting it vanish instantly. A short minimum display
// time keeps the logo's fade-in visible even on very fast loads.
;(() => {
  const splash = document.getElementById('app-splash')
  if (!splash) return
  const MIN_VISIBLE_MS = 450
  const FADE_MS = 400
  const start = performance.now()
  const dismiss = () => {
    const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - start))
    setTimeout(() => {
      splash.classList.add('app-splash--hide')
      setTimeout(() => splash.remove(), FADE_MS)
    }, wait)
  }
  // Wait for the first painted frame so we fade out onto real UI, not a blank.
  requestAnimationFrame(() => requestAnimationFrame(dismiss))
})()

// Register the service worker so the app is installable on iPhone, Android and
// Windows and keeps working (app shell) when the connection drops.
// When a new version is deployed the SW calls skipWaiting()/clients.claim(),
// which fires `controllerchange`. We reload once (only if a controller already
// existed) so installed phones/desktops never get stuck on a stale build.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !hadController) return
      refreshing = true
      window.location.reload()
    })
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => { reg.update?.() })
      .catch(() => {})
  })
}
