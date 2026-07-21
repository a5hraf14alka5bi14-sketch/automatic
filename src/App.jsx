import React, { useState, useEffect } from 'react'
import OfflineBanner from './components/OfflineBanner.jsx'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Sidebar from './components/Sidebar.jsx'
import MobileNav from './components/MobileNav.jsx'
import { canAccessRoute } from './utils/auth.js'
import { apiUrl } from './config.js'
import { getAccessToken, clearTokens } from './utils/authToken.js'
import { tryRefresh } from './utils/api.js'
import { initNativePush } from './native/push.js'
import { ToastProvider } from './context/ToastContext.jsx'
import { useToast } from './context/ToastContext.jsx'
import { SettingsProvider } from './context/SettingsContext.jsx'
import { useLiveEvents } from './utils/useLiveEvents.js'
import Dashboard from './pages/Dashboard.jsx'
import POS from './pages/POS.jsx'
import Orders from './pages/Orders.jsx'
import Kitchen from './pages/Kitchen.jsx'
import Inventory from './pages/Inventory.jsx'
import Recipes from './pages/Recipes.jsx'
import Customers from './pages/Customers.jsx'
import Reports from './pages/Reports.jsx'
import NotionIntegration from './pages/NotionIntegration.jsx'
import Integrations from './pages/Integrations.jsx'
import Menu from './pages/Menu.jsx'
import Settings from './pages/Settings.jsx'
import ChangePassword from './pages/ChangePassword.jsx'
import Login from './pages/Login.jsx'
import AIExecutive from './pages/AIExecutive.jsx'
import System from './pages/System.jsx'
import Suppliers from './pages/Suppliers.jsx'
import Expenses from './pages/Expenses.jsx'
import TwoFactor from './components/TwoFactor.jsx'
import QRMenu from './pages/QRMenu.jsx'
import Reservations from './pages/Reservations.jsx'
import PublicReceipt from './pages/PublicReceipt.jsx'
import SupportTicketButton from './components/SupportTicketButton.jsx'

