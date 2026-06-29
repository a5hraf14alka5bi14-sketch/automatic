import React, { useState, useEffect } from 'react'

const CAT_EMOJI = {
  all: '🍽️', shawarma: '🌯', grills: '🔥', appetizers: '🥙',
  salads: '🥗', sandwiches: '🥪', meals: '🍱', manakish: '🫓',
  desserts: '🍮', drinks: '🥤', starters: '🥙', mains: '🍖',
  breakfast: '🫓', wraps: '🥪',
}

export default function POS() {
  const [menu, setMenu] = useState([])
  const [cart, setCart] = useState([])
  const [orderType, setOrderType] = useState('dine-in')
  const [tableNum, setTableNum] = useState('')
  const [loading, setLoading] = useState(true)
  const [placing, setPlacing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    fetch('/api/menu')
      .then(r => r.json())
      .then(data => { setMenu(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const categories = ['all', ...new Set(menu.map(i => i.category))]

  const filtered = menu.filter(item => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false
    if (search) return item.name.toLowerCase().includes(search.toLowerCase()) || (item.tags || '').toLowerCase().includes(search.toLowerCase())
    return true
  })

  const addToCart = (item) => {
    setCart(prev => {
      const exists = prev.find(c => c.id === item.id)
      if (exists) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...item, qty: 1 }]
    })
  }

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0))
  }

  const removeItem = (id) => setCart(prev => prev.filter(c => c.id !== id))

  const subtotal = cart.reduce((s, c) => s + (parseFloat(c.price) * c.qty), 0)
  const tax = subtotal * 0.11
  const total = subtotal + tax
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)

  const placeOrder = async () => {
    if (cart.length === 0) return
    setPlacing(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: orderType,
          table_number: tableNum || null,
          items: cart.map(c => ({ menu_item_id: c.id, quantity: c.qty, price: c.price, name: c.name })),
          subtotal, tax, total
        })
      })
      if (!res.ok) throw new Error('Failed to place order')
      setCart([])
      setTableNum('')
      setNote('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      alert('Error placing order: ' + err.message)
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* ── Menu panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 p-5 overflow-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Point of Sale</h1>
            <p className="text-slate-400 text-xs mt-0.5">{menu.length} items available</p>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search menu…"
              className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500 w-52"
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize flex items-center gap-1 ${
                selectedCategory === cat ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {CAT_EMOJI[cat] || '🍽️'} {cat}
            </button>
          ))}
        </div>

        {/* Menu grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-20" />
            ))}
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
              const inCart = cart.find(c => c.id === item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className={`relative bg-slate-900 border rounded-xl p-4 text-left transition-all group hover:scale-[1.02] active:scale-[0.98] ${
                    inCart ? 'border-orange-500/60 bg-orange-500/5' : 'border-slate-800 hover:border-orange-500/40'
                  }`}
                >
                  {inCart && (
                    <span className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                      {inCart.qty}
                    </span>
                  )}
                  <div className="text-2xl mb-1.5">{CAT_EMOJI[item.category] || '🍽️'}</div>
                  <p className="text-white font-medium text-sm leading-tight group-hover:text-orange-400 transition-colors line-clamp-2">{item.name}</p>
                  <p className="text-slate-500 text-xs mt-0.5 capitalize">{item.category}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-orange-400 font-bold text-sm">${parseFloat(item.price).toFixed(2)}</p>
                    {item.prep_time && <p className="text-slate-600 text-xs">⏱{item.prep_time}m</p>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Order panel ──────────────────────────────────────────────────── */}
      <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col flex-shrink-0">
        {/* Order config */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">Current Order</h2>
            {cartCount > 0 && (
              <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-medium">{cartCount} items</span>
            )}
          </div>
          <div className="flex gap-1 mb-3">
            {[['dine-in','🍴'],['takeaway','🥡'],['delivery','🛵']].map(([t,e]) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  orderType === t ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {e} {t}
              </button>
            ))}
          </div>
          {orderType === 'dine-in' && (
            <input
              type="number"
              placeholder="Table number"
              value={tableNum}
              onChange={e => setTableNum(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
            />
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-auto p-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <p className="text-3xl mb-2">🛒</p>
              <p className="text-slate-500 text-sm">No items added</p>
              <p className="text-slate-600 text-xs mt-1">Tap a menu item to add</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.name}</p>
                    <p className="text-orange-400 text-xs">${(parseFloat(item.price) * item.qty).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded text-sm transition-colors">−</button>
                    <span className="text-white text-sm w-5 text-center font-medium">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 bg-slate-800 hover:bg-green-500/20 hover:text-green-400 text-slate-300 rounded text-sm transition-colors">+</button>
                    <button onClick={() => removeItem(item.id)} className="w-6 h-6 text-slate-700 hover:text-red-400 text-xs ml-1 opacity-0 group-hover:opacity-100 transition-all">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals & checkout */}
        <div className="p-4 border-t border-slate-800">
          <div className="space-y-1.5 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Subtotal</span>
              <span className="text-white">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Tax (11%)</span>
              <span className="text-white">${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold mt-2 pt-2 border-t border-slate-700">
              <span className="text-white text-base">Total</span>
              <span className="text-orange-400 text-lg">${total.toFixed(2)}</span>
            </div>
          </div>

          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="w-full py-1.5 text-slate-500 hover:text-red-400 text-xs transition-colors mb-2"
            >
              Clear order
            </button>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-xl px-3 py-2.5 mb-3 text-center flex items-center justify-center gap-2">
              ✓ Order placed successfully!
            </div>
          )}

          <button
            onClick={placeOrder}
            disabled={cart.length === 0 || placing}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-orange-500/20"
          >
            {placing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Placing…
              </span>
            ) : cart.length === 0 ? 'Add items to order' : `Place Order • $${total.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
