import React from 'react'
import { CATS } from './constants.js'
import NativeScanButton from '../NativeScanButton.jsx'

export default function MenuPanel({
  menu, cartCount, setView, searchRef, search, setSearch,
  selectedCategory, setSelectedCategory, loading, filtered,
  cart, handleItemClick, modifierLoading, fmtC, stockAvail = {},
  onScan,
}) {
  return (
    <div className="flex-1 p-3 sm:p-5 overflow-auto flex flex-col min-w-0">
      {/* Top bar — mobile: title row + full-width search below; desktop: title left, Tables + compact search right */}
      <div className="mb-3 md:mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 md:flex-none">
            <h1 className="text-lg sm:text-xl font-bold text-white leading-tight">Point of Sale</h1>
            <p className="text-slate-400 text-xs md:mt-0.5">{menu.length} items{cartCount > 0 ? ` · ${cartCount} in cart` : ''}</p>
          </div>
          {/* Tables button — mobile position (next to title) */}
          <button onClick={() => setView('tables')}
            className="md:hidden h-10 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0">
            🪑
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Tables button — desktop position (right group, with label) */}
          <button onClick={() => setView('tables')}
            className="hidden md:flex px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors items-center gap-1.5 flex-shrink-0">
            🪑 Tables
          </button>
          <div className="relative flex-1 md:flex-none">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…"
              className="w-full md:w-48 bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-8 py-2.5 md:py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-sm">✕</button>
            )}
          </div>
          <NativeScanButton onScan={onScan} />
        </div>
      </div>

      {/* Category tabs — horizontal scroll on mobile, wrap on desktop */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto md:overflow-visible pb-1 md:pb-0 flex-nowrap md:flex-wrap flex-shrink-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {CATS.map(cat => (
          <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-2 md:py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0 ${
              selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}>
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      {/* Menu grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-slate-500 text-sm">No items found</p>
            {search && <button onClick={() => setSearch('')} className="text-orange-400 text-xs mt-1 hover:underline">Clear search</button>}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(item => {
            const cartQty = cart.filter(c => c.id === item.id).reduce((s, c) => s + c.qty, 0)
            const max = stockAvail[item.id] // undefined/null = untracked (unlimited)
            const tracked = max != null
            const remaining = tracked ? max - cartQty : null
            const out = tracked && max <= 0
            const low = tracked && !out && remaining <= 5
            return (
              <button key={item.id} onClick={() => handleItemClick(item)}
                disabled={modifierLoading}
                className={`bg-slate-900 border rounded-xl p-4 text-left hover:border-orange-500/50 transition-all group relative ${
                  out ? 'border-red-500/50 bg-red-500/5' : cartQty > 0 ? 'border-orange-500/40 bg-orange-500/5' : 'border-slate-800'
                }`}>
                {cartQty > 0 && (
                  <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-lg">
                    {cartQty}
                  </div>
                )}
                <p className="text-white font-semibold text-sm leading-tight">{item.name}</p>
                {item.name_ar && <p className="text-slate-400 text-xs leading-tight mt-0.5" dir="rtl">{item.name_ar}</p>}
                <p className="text-orange-400 font-bold text-sm mt-2">{fmtC(item.price)}</p>
                <div className="flex items-center gap-2 mt-1">
                  {item.prep_time && <p className="text-slate-600 text-xs">⏱ {item.prep_time}m</p>}
                  {out
                    ? <span className="text-red-400 text-xs font-semibold">نفد المخزون</span>
                    : low && <span className="text-amber-400 text-xs font-medium">متبقّي {remaining}</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
