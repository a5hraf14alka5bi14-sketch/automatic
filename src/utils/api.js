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

export async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const opts = { credentials: 'include', ...options, headers }

  let res = await fetch(url, opts)

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      return fetch(url, opts)
    }
    localStorage.removeItem('auth_user')
    window.location.reload()
    return res
  }

  return res
}
