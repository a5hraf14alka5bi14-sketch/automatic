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
