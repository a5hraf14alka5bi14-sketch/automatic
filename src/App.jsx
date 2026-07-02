import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Sidebar from './components/Sidebar.jsx'
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

function AppLayout({ user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

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
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings user={user} />} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/notion" element={<NotionIntegration />} />
              <Route path="/ai-executive" element={<AIExecutive />} />
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

  if (!user) return (
    <ToastProvider>
      <Login onLogin={handleLogin} />
    </ToastProvider>
  )

  return (
    <BrowserRouter>
      <ToastProvider>
        <SettingsProvider>
          <AppLayout user={user} onLogout={handleLogout} />
        </SettingsProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
