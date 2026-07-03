import React, { useState, useEffect } from 'react'
import OfflineBanner from './components/OfflineBanner.jsx'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Sidebar from './components/Sidebar.jsx'
import { canAccessRoute } from './utils/auth.js'
import { ToastProvider } from './context/ToastContext.jsx'
import { SettingsProvider } from './context/SettingsContext.jsx'
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
import TwoFactor from './components/TwoFactor.jsx'

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
        {/* Mobile top bar with hamburger */}
        <header className="md:hidden flex items-center gap-3 p-3 bg-slate-900 border-b border-slate-800 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-slate-800"
            aria-label="Open menu"
          >
            <span className="text-lg leading-none">☰</span>
          </button>
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-orange-500/30">
            A
          </div>
          <span className="text-white font-bold text-sm">Automatic</span>
        </header>
        <main className="flex-1 overflow-auto">
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/kitchen" element={<Kitchen />} />
              <Route path="/menu" element={<Menu />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/recipes" element={<Recipes />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/reports" element={<RequireRole routeId="reports" role={role}><Reports /></RequireRole>} />
              <Route path="/settings" element={<RequireRole routeId="settings" role={role}><Settings user={user} /></RequireRole>} />
              <Route path="/integrations" element={<RequireRole routeId="integrations" role={role}><Integrations /></RequireRole>} />
              <Route path="/notion" element={<RequireRole routeId="notion" role={role}><NotionIntegration /></RequireRole>} />
              <Route path="/ai-executive" element={<RequireRole routeId="ai-executive" role={role}><AIExecutive /></RequireRole>} />
              <Route path="/system" element={<RequireRole routeId="system" role={role}><System /></RequireRole>} />
              <Route path="/suppliers" element={<RequireRole routeId="suppliers" role={role}><Suppliers /></RequireRole>} />
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
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('auth_user')
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch { localStorage.removeItem('auth_user') }
    }
    // Validate the httpOnly-cookie session against the server
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setUser(data.user)
          localStorage.setItem('auth_user', JSON.stringify(data.user))
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
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch { /* ignore */ }
    setUser(null)
    localStorage.removeItem('auth_user')
  }

  const handlePasswordChanged = () => {
    const updated = { ...user, must_change_password: false }
    setUser(updated)
    localStorage.setItem('auth_user', JSON.stringify(updated))
  }

  if (!user) return (
    <ToastProvider>
      <Login onLogin={handleLogin} />
    </ToastProvider>
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
