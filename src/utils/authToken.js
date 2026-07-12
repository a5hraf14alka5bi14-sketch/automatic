// Bearer-token storage for NATIVE shells (Capacitor iOS/Android, Electron).
//
// On the web, auth rides on httpOnly SameSite=Lax cookies and these helpers are
// intentionally inert — we never store the JWT in JS-readable storage in the
// browser (that would widen the XSS blast radius). In a native shell the
// frontend origin differs from the API origin, so the cookies are never sent;
// the app instead stores the tokens returned by /login (and rotated by
// /refresh) and sends them as `Authorization: Bearer` + the WS `?token=` param.
import { isNativePlatform, isDesktop } from '../config.js'

const ACCESS_KEY = 'auth_access_token'
const REFRESH_KEY = 'auth_refresh_token'

// Only persist/read tokens on native shells — Capacitor (iOS/Android) AND
// Electron (Windows desktop). Both load from a different origin than the API, so
// the SameSite=Lax auth cookies aren't sent and they need bearer tokens. The
// plain web build keeps stealth strictly cookie-based (nothing in JS storage).
function enabled() {
  return isNativePlatform() || isDesktop()
}

export function getAccessToken() {
  if (!enabled()) return null
  try { return localStorage.getItem(ACCESS_KEY) } catch { return null }
}

export function getRefreshToken() {
  if (!enabled()) return null
  try { return localStorage.getItem(REFRESH_KEY) } catch { return null }
}

export function setTokens({ token, refresh_token } = {}) {
  if (!enabled()) return
  try {
    if (token) localStorage.setItem(ACCESS_KEY, token)
    if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token)
  } catch { /* storage unavailable — ignore */ }
}

export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch { /* ignore */ }
}
