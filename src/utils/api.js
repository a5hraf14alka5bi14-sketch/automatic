import { apiUrl } from '../config.js'
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './authToken.js'

let refreshPromise = null

export async function tryRefresh() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      // Native shells send the refresh token in the body (no cookie); web relies
      // on the httpOnly refresh cookie. Both may be present harmlessly.
      const refresh_token = getRefreshToken()
      const res = await fetch(apiUrl('/api/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: refresh_token ? JSON.stringify({ refresh_token }) : undefined,
      })
      if (!res.ok) return false
      // On native, persist the rotated tokens so subsequent calls stay authed.
      try {
        const data = await res.clone().json()
        if (data?.token) setTokens({ token: data.token, refresh_token: data.refresh_token })
      } catch { /* body may be empty on web — cookies already rotated */ }
      return true
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

// A 403 carrying `mustChangePassword` means an admin has flagged this account and
// the server's enforcePasswordChange middleware is now blocking every protected
// route. Detect it (cloning so the caller can still read the body) and flip the
// cached user so App re-renders the forced password-change screen immediately.
async function isMustChangePassword(res) {
  if (res.status !== 403) return false
  try {
    const data = await res.clone().json()
    return data?.mustChangePassword === true
  } catch {
    return false
  }
}

function forceChangePassword() {
  try {
    const stored = localStorage.getItem('auth_user')
    if (stored) {
      const user = JSON.parse(stored)
      user.must_change_password = true
      localStorage.setItem('auth_user', JSON.stringify(user))
    }
  } catch { /* ignore malformed cache */ }
  window.location.reload()
}

// Costly integration endpoints (Notion/GitHub sync, OpenAI summary/chat) are
// rate-limited server-side to 10 req/min per user. On breach the backend returns
// a 429 with `{ error, retry_after_seconds }`. This helper detects that case so
// the UI can show a friendly cooldown message instead of a generic failure.
// Returns the retry window in seconds when rate-limited, otherwise null.
export async function getRateLimit(res) {
  if (!res || res.status !== 429) return null
  // Only treat a 429 as the app's own cooldown limiter when it carries explicit
  // limiter metadata (retry_after_seconds body field or Retry-After header).
  // Upstream provider errors (e.g. OpenAI quota exhausted) are also relayed as
  // 429 but WITHOUT that metadata — those must fall through so the caller can
  // read and display the specific error message instead of a cooldown toast.
  let retryAfter = 0
  try {
    const data = await res.clone().json()
    if (Number.isFinite(data?.retry_after_seconds)) retryAfter = data.retry_after_seconds
  } catch { /* fall through to header check */ }
  if (retryAfter <= 0) {
    const header = Number(res.headers.get('Retry-After'))
    if (Number.isFinite(header) && header > 0) retryAfter = header
  }
  if (retryAfter <= 0) return null
  return Math.max(1, Math.ceil(retryAfter))
}

export async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  // Native shells attach the bearer token (web uses the httpOnly cookie).
  const access = getAccessToken()
  if (access && !headers.Authorization) headers.Authorization = `Bearer ${access}`
  const opts = { credentials: 'include', ...options, headers }

  let res = await fetch(apiUrl(url), opts)

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      // Re-read the (possibly rotated) native token for the retry.
      const fresh = getAccessToken()
      if (fresh) opts.headers.Authorization = `Bearer ${fresh}`
      res = await fetch(apiUrl(url), opts)
    } else {
      clearTokens()
      localStorage.removeItem('auth_user')
      window.location.reload()
      return res
    }
  }

  if (await isMustChangePassword(res)) {
    forceChangePassword()
  }

  return res
}
