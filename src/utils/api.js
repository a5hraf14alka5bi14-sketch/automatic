export function getToken() {
  try {
    const stored = localStorage.getItem('auth_user')
    if (!stored) return null
    return JSON.parse(stored)?.token || null
  } catch {
    return null
  }
}

export async function apiFetch(url, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('auth_user')
    window.location.reload()
  }

  return res
}
