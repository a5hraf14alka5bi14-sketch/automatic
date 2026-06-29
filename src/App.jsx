import React, { useState, useEffect } from 'react'
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
import Login from './pages/Login.jsx'

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [user, setUser] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('auth_user')
    if (stored) {
      setUser(JSON.parse(stored))
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

  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />
      case 'pos': return <POS />
      case 'orders': return <Orders />
      case 'kitchen': return <Kitchen />
      case 'inventory': return <Inventory />
      case 'customers': return <Customers />
      case 'reports': return <Reports />
      case 'menu': return <Menu />
      case 'integrations': return <Integrations />
      case 'notion': return <NotionIntegration />
      default: return <Dashboard />
    }
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
      <main className={`flex-1 overflow-auto transition-all duration-300 ${sidebarOpen ? 'ml-0' : 'ml-0'}`}>
        {renderPage()}
      </main>
    </div>
  )
}
