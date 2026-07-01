export function getToken() {
  try {
    const stored = localStorage.getItem('auth_user')
    return stored ? JSON.parse(stored)?.token || null : null
  } catch { return null }
}

export function getRefreshToken() {
  try {
    const stored = localStorage.getItem('auth_user')
    return stored ? JSON.parse(stored)?.refresh_token || null : null
  } catch { return null }
}

function updateStoredToken(newToken, newRefresh) {
  try {
    const stored = localStorage.getItem('auth_user')
    if (!stored) return
    const parsed = JSON.parse(stored)
    parsed.token = newToken
    if (newRefresh) parsed.refresh_token = newRefresh
    localStorage.setItem('auth_user', JSON.stringify(parsed))
  } catch {}
}

let refreshPromise = null

async function tryRefresh() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      })
      if (!res.ok) return false
      const { token, refresh_token } = await res.json()
      updateStoredToken(token, refresh_token)
      return token
    } catch { return false }
    finally { refreshPromise = null }
  })()
  return refreshPromise
}

export async function apiFetch(url, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { ...options, headers })

  if (res.status === 401) {
    const newToken = await tryRefresh()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      return fetch(url, { ...options, headers })
    }
    localStorage.removeItem('auth_user')
    window.location.reload()
    return res
  }

  return res
}
