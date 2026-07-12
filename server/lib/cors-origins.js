// Production CORS origin policy, extracted pure so it can be unit-tested.
//
// The built web frontend is served same-origin, so browsers never need CORS.
// Native shells load the bundled frontend from their own fixed origin and call
// the API cross-origin with a bearer token, so those origins are always
// allowed. Extra browser origins can be granted via the ALLOWED_ORIGIN env var
// (comma-separated).

export const NATIVE_ORIGINS = new Set([
  'https://localhost',      // Capacitor iOS/Android (server.iosScheme/androidScheme = https)
  'capacitor://localhost',  // Capacitor default scheme (older configs)
  'http://localhost',       // Capacitor Android http scheme fallback
  'app://bundle',           // Electron desktop shell (APP_ORIGIN in electron/main.js)
])

export function parseExtraOrigins(envValue = '') {
  return new Set(String(envValue || '').split(',').map((s) => s.trim()).filter(Boolean))
}

export function isAllowedOrigin(origin, extraOrigins = new Set()) {
  return !!origin && (NATIVE_ORIGINS.has(origin) || extraOrigins.has(origin))
}
