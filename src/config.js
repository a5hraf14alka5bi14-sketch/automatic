// Centralized runtime configuration for API + WebSocket endpoints.
//
// On the web the frontend is served from the same origin as the Express API,
// so a relative base ('') is correct and nothing changes. Native shells
// (Capacitor iOS/Android, Electron Windows) load the built assets from
// capacitor://localhost / file://, where relative '/api' and location.host
// no longer point at the backend. Those builds bake in the deployed backend
// origin via VITE_API_BASE_URL (e.g. https://your-app.replit.app).

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim()

// Normalize: strip any trailing slash so apiUrl('/api/...') never doubles up.
export const API_BASE = RAW_BASE.replace(/\/+$/, '')

// Build an absolute (or same-origin relative) URL for an API path.
export function apiUrl(path = '') {
  const p = path.startsWith('/') ? path : `/${path}`
  return API_BASE ? `${API_BASE}${p}` : p
}

// Build the WebSocket URL. When a backend base is configured we derive the
// ws(s) origin from it; otherwise fall back to the page origin (web).
// On native shells the WS is authenticated with a `?token=` query param, since
// cookies aren't sent cross-origin and the browser WebSocket API can't set an
// Authorization header. (Read inline to avoid a circular import with authToken.)
export function wsUrl(path = '/ws') {
  const p = path.startsWith('/') ? path : `/${path}`
  let base
  if (API_BASE) {
    base = `${API_BASE.replace(/^http/, 'ws')}${p}`
  } else if (typeof location !== 'undefined') {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    base = `${proto}//${location.host}${p}`
  } else {
    return p
  }
  if (isNativePlatform() || isDesktop()) {
    let token = null
    try { token = localStorage.getItem('auth_access_token') } catch { /* ignore */ }
    if (token) base += `${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
  }
  return base
}

// True when running inside a Capacitor native shell (iOS/Android).
export function isNativePlatform() {
  return typeof window !== 'undefined'
    && !!window.Capacitor
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform()
}

// True when running inside the Electron desktop shell.
export function isDesktop() {
  return typeof window !== 'undefined' && !!window.desktop?.isElectron
}

// Fire a native OS notification. On Electron it routes through the preload
// bridge; on the web/PWA it falls back to the Notification API when granted.
// Silently no-ops when notifications aren't available/permitted.
export function notifyDesktop(title, body) {
  try {
    if (typeof window !== 'undefined' && window.desktop?.notify) {
      window.desktop.notify(title, body)
      return
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body })
    }
  } catch { /* notifications unavailable — ignore */ }
}
