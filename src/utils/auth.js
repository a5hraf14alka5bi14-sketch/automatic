export function useRole() {
  try {
    const user = JSON.parse(localStorage.getItem('auth_user') || '{}')
    return user.role || 'cashier'
  } catch {
    return 'cashier'
  }
}

export function canManage(role) {
  return role === 'admin' || role === 'manager'
}

export function canAdmin(role) {
  return role === 'admin'
}

// Which roles may access each management route (frontend route guard).
// Routes not listed here are available to any authenticated user; mutations
// on those pages are still gated in the UI and enforced by the backend.
export const ROUTE_ROLES = {
  reports: ['admin', 'manager'],
  settings: ['admin', 'manager'],
  integrations: ['admin', 'manager'],
  notion: ['admin', 'manager'],
  'ai-executive': ['admin', 'manager'],
  system: ['admin'],
  suppliers: ['admin', 'manager'],
  profile: ['admin', 'manager', 'cashier', 'kitchen', 'staff'],
}

export function canAccessRoute(routeId, role) {
  const allowed = ROUTE_ROLES[routeId]
  return !allowed || allowed.includes(role)
}
