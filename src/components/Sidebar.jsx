import React from 'react'
import { useSettings } from '../context/SettingsContext.jsx'

const NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',      icon: '◉' },
  { id: 'pos',          label: 'Point of Sale',   icon: '🛒' },
  { id: 'orders',       label: 'Orders',          icon: '📋' },
  { id: 'kitchen',      label: 'Kitchen',         icon: '👨‍🍳' },
  { id: 'menu',         label: 'Menu & Recipes',  icon: '🍽️' },
  { id: 'inventory',    label: 'Inventory',       icon: '📦' },
  { id: 'customers',    label: 'Customers',       icon: '👥' },
  { id: 'reports',      label: 'Reports',         icon: '📊' },
  { id: 'settings',     label: 'Settings',        icon: '⚙️', divider: true },
  { id: 'integrations', label: 'Integrations',    icon: '🔌' },
  { id: 'notion',       label: 'Notion Sync',     icon: '📓' },
]

const ROLE_COLORS = {
  admin:   'bg-red-500/20 text-red-400',
  manager: 'bg-orange-500/20 text-orange-400',
  cashier: 'bg-blue-500/20 text-blue-400',
  kitchen: 'bg-green-500/20 text-green-400',
  staff:   'bg-slate-700 text-slate-400',
}

export default function Sidebar({ currentPage, setCurrentPage, user, onLogout, isOpen, setIsOpen }) {
  const { lowStockCount, lowStockEnabled } = useSettings()
  const showLowStock = lowStockEnabled && lowStockCount > 0
  return (
    <aside className={`${isOpen ? 'w-64' : 'w-16'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 flex-shrink-0`}>
      <div className="p-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-lg shadow-orange-500/30">
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
          className="ml-auto text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0 text-xs"
          title={isOpen ? 'Collapse' : 'Expand'}
        >
          {isOpen ? '◀' : '▶'}
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => (
          <React.Fragment key={item.id}>
            {item.divider && <div className="border-t border-slate-800/70 my-2 mx-1" />}
            <button
              onClick={() => setCurrentPage(item.id)}
              title={!isOpen ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                currentPage === item.id
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <span className="relative text-base flex-shrink-0 leading-none">
                {item.icon}
                {item.id === 'inventory' && showLowStock && !isOpen && (
                  <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-slate-900" />
                )}
              </span>
              {isOpen && <span className="truncate">{item.label}</span>}
              {item.id === 'inventory' && showLowStock && isOpen && (
                <span
                  className="ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500/90 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0"
                  title={`${lowStockCount} item${lowStockCount === 1 ? '' : 's'} low on stock`}
                >
                  {lowStockCount > 99 ? '99+' : lowStockCount}
                </span>
              )}
              {isOpen && currentPage === item.id && !(item.id === 'inventory' && showLowStock) && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
              )}
            </button>
          </React.Fragment>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-800">
        {isOpen ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-orange-500/20 border border-orange-500/30 rounded-full flex items-center justify-center text-orange-300 text-xs font-bold flex-shrink-0">
                {user?.name?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs font-semibold truncate">{user?.name || 'Admin'}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[user?.role] || ROLE_COLORS.staff}`}>
                  {user?.role || 'staff'}
                </span>
              </div>
              <button
                onClick={onLogout}
                className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0 p-1 rounded hover:bg-red-500/10"
                title="Sign out"
              >
                ⏻
              </button>
            </div>
            <button
              onClick={() => setCurrentPage('change-password')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                currentPage === 'change-password'
                  ? 'text-orange-400 bg-orange-500/10'
                  : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <span>🔐</span>
              <span>Change Password</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setCurrentPage('change-password')}
              className="w-full flex justify-center text-slate-600 hover:text-orange-400 transition-colors py-1 rounded hover:bg-orange-500/10"
              title="Change Password"
            >
              🔐
            </button>
            <button
              onClick={onLogout}
              className="w-full flex justify-center text-slate-500 hover:text-red-400 transition-colors py-1.5 rounded hover:bg-red-500/10"
              title="Sign out"
            >
              ⏻
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
