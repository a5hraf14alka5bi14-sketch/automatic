import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'

const CATS = [
  { id: 'all', label: 'All', emoji: '🍽️' },
  { id: 'shawarma', label: 'Shawarma', emoji: '🌯' },
  { id: 'grills', label: 'Grills', emoji: '🔥' },
  { id: 'appetizers', label: 'Appetizers', emoji: '🥙' },
  { id: 'salads', label: 'Salads', emoji: '🥗' },
  { id: 'sandwiches', label: 'Sandwiches', emoji: '🥪' },
  { id: 'meals', label: 'Meals', emoji: '🍱' },
  { id: 'manakish', label: 'Manakish', emoji: '🫓' },
  { id: 'desserts', label: 'Desserts', emoji: '🍮' },
  { id: 'drinks', label: 'Drinks', emoji: '🥤' },
]
const CAT_EMOJI = Object.fromEntries(CATS.map(c => [c.id, c.emoji]))

function PaymentModal({ order, currency, onConfirm, onClose }) {
  const [method, setMethod] = useState('cash')
  const [loading, setLoading] = useState(false)
  const handle = async () => { setLoading(true); await onConfirm(order.id, method); setLoading(false) }
  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm">
        <div className="p-5 border-b border-slate-800">
          <h2 className="text-white font-bold text-lg">Payment</h2>
          <p className="text-slate-400 text-sm mt-0.5">Order #{order.id} · {order.type}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-800 rounded-2xl p-5 text-center">
            <p className="text-slate-400 text-sm">Total Due</p>
            <p className="text-orange-400 text-5xl font-bold mt-1">{currency} {parseFloat(order.total).toFixed(3)}</p>
          </div>
          <p className="text-slate-400 text-sm font-medium">Select Payment Method</p>
          <div className="grid grid-cols-3 gap-2">
            {[['cash','💵','Cash'],['card','💳','Card'],['other','📱','Other']].map(([v,e,l]) => (
              <button key={v} onClick={() => setMethod(v)}
                className={`py-3 rounded-xl flex flex-col items-center gap-1.5 transition-all text-sm font-medium ${method===v ? 'bg-orange-500 text-white ring-2 ring-orange-400' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                <span className="text-2xl">{e}</span>{l}
              </button>
            ))}
          </div>
        </div>
        <div className="p-5 border-t border-slate-800 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Pay Later</button>
          <button onClick={handle} disabled={loading} className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
            {loading ? 'Processing…' : '✓ Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function POS() {
  const [menu, setMenu] = useState([])
  const [customers, setCustomers] = useState([])
  const [settings, setSettings] = useState({ tax_rate: '11', currency_symbol: 'OMR', tables_count: '10' })
  const [cart, setCart] = useState([])
  const [orderType, setOrderType] = useState('dine-in')
  const [tableNum, setTableNum] = useState(1)
  const [customerId, setCustomerId] = useState('')
  const [loading, setLoading] = useState(true)
  const [placing, setPlacing] = useState(false)
  const [payModal, setPayModal] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [menuRes, custRes, settingsRes] = await Promise.all([
        apiFetch('/api/menu/all'),
        apiFetch('/api/customers'),
        apiFetch('/api/settings'),
      ])
      const [menuData, custData, settingsData] = await Promise.all([menuRes.json(), custRes.json(), settingsRes.json()])
      setMenu(Array.isArray(menuData) ? menuData.filter(m => m.available) : [])
      setCustomers(Array.isArray(custData) ? custData : [])
      if (settingsData && !settingsData.error) setSettings(s => ({ ...s, ...settingsData }))
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const taxRate = parseFloat(settings.tax_rate || '11') / 100
  const tablesCount = parseInt(settings.tables_count || '10')
  const currency = settings.currency_symbol || 'OMR'
  const fmtC = (amount) => `${currency} ${parseFloat(amount || 0).toFixed(3)}`

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
  const tax = subtotal * taxRate
  const total = subtotal + tax
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)

  const placeOrder = async () => {
    if (cart.length === 0) return
    setPlacing(true)
    setError('')
    try {
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: orderType,
          table_number: orderType === 'dine-in' ? tableNum : null,
          customer_id: customerId ? parseInt(customerId) : null,
          notes: note.trim() || null,
          items: cart.map(c => ({ menu_item_id: c.id, quantity: c.qty, price: parseFloat(c.price), name: c.name })),
          subtotal: parseFloat(subtotal.toFixed(2)),
          tax: parseFloat(tax.toFixed(2)),
          total: parseFloat(total.toFixed(2))
        })
      })
      const order = await res.json()
      if (!res.ok) throw new Error(order.error || 'Failed to place order')
      const placedTotal = total
      setCart([])
      setNote('')
      setCustomerId('')
      setPayModal({ ...order, total: placedTotal, type: orderType })
    } catch (err) {
      setError(err.message)
    }
    setPlacing(false)
  }

  const handlePayment = async (orderId, method) => {
    await apiFetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed', payment_method: method })
    })
    setPayModal(null)
  }

  return (
    <div className="flex h-full">
      {/* ── Menu panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 p-5 overflow-auto flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Point of Sale</h1>
            <p className="text-slate-400 text-xs mt-0.5">{menu.length} items available</p>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…"
              className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500 w-52" />
          </div>
        </div>

        <div className="flex gap-1.5 mb-4 flex-wrap">
          {CATS.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize flex items-center gap-1 ${
                selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}>
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>

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
              const inCart = cart.find(c => c.id === item.id)
              return (
                <button key={item.id} onClick={() => addToCart(item)}
                  className={`relative bg-slate-900 border rounded-xl p-4 text-left transition-all group hover:scale-[1.02] active:scale-[0.98] ${
                    inCart ? 'border-orange-500/60 bg-orange-500/5' : 'border-slate-800 hover:border-orange-500/40'
                  }`}>
                  {inCart && (
                    <span className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full text-white text-xs flex items-center justify-center font-bold">{inCart.qty}</span>
                  )}
                  <div className="text-2xl mb-1.5">{CAT_EMOJI[item.category] || '🍽️'}</div>
                  <p className="text-white font-medium text-sm leading-tight group-hover:text-orange-400 transition-colors line-clamp-2">{item.name}</p>
                  <p className="text-slate-500 text-xs mt-0.5 capitalize">{item.category}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-orange-400 font-bold text-sm">{fmtC(item.price)}</p>
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
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Current Order</h2>
            {cartCount > 0 && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-medium">{cartCount} items</span>}
          </div>

          {/* Order type */}
          <div className="flex gap-1">
            {[['dine-in','🍴'],['takeaway','🥡'],['delivery','🛵']].map(([t,e]) => (
              <button key={t} onClick={() => setOrderType(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${orderType === t ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                {e} {t}
              </button>
            ))}
          </div>

          {/* Table selector */}
          {orderType === 'dine-in' && (
            <select value={tableNum} onChange={e => setTableNum(parseInt(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
              {Array.from({ length: tablesCount }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>Table {n}</option>
              ))}
            </select>
          )}

          {/* Customer selector */}
          <select value={customerId} onChange={e => setCustomerId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
            <option value="">— Walk-in customer —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.phone ? ` · ${c.phone}` : ''}{c.loyalty_points > 0 ? ` · ${c.loyalty_points}pts` : ''}
              </option>
            ))}
          </select>
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
                    <p className="text-orange-400 text-xs">{fmtC(parseFloat(item.price) * item.qty)}</p>
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

        {/* Notes */}
        {cart.length > 0 && (
          <div className="px-4 pb-2">
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Order notes (allergies, special requests…)" rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500 resize-none" />
          </div>
        )}

        {/* Totals & checkout */}
        <div className="p-4 border-t border-slate-800">
          <div className="space-y-1.5 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Subtotal</span>
              <span className="text-white">{fmtC(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Tax ({parseFloat(settings.tax_rate || '11')}%)</span>
              <span className="text-white">{fmtC(tax)}</span>
            </div>
            <div className="flex justify-between font-bold mt-2 pt-2 border-t border-slate-700">
              <span className="text-white text-base">Total</span>
              <span className="text-orange-400 text-lg">{fmtC(total)}</span>
            </div>
          </div>

          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="w-full py-1.5 text-slate-500 hover:text-red-400 text-xs transition-colors mb-2">
              Clear order
            </button>
          )}

          {error && <p className="text-red-400 text-xs mb-2 text-center">{error}</p>}

          <button onClick={placeOrder} disabled={cart.length === 0 || placing}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-orange-500/20">
            {placing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Placing…
              </span>
            ) : cart.length === 0 ? 'Add items to order' : `Place Order · ${fmtC(total)}`}
          </button>
        </div>
      </div>

      {payModal && (
        <PaymentModal order={payModal} currency={currency} onConfirm={handlePayment} onClose={() => setPayModal(null)} />
      )}
    </div>
  )
}
