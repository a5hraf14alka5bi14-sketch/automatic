let refreshPromise = null

async function tryRefresh() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      return res.ok
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
  let retryAfter = 0
  try {
    const data = await res.clone().json()
    if (Number.isFinite(data?.retry_after_seconds)) retryAfter = data.retry_after_seconds
  } catch { /* fall through to header / default */ }
  if (retryAfter <= 0) {
    const header = Number(res.headers.get('Retry-After'))
    if (Number.isFinite(header) && header > 0) retryAfter = header
  }
  return Math.max(1, Math.ceil(retryAfter || 60))
}

export async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const opts = { credentials: 'include', ...options, headers }

  let res = await fetch(url, opts)

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      res = await fetch(url, opts)
    } else {
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
