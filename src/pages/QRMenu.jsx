/**
 * QRMenu — public customer-facing menu page, no authentication required.
 * Served at /qr-menu. Customers scan a QR code that links here and see
 * the full active menu with bilingual (Arabic / English) names and prices.
 */

import React, { useEffect, useState } from 'react'

const API_BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL
  : ''

async function fetchJson(path) {
  const r = await fetch(`${API_BASE}${path}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export default function QRMenu() {
  const [categories, setCategories]   = useState([])
  const [restaurantName, setName]     = useState('Restaurant')
  const [currency, setCurrency]       = useState('OMR')
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [search, setSearch]           = useState('')
  const [activeCategory, setCategory] = useState(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [menuData, settingsData] = await Promise.all([
          fetchJson('/api/public/menu'),
          fetchJson('/api/public/settings'),
        ])
        setCategories(menuData.categories || [])
        setName(settingsData.restaurant_name || 'Restaurant')
        setCurrency(settingsData.currency_symbol || 'OMR')
      } catch (e) {
        setError('Unable to load menu. Please try again.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const q = search.trim().toLowerCase()
  const visibleCategories = categories
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item =>
        !activeCategory || activeCategory === cat.category
      ).filter(item =>
        !q ||
        item.name?.toLowerCase().includes(q) ||
        item.name_ar?.includes(q) ||
        item.description?.toLowerCase().includes(q)
      ),
    }))
    .filter(cat => cat.items.length > 0)

  return (
    <div className="min-h-screen bg-slate-950 text-white" dir="auto">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-orange-500/30 flex-shrink-0">
              A
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">{restaurantName}</h1>
              <p className="text-slate-500 text-xs">Menu · قائمة الطعام</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm select-none">🔍</span>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search menu…  / ابحث في القائمة"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          {/* Category pills */}
          {!loading && categories.length > 0 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setCategory(null)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  !activeCategory
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-transparent border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                All · الكل
              </button>
              {categories.map(cat => (
                <button
                  key={cat.category}
                  onClick={() => setCategory(activeCategory === cat.category ? null : cat.category)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    activeCategory === cat.category
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-transparent border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {cat.category}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pb-12">
        {loading && (
          <div className="flex flex-col items-center justify-center pt-24 gap-3">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Loading menu…</p>
          </div>
        )}

        {error && !loading && (
          <div className="mt-12 text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-xl transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && visibleCategories.length === 0 && (
          <div className="mt-16 text-center text-slate-500">
            <p className="text-4xl mb-3">🍽️</p>
            <p className="text-sm">No items found</p>
          </div>
        )}

        {!loading && !error && visibleCategories.map(cat => (
          <section key={cat.category} className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-white font-bold text-base">{cat.category}</h2>
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-slate-600 text-xs">{cat.items.length} items</span>
            </div>

            <div className="space-y-3">
              {cat.items.map(item => (
                <div
                  key={item.id}
                  className="flex items-start gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 transition-colors"
                >
                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm leading-snug">{item.name}</p>
                    {item.name_ar && (
                      <p className="text-slate-400 text-xs mt-0.5 text-right leading-snug" dir="rtl">
                        {item.name_ar}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-slate-500 text-xs mt-1.5 leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Price badge */}
                  <div className="flex-shrink-0 text-right">
                    <span className="inline-block bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold text-sm rounded-xl px-3 py-1 whitespace-nowrap">
                      {currency} {Number(item.price).toFixed(3)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      {!loading && (
        <div className="text-center py-8 border-t border-slate-900">
          <p className="text-slate-700 text-xs">
            Powered by Automatic Restaurant OS
          </p>
        </div>
      )}
    </div>
  )
}
