import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

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
