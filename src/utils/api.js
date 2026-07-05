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
