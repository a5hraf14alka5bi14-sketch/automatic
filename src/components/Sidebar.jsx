import React from 'react'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '◉' },
  { id: 'pos', label: 'Point of Sale', icon: '🛒' },
  { id: 'orders', label: 'Orders', icon: '📋' },
  { id: 'kitchen', label: 'Kitchen', icon: '👨‍🍳' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'customers', label: 'Customers', icon: '👥' },
  { id: 'reports', label: 'Reports', icon: '📊' },
  { id: 'integrations', label: 'Integrations', icon: '🔌', divider: true },
  { id: 'notion', label: 'Notion Sync', icon: '📓' },
]

export default function Sidebar({ currentPage, setCurrentPage, user, onLogout, isOpen, setIsOpen }) {
  return (
    <aside className={`${isOpen ? 'w-64' : 'w-16'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 flex-shrink-0`}>
      <div className="p-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          A
        </div>
        {isOpen && (
          <div className="min-w-0">
            <h1 className="text-white font-bold text-sm truncate">Automatic</h1>
            <p className="text-slate-400 text-xs truncate">Restaurant OS</p>
          </div>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="ml-auto text-slate-400 hover:text-white transition-colors flex-shrink-0"
        >
          {isOpen ? '◀' : '▶'}
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => (
          <React.Fragment key={item.id}>
            {item.divider && (
              <div className={`border-t border-slate-800 my-2 ${isOpen ? '' : ''}`} />
            )}
            <button
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                currentPage === item.id
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {isOpen && <span className="truncate">{item.label}</span>}
            </button>
          </React.Fragment>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-800">
        {isOpen ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-medium truncate">{user?.name || 'Admin'}</p>
              <p className="text-slate-400 text-xs truncate">{user?.role || 'Manager'}</p>
            </div>
            <button
              onClick={onLogout}
              className="text-slate-400 hover:text-red-400 transition-colors text-xs flex-shrink-0"
              title="Logout"
            >
              ⏻
            </button>
          </div>
        ) : (
          <button
            onClick={onLogout}
            className="w-full flex justify-center text-slate-400 hover:text-red-400 transition-colors py-1"
            title="Logout"
          >
            ⏻
          </button>
        )}
      </div>
    </aside>
  )
}
