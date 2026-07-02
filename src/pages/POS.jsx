import React, { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../utils/api.js'
import { useToast } from '../context/ToastContext.jsx'
import { useSettings } from '../context/SettingsContext.jsx'
import ReceiptModal from '../components/ReceiptModal.jsx'

const CATS = [
  { id: 'all',        label: 'All',        emoji: '🍽️' },
  { id: 'shawarma',   label: 'Shawarma',   emoji: '🌯' },
  { id: 'grills',     label: 'Grills',     emoji: '🔥' },
  { id: 'appetizers', label: 'Appetizers', emoji: '🥙' },
  { id: 'salads',     label: 'Salads',     emoji: '🥗' },
  { id: 'sandwiches', label: 'Sandwiches', emoji: '🥪' },
  { id: 'meals',      label: 'Meals',      emoji: '🍱' },
  { id: 'manakish',   label: 'Manakish',   emoji: '🫓' },
  { id: 'desserts',   label: 'Desserts',   emoji: '🍮' },
  { id: 'drinks',     label: 'Drinks',     emoji: '🥤' },
]
const CAT_EMOJI = Object.fromEntries(CATS.map(c => [c.id, c.emoji]))

// ── Modifier Selection Modal ──────────────────────────────────────────────────
function ModifierSelectModal({ item, groups, currency, onConfirm, onClose }) {
  const fmtDelta = (d) => {
    const n = parseFloat(d || 0)
    if (n === 0) return ''
    return n > 0 ? ` +${currency} ${n.toFixed(3)}` : ` −${currency} ${Math.abs(n).toFixed(3)}`
  }

  const initSelected = () => {
    const s = {}
    for (const g of groups) {
      if (g.required && g.modifiers.length > 0) {
        s[g.id] = new Set([g.modifiers[0].id])
      } else {
        s[g.id] = new Set()
      }
    }
    return s
  }

  const [selected, setSelected] = useState(initSelected)

  const toggle = (group, modId) => {
    setSelected(prev => {
      const cur = new Set(prev[group.id] || [])
      if (group.max_selections === 1) {
        return { ...prev, [group.id]: new Set([modId]) }
      }
      if (cur.has(modId)) {
        cur.delete(modId)
      } else if (cur.size < group.max_selections) {
        cur.add(modId)
      }
      return { ...prev, [group.id]: cur }
    })
  }

  const isValid = groups.every(g => !g.required || (selected[g.id] && selected[g.id].size > 0))

  const extraPrice = groups.reduce((sum, g) => {
    for (const modId of (selected[g.id] || [])) {
      const mod = g.modifiers.find(m => m.id === modId)
      if (mod) sum += parseFloat(mod.price_delta || 0)
    }
    return sum
  }, 0)

  const basePrice = parseFloat(item.price || 0)
  const totalPrice = basePrice + extraPrice

  const handleConfirm = () => {
    const mods = []
    for (const g of groups) {
      for (const modId of (selected[g.id] || [])) {
        const mod = g.modifiers.find(m => m.id === modId)
        if (mod) mods.push({ id: mod.id, name: mod.name, price_delta: parseFloat(mod.price_delta || 0), group_name: g.name })
      }
    }
    onConfirm(mods)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="p-5 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-white font-bold text-lg">Customize</h2>
          <p className="text-slate-400 text-sm mt-0.5">{item.name}</p>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-5">
          {groups.map(g => (
            <div key={g.id}>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-white font-semibold text-sm">{g.name}</p>
                {g.required
                  ? <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-medium">Required</span>
                  : <span className="text-xs text-slate-500">Optional</span>}
                {g.max_selections > 1 && (
                  <span className="text-xs text-slate-500">· pick up to {g.max_selections}</span>
                )}
              </div>
              <div className="space-y-1.5">
                {g.modifiers.map(m => {
                  const isSelected = (selected[g.id] || new Set()).has(m.id)
                  const isRadio = g.max_selections === 1
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggle(g, m.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all ${
                        isSelected
                          ? 'bg-orange-500/10 border-orange-500/50 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`flex-shrink-0 flex items-center justify-center transition-colors ${
                          isRadio ? 'w-4 h-4 rounded-full border-2' : 'w-4 h-4 rounded border-2'
                        } ${isSelected ? 'border-orange-500 bg-orange-500' : 'border-slate-600'}`}>
                          {isSelected && <div className={isRadio ? 'w-1.5 h-1.5 bg-white rounded-full' : 'text-white text-xs leading-none'}>
                            {isRadio ? null : '✓'}
                          </div>}
                        </div>
                        <span>{m.name}</span>
                      </div>
                      {parseFloat(m.price_delta || 0) !== 0 && (
                        <span className={`text-xs font-medium ${parseFloat(m.price_delta) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {fmtDelta(m.price_delta)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors"
          >
            Add · {currency} {totalPrice.toFixed(3)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
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

// ── Split Bill Modal ──────────────────────────────────────────────────────────
function SplitBillModal({ cart, subtotal, tax, total, currency, onClose }) {
  const [splits, setSplits] = useState(2)
  const fmtC = (n) => `${currency} ${parseFloat(n || 0).toFixed(3)}`

  const perPerson = splits > 0 ? total / splits : total
  const perPersonSub = splits > 0 ? subtotal / splits : subtotal
  const perPersonTax = splits > 0 ? tax / splits : tax

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">Split Bill</h2>
            <p className="text-slate-400 text-sm mt-0.5">Divide the total equally among guests</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl transition-colors">✕</button>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-slate-800/60 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Subtotal</span>
              <span className="text-white">{fmtC(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Tax</span>
              <span className="text-white">{fmtC(tax)}</span>
            </div>
            <div className="flex justify-between font-bold pt-2 border-t border-slate-700">
              <span className="text-white">Total</span>
              <span className="text-orange-400">{fmtC(total)}</span>
            </div>
          </div>

          <div>
            <label className="text-slate-400 text-sm block mb-3">Number of guests</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setSplits(Math.max(2, splits - 1))}
                className="w-10 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xl font-bold transition-colors">−</button>
              <div className="flex-1 text-center">
                <span className="text-4xl font-bold text-orange-400">{splits}</span>
                <span className="text-slate-400 ml-2 text-sm">guests</span>
              </div>
              <button onClick={() => setSplits(Math.min(20, splits + 1))}
                className="w-10 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xl font-bold transition-colors">+</button>
            </div>
            <div className="flex gap-2 mt-3">
              {[2, 3, 4, 5, 6].map(n => (
                <button key={n} onClick={() => setSplits(n)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${splits === n ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
            <p className="text-orange-300 text-xs font-medium mb-2 uppercase tracking-wide">Each guest pays</p>
            <p className="text-orange-400 text-4xl font-bold">{fmtC(perPerson)}</p>
            <div className="flex gap-4 mt-2 text-xs text-slate-400">
              <span>Subtotal: {fmtC(perPersonSub)}</span>
              <span>Tax: {fmtC(perPersonTax)}</span>
            </div>
          </div>

          {cart.length > 0 && (
            <div className="bg-slate-800/40 rounded-xl p-4">
              <p className="text-slate-500 text-xs font-medium mb-2">Order items ({cart.reduce((s, i) => s + i.qty, 0)} items)</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {cart.map(item => (
                  <div key={item.cartId} className="flex justify-between text-xs text-slate-400">
                    <span>{item.qty}× {item.name}</span>
                    <span>{currency} {(parseFloat(item.price) * item.qty).toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-800">
          <button onClick={onClose}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main POS Page ─────────────────────────────────────────────────────────────
export default function POS() {
  const showToast = useToast()
  const { refreshLowStock } = useSettings()
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
  const [receiptData, setReceiptData] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [modifierModal, setModifierModal] = useState(null)
  const [modifierLoading, setModifierLoading] = useState(false)
  const [splitModal, setSplitModal] = useState(false)
  const modifierCache = useRef({})
  const searchRef = useRef(null)

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

  const addToCart = (item, selectedModifiers = []) => {
    const extraPrice = selectedModifiers.reduce((s, m) => s + parseFloat(m.price_delta || 0), 0)
    const unitPrice = parseFloat(item.price || 0) + extraPrice
    const modKey = selectedModifiers.map(m => m.id).sort().join(',')
    const cartId = `${item.id}:${modKey}`

    setCart(prev => {
      const exists = prev.find(c => c.cartId === cartId)
      if (exists) return prev.map(c => c.cartId === cartId ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { cartId, id: item.id, name: item.name, price: unitPrice, qty: 1, modifiers: selectedModifiers, category: item.category }]
    })
    setModifierModal(null)
  }

  const handleItemClick = async (item) => {
    if (modifierLoading) return
    const cached = modifierCache.current[item.id]
    if (cached !== undefined) {
      if (cached.length === 0) addToCart(item, [])
      else setModifierModal({ item, groups: cached })
      return
    }
    setModifierLoading(true)
    try {
      const res = await apiFetch(`/api/menu/${item.id}/modifier-groups`)
      const groups = await res.json()
      const validGroups = Array.isArray(groups) ? groups.filter(g => g.modifiers && g.modifiers.length > 0) : []
      modifierCache.current[item.id] = validGroups
      if (validGroups.length === 0) addToCart(item, [])
      else setModifierModal({ item, groups: validGroups })
    } catch {
      modifierCache.current[item.id] = []
      addToCart(item, [])
    }
    setModifierLoading(false)
  }

  const updateQty = (cartId, delta) => {
    setCart(prev => prev.map(c => c.cartId === cartId ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0))
  }

  const removeItem = (cartId) => setCart(prev => prev.filter(c => c.cartId !== cartId))

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
          items: cart.map(c => ({
            menu_item_id: c.id,
            quantity: c.qty,
            price: parseFloat(c.price),
            name: c.name,
            modifiers: c.modifiers || []
          })),
          subtotal: parseFloat(subtotal.toFixed(2)),
          tax: parseFloat(tax.toFixed(2)),
          total: parseFloat(total.toFixed(2))
        })
      })
      const order = await res.json()
      if (!res.ok) throw new Error(order.error || 'Failed to place order')

      const selectedCustomer = customerId ? customers.find(c => c.id === parseInt(customerId)) : null
      const cartSnapshot = cart.map(c => ({
        name: c.name,
        quantity: c.qty,
        price: parseFloat(c.price),
        modifiers: c.modifiers || [],
        notes: null
      }))

      setCart([])
      setNote('')
      setCustomerId('')
      showToast(`Order #${order.id} placed — awaiting payment`, 'info')
      setPayModal({
        ...order,
        total: parseFloat(total.toFixed(3)),
        subtotal: parseFloat(subtotal.toFixed(3)),
        tax: parseFloat(tax.toFixed(3)),
        type: orderType,
        items: cartSnapshot,
        customer_name: selectedCustomer?.name || null
      })
    } catch (err) {
      setError(err.message)
      showToast(err.message, 'error')
    }
    setPlacing(false)
  }

  const handlePayment = async (orderId, method) => {
    try {
      const res = await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', payment_method: method })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Payment failed') }
      const receipt = { ...payModal, payment_method: method, paid_at: new Date().toISOString() }
      setPayModal(null)
      showToast('Payment confirmed! 🎉', 'success')
      setReceiptData(receipt)
      refreshLowStock()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  // Keep latest handlers accessible inside the keydown listener without stale closures.
  const placeOrderRef = useRef(placeOrder)
  placeOrderRef.current = placeOrder
  const addFirstMatchRef = useRef(null)
  addFirstMatchRef.current = () => { if (filtered.length > 0) handleItemClick(filtered[0]) }

  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (e.key === 'Escape') {
        if (modifierModal) return setModifierModal(null)
        if (payModal) return setPayModal(null)
        if (search) return setSearch('')
        if (typing) return el.blur()
        return
      }
      if (modifierModal || payModal) return
      // Enter while the search box is focused adds the first matching item.
      if (e.key === 'Enter' && el === searchRef.current) {
        e.preventDefault()
        addFirstMatchRef.current()
        return
      }
      if (typing) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return }
      if (e.key === 'Enter') {
        if (cart.length > 0 && !placing) { e.preventDefault(); placeOrderRef.current() }
        return
      }
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1
        if (CATS[idx]) { e.preventDefault(); setSelectedCategory(CATS[idx].id) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [payModal, modifierModal, cart.length, placing, search])

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
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…  ( / )"
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
              const cartQty = cart.filter(c => c.id === item.id).reduce((s, c) => s + c.qty, 0)
              return (
                <button key={item.id} onClick={() => handleItemClick(item)}
                  disabled={modifierLoading}
                  className={`relative bg-slate-900 border rounded-xl p-4 text-left transition-all group hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 ${
                    cartQty > 0 ? 'border-orange-500/60 bg-orange-500/5' : 'border-slate-800 hover:border-orange-500/40'
                  }`}>
                  {cartQty > 0 && (
                    <span className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full text-white text-xs flex items-center justify-center font-bold">{cartQty}</span>
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

          <div className="flex gap-1">
            {[['dine-in','🍴'],['takeaway','🥡'],['delivery','🛵']].map(([t,e]) => (
              <button key={t} onClick={() => setOrderType(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${orderType === t ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                {e} {t}
              </button>
            ))}
          </div>

          {orderType === 'dine-in' && (
            <select value={tableNum} onChange={e => setTableNum(parseInt(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
              {Array.from({ length: tablesCount }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>Table {n}</option>
              ))}
            </select>
          )}

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
                <div key={item.cartId} className="group">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{item.name}</p>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">
                          {item.modifiers.map(m => m.name).join(', ')}
                        </p>
                      )}
                      <p className="text-orange-400 text-xs">{fmtC(parseFloat(item.price) * item.qty)}</p>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <button onClick={() => updateQty(item.cartId, -1)} className="w-6 h-6 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded text-sm transition-colors">−</button>
                      <span className="text-white text-sm w-5 text-center font-medium">{item.qty}</span>
                      <button onClick={() => updateQty(item.cartId, 1)} className="w-6 h-6 bg-slate-800 hover:bg-green-500/20 hover:text-green-400 text-slate-300 rounded text-sm transition-colors">+</button>
                      <button onClick={() => removeItem(item.cartId)} className="w-6 h-6 text-slate-700 hover:text-red-400 text-xs ml-1 opacity-0 group-hover:opacity-100 transition-all">✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="px-4 pb-2">
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Order notes (allergies, special requests…)" rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500 resize-none" />
          </div>
        )}

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
            <div className="flex gap-2 mb-2">
              <button onClick={() => setCart([])} className="flex-1 py-1.5 text-slate-500 hover:text-red-400 text-xs transition-colors">
                Clear order
              </button>
              <button onClick={() => setSplitModal(true)}
                className="flex-1 py-1.5 text-slate-400 hover:text-orange-400 text-xs transition-colors border border-slate-700 rounded-lg">
                ÷ Split Bill
              </button>
            </div>
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

      {modifierModal && (
        <ModifierSelectModal
          item={modifierModal.item}
          groups={modifierModal.groups}
          currency={currency}
          onConfirm={(mods) => addToCart(modifierModal.item, mods)}
          onClose={() => setModifierModal(null)}
        />
      )}

      {payModal && (
        <PaymentModal order={payModal} currency={currency} onConfirm={handlePayment} onClose={() => setPayModal(null)} />
      )}

      {receiptData && (
        <ReceiptModal
          order={receiptData}
          settings={settings}
          onClose={() => setReceiptData(null)}
        />
      )}

      {splitModal && (
        <SplitBillModal
          cart={cart}
          subtotal={subtotal}
          tax={tax}
          total={total}
          currency={currency}
          onClose={() => setSplitModal(false)}
        />
      )}
    </div>
  )
}
