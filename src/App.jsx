import React, { useState, useEffect } from 'react'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import POS from './pages/POS.jsx'
import Orders from './pages/Orders.jsx'
import Kitchen from './pages/Kitchen.jsx'
import Inventory from './pages/Inventory.jsx'
import Customers from './pages/Customers.jsx'
import Reports from './pages/Reports.jsx'
import NotionIntegration from './pages/NotionIntegration.jsx'
import Integrations from './pages/Integrations.jsx'
import Menu from './pages/Menu.jsx'
import Settings from './pages/Settings.jsx'
import Login from './pages/Login.jsx'

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [user, setUser] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('auth_user')
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch { localStorage.removeItem('auth_user') }
    }
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
    localStorage.setItem('auth_user', JSON.stringify(userData))
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('auth_user')
    setCurrentPage('dashboard')
  }

  if (!user) return <Login onLogin={handleLogin} />

  const pages = {
    dashboard:    <Dashboard />,
    pos:          <POS />,
    orders:       <Orders />,
    kitchen:      <Kitchen />,
    inventory:    <Inventory />,
    customers:    <Customers />,
    reports:      <Reports />,
    menu:         <Menu />,
    settings:     <Settings user={user} />,
    integrations: <Integrations />,
    notion:       <NotionIntegration />,
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        user={user}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />
      <main className="flex-1 overflow-auto">
        <ErrorBoundary key={currentPage}>
          {pages[currentPage] || <Dashboard />}
        </ErrorBoundary>
      </main>
    </div>
  )
}