function RequireRole({ routeId, role, children }) {
  if (!canAccessRoute(routeId, role)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

function AppLayout({ user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const role = user?.role
  const showToast = useToast()

  // Real-time discount alerts — visible only to admin and manager roles.
  // Fire-and-forget from the cashier side; the WebSocket delivers the event
  // to every connected admin/manager without any polling.
  useLiveEvents((msg) => {
    if (role !== 'admin' && role !== 'manager') return
    const d = msg.data || {}
    const who = d.cashierName || d.cashierEmail || 'Unknown'
    const discountStr = d.discountType === 'percent'
      ? `${d.discountInput}% (${Number(d.discountAmt).toFixed(3)} OMR)`
      : `${Number(d.discountAmt).toFixed(3)} OMR`
    const branch = d.branchId ? ` · Branch #${d.branchId}` : ''
    showToast(
      `Discount applied — ${who} · Order #${d.orderId} · ${discountStr}${branch}`,
      'warning',
      8000
    )
  }, ['discount_applied'])

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar
        user={user}
        onLogout={onLogout}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar — minimal branding strip. Hamburger removed since
            bottom nav has a "More" button to open the full sidebar drawer.
            header-safe: adds env(safe-area-inset-top) so content clears the
            notch / Dynamic Island on modern iPhones. */}
        <header className="md:hidden flex items-center gap-2.5 px-4 pb-3 header-safe bg-slate-900 border-b border-slate-800 flex-shrink-0">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-orange-500/30 flex-shrink-0">
            A
          </div>
          <span className="text-white font-semibold text-sm flex-1">الأوتوماتيك اللبناني</span>
          <span className="text-slate-500 text-xs">{user?.name}</span>
        </header>
        {/* pb-nav on mobile clears the fixed bottom nav (3.5 rem) + safe area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-nav md:pb-safe">
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/kitchen" element={<Kitchen />} />
              <Route path="/menu" element={<Menu />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/recipes" element={<RequireRole routeId="recipes" role={role}><Recipes /></RequireRole>} />
              <Route path="/customers" element={<RequireRole routeId="customers" role={role}><Customers /></RequireRole>} />
              <Route path="/reports" element={<RequireRole routeId="reports" role={role}><Reports /></RequireRole>} />
              <Route path="/settings" element={<RequireRole routeId="settings" role={role}><Settings user={user} /></RequireRole>} />
              <Route path="/integrations" element={<RequireRole routeId="integrations" role={role}><Integrations /></RequireRole>} />
              <Route path="/notion" element={<RequireRole routeId="notion" role={role}><NotionIntegration /></RequireRole>} />
              <Route path="/ai-executive" element={<RequireRole routeId="ai-executive" role={role}><AIExecutive /></RequireRole>} />
              <Route path="/system" element={<RequireRole routeId="system" role={role}><System /></RequireRole>} />
              <Route path="/suppliers" element={<RequireRole routeId="suppliers" role={role}><Suppliers /></RequireRole>} />
              <Route path="/expenses" element={<RequireRole routeId="expenses" role={role}><Expenses /></RequireRole>} />
              <Route path="/reservations" element={<RequireRole routeId="reservations" role={role}><Reservations /></RequireRole>} />
              <Route path="/profile" element={<div className="p-6 max-w-lg mx-auto space-y-6">
                <div><h1 className="text-2xl font-bold text-white">Account Security</h1><p className="text-slate-400 text-sm mt-0.5">أمان الحساب</p></div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6"><h2 className="text-white font-semibold mb-4">Two-Factor Authentication</h2><TwoFactor /></div>
              </div>} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
      {/* Floating support ticket button — available to all authenticated roles */}
      <SupportTicketButton user={user} />
      {/* Bottom navigation — mobile only, sits above iOS home indicator */}
      <MobileNav user={user} onMore={() => setMobileOpen(true)} />
    </div>
  )
}

export default function App() {
  // ── Public pages — always accessible without authentication ──────────────
  // Check before any auth state is loaded so the QR menu works even when
  // no user is logged in (e.g. customer scans a QR code at the table).
  if (typeof window !== 'undefined' && window.location.pathname === '/qr-menu') {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/qr-menu" element={<QRMenu />} />
        </Routes>
      </BrowserRouter>
    )
  }

  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/receipt/')) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/receipt/:token" element={<PublicReceipt />} />
        </Routes>
      </BrowserRouter>
    )
  }

  const [user, setUser] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('auth_user')
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch { localStorage.removeItem('auth_user') }
    }
    // Validate the session against the server. Web uses the httpOnly cookie;
    // native shells attach the stored bearer token.
    ;(async () => {
      try {
        const fetchMe = () => {
          const access = getAccessToken()
          return fetch(apiUrl('/api/auth/me'), {
            credentials: 'include',
            headers: access ? { Authorization: `Bearer ${access}` } : {},
          })
        }
        let res = await fetchMe()
        // The short-lived access token has usually expired by the time a native
        // app is reopened (15m TTL). Try the long-lived refresh token once and
        // retry, so sessions survive app restarts instead of dropping to login.
        if (res.status === 401 && (await tryRefresh())) {
          res = await fetchMe()
        }
        if (res.ok) {
          const data = await res.json()
          setUser(data.user)
          localStorage.setItem('auth_user', JSON.stringify(data.user))
          initNativePush()
        } else {
          setUser(null)
          localStorage.removeItem('auth_user')
        }
      } catch { /* offline — keep cached user */ }
    })()
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
    localStorage.setItem('auth_user', JSON.stringify(userData))
    initNativePush()
  }

  const handleLogout = async () => {
    try {
      await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' })
    } catch { /* ignore */ }
    clearTokens()
    setUser(null)
    localStorage.removeItem('auth_user')
  }

  const handlePasswordChanged = () => {
    const updated = { ...user, must_change_password: false }
    setUser(updated)
    localStorage.setItem('auth_user', JSON.stringify(updated))
  }

  if (!user) return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Login onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )

  // Force a password change before granting access to the rest of the app
  // (e.g. the seeded default admin account).
  if (user.must_change_password) return (
    <ToastProvider>
      <ForcePasswordChange user={user} onDone={handlePasswordChanged} onLogout={handleLogout} />
    </ToastProvider>
  )

  return (
    <BrowserRouter>
      <ToastProvider>
        <SettingsProvider>
          <OfflineBanner />
          <AppLayout user={user} onLogout={handleLogout} />
        </SettingsProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

function ForcePasswordChange({ user, onDone, onLogout }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">Set a new password</h1>
          <p className="text-slate-400 text-sm mt-1">
            For security, {user?.name || 'your account'} must replace the default password before continuing.
          </p>
        </div>
        <ChangePassword forced onChanged={onDone} />
        <button
          onClick={onLogout}
          className="w-full mt-4 text-slate-500 hover:text-red-400 text-sm transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
