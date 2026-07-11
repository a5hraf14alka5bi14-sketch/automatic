import React from 'react'
import { NavLink } from 'react-router-dom'
import { canAccessRoute } from '../utils/auth.js'

const BOTTOM_NAV = [
  { id: 'pos',       label: 'POS',      icon: '🛒' },
  { id: 'kitchen',   label: 'Kitchen',  icon: '👨‍🍳' },
  { id: 'orders',    label: 'Orders',   icon: '📋' },
  { id: 'dashboard', label: 'Home',     icon: '◉' },
]

export default function MobileNav({ user, onMore }) {
  const items = BOTTOM_NAV.filter(item => canAccessRoute(item.id, user?.role))

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-900 border-t border-slate-800 flex items-stretch bnav-safe" style={{ height: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}>
      {items.map(item => (
        <NavLink
          key={item.id}
          to={`/${item.id}`}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 text-[10px] font-semibold transition-colors min-w-0 ${
              isActive ? 'text-orange-400' : 'text-slate-500'
            }`
          }
        >
          <span className="text-xl leading-none">{item.icon}</span>
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
      <button
        onClick={onMore}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 text-[10px] font-semibold text-slate-500 active:text-white transition-colors"
      >
        <span className="text-xl leading-none">☰</span>
        <span>More</span>
      </button>
    </nav>
  )
}
