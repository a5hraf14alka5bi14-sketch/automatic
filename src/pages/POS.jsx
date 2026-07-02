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

// ── Modifier Modal ────────────────────────────────────────────────────────────
function ModifierSelectModal({ item, groups, currency, onConfirm, onClose }) {
  const fmtDelta = (d) => {
    const n = parseFloat(d || 0)
    if (n === 0) return ''
    return n > 0 ? ` +${currency} ${n.toFixed(3)}` : ` −${currency} ${Math.abs(n).toFixed(3)}`
  }

  const initSelected = () => {
    const s = {}
    for (const g of groups) {
      s[g.id] = g.required && g.modifiers.length > 0 ? new Set([g.modifiers[0].id]) : new Set()
    }
    return s
  }

  const [selected, setSelected] = useState(initSelected)

  const toggle = (group, modId) => {
    setSelected(prev => {
      const cur = new Set(prev[group.id] || [])
      if (group.max_selections === 1) return { ...prev, [group.id]: new Set([modId]) }
      if (cur.has(modId)) { cur.delete(modId) } else if (cur.size < group.max_selections) { cur.add(modId) }
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

  const totalPrice = parseFloat(item.price || 0) + extraPrice

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
                {g.max_selections > 1 && <span className="text-xs text-slate-500">· up to {g.max_selections}</span>}
              </div>
              <div className="space-y-1.5">
                {g.modifiers.map(m => {
                  const isSelected = (selected[g.id] || new Set()).has(m.id)
                  const isRadio = g.max_selections === 1
                  return (
                    <button key={m.id} onClick={() => toggle(g, m.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all ${
                        isSelected ? 'bg-orange-500/10 border-orange-500/50 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}>
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
          <button onClick={onClose} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={!isValid}
            className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors">
            Add · {currency} {totalPrice.toFixed(3)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Payment Modal (with cash change calculator) ───────────────────────────────
function PaymentModal({ order, currency, onConfirm, onClose }) {
  const [method, setMethod] = useState('cash')
  const [applyLoyalty, setApplyLoyalty] = useState(false)
  const [cashGiven, setCashGiven] = useState('')
  const [loading, setLoading] = useState(false)

  const loyaltyPoints = order.loyalty_points || 0
  const loyaltyPerOmr = order.loyalty_per_omr || 1
  const orderTotal = parseFloat(order.total)
  const maxRedeemable = Math.min(loyaltyPoints, Math.floor(orderTotal * loyaltyPerOmr))
  const discountAmount = loyaltyPerOmr > 0 ? parseFloat((maxRedeemable / loyaltyPerOmr).toFixed(3)) : 0
  const pointsToRedeem = applyLoyalty ? maxRedeemable : 0
  const amountDue = parseFloat((orderTotal - (applyLoyalty ? discountAmount : 0)).toFixed(3))

  const cashNum = parseFloat(cashGiven || 0)
  const change = method === 'cash' ? Math.max(0, cashNum - amountDue) : 0
  const cashInsufficient = method === 'cash' && cashGiven !== '' && cashNum < amountDue

  const handle = async () => {
    setLoading(true)
    await onConfirm(order.id, method, pointsToRedeem)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="p-5 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-white font-bold text-lg">Payment</h2>
          <p className="text-slate-400 text-sm mt-0.5">Order #{order.id} · {order.type}</p>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* Total */}
          <div className="bg-slate-800 rounded-2xl p-5 text-center">
            <p className="text-slate-400 text-sm">{applyLoyalty ? 'After Loyalty Discount' : 'Amount Due'}</p>
            <p className={`text-5xl font-bold mt-1 transition-colors ${applyLoyalty ? 'text-green-400' : 'text-orange-400'}`}>
              {currency} {amountDue.toFixed(3)}
            </p>
            {applyLoyalty && discountAmount > 0 && (
              <p className="text-slate-500 text-xs mt-2 line-through">{currency} {orderTotal.toFixed(3)}</p>
            )}
          </div>

          {/* Loyalty redemption */}
          {loyaltyPoints > 0 && discountAmount > 0 && (
            <button onClick={() => setApplyLoyalty(v => !v)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                applyLoyalty
                  ? 'bg-orange-500/10 border-orange-500 text-orange-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
              }`}>
              <div className="text-left">
                <p className="text-sm font-medium">🎁 Redeem Loyalty Points</p>
                <p className="text-xs opacity-70 mt-0.5">
                  {maxRedeemable} pts → save {currency} {discountAmount.toFixed(3)}
                  {loyaltyPoints > maxRedeemable ? ` (of ${loyaltyPoints})` : ''}
                </p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                applyLoyalty ? 'border-orange-400 bg-orange-400' : 'border-slate-500'
              }`}>
                {applyLoyalty && <span className="text-white text-xs font-bold leading-none">✓</span>}
              </div>
            </button>
          )}

          {/* Payment method */}
          <div>
            <p className="text-slate-400 text-sm font-medium mb-2">Payment Method</p>
            <div className="grid grid-cols-3 gap-2">
              {[['cash','💵','Cash'],['card','💳','Card'],['other','📱','Other']].map(([v,e,l]) => (
                <button key={v} onClick={() => setMethod(v)}
                  className={`py-3 rounded-xl flex flex-col items-center gap-1.5 transition-all text-sm font-medium ${
                    method === v ? 'bg-orange-500 text-white ring-2 ring-orange-400' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}>
                  <span className="text-2xl">{e}</span>{l}
                </button>
              ))}
            </div>
          </div>

          {/* Cash change calculator */}
          {method === 'cash' && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
              <p className="text-slate-300 text-sm font-medium">Cash Calculator</p>
              <div>
                <label className="text-slate-500 text-xs mb-1 block">Cash Given</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={cashGiven}
                  onChange={e => setCashGiven(e.target.value)}
                  placeholder={amountDue.toFixed(3)}
                  className={`w-full bg-slate-900 border rounded-xl px-3 py-2 text-white text-sm focus:outline-none transition-colors ${
                    cashInsufficient ? 'border-red-500' : 'border-slate-600 focus:border-orange-500'
                  }`}
                />
                {cashInsufficient && <p className="text-red-400 text-xs mt-1">Insufficient amount</p>}
              </div>
              {cashGiven !== '' && !cashInsufficient && (
                <div className="flex justify-between items-center bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
                  <span className="text-green-300 text-sm font-medium">Change Due</span>
                  <span className="text-green-400 text-xl font-bold">{currency} {change.toFixed(3)}</span>
                </div>
              )}
              {/* Quick cash buttons */}
              <div className="flex gap-2 flex-wrap">
                {[amountDue, Math.ceil(amountDue), amountDue + 0.5, amountDue + 1].filter((v,i,a) => a.indexOf(v) === i && v > 0).slice(0,4).map(v => (
                  <button key={v} onClick={() => setCashGiven(v.toFixed(3))}
                    className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors">
                    {currency} {v.toFixed(3)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-800 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            Pay Later
          </button>
          <button onClick={handle} disabled={loading || cashInsufficient}
            className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
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

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">Split Bill</h2>
            <p className="text-slate-400 text-sm mt-0.5">Divide equally among guests</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl transition-colors">✕</button>
        </div>
        <div className="p-5 space-y-5">
          <div className="bg-slate-800/60 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-slate-400">Subtotal</span><span className="text-white">{fmtC(subtotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Tax</span><span className="text-white">{fmtC(tax)}</span></div>
            <div className="flex justify-between font-bold pt-2 border-t border-slate-700">
              <span className="text-white">Total</span><span className="text-orange-400">{fmtC(total)}</span>
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
              {[2,3,4,5,6].map(n => (
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
              <span>Subtotal: {fmtC(subtotal / splits)}</span>
              <span>Tax: {fmtC(tax / splits)}</span>
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-slate-800">
          <button onClick={onClose} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Table Order Modal (Tables view) ───────────────────────────────────────────
function TableOrderModal({ tableNum, orders, currency, onClose, onUpdateStatus, onToggleRush }) {
  const fmtC = (n) => `${currency} ${parseFloat(n || 0).toFixed(3)}`
  const STATUS_FLOW = {
    pending: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['completed'],
    completed: [], cancelled: []
  }
  const STATUS_COLOR = { pending:'text-yellow-400', preparing:'text-blue-400', ready:'text-green-400', completed:'text-slate-400', cancelled:'text-red-400' }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-xl">Table {tableNum}</h2>
            <p className="text-slate-400 text-sm mt-0.5">{orders.length} active order{orders.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-2xl leading-none transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {orders.map(order => (
            <div key={order.id} className={`border rounded-xl p-4 ${order.rush ? 'border-red-500/50 bg-red-500/5' : 'border-slate-800 bg-slate-800/30'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold">#{order.id}</span>
                  {order.rush && <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">🔴 RUSH</span>}
                  <span className={`text-xs font-semibold capitalize ${STATUS_COLOR[order.status]}`}>{order.status}</span>
                </div>
                <span className="text-orange-400 font-bold">{fmtC(order.total)}</span>
              </div>

              {/* Items */}
              <div className="space-y-1 mb-3">
                {(order.items || []).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-orange-400 font-bold w-5">{item.quantity}×</span>
                    <span className="text-slate-300">{item.name}</span>
                  </div>
                ))}
              </div>

              {order.notes && (
                <p className="text-yellow-300 text-xs italic mb-3">📝 {order.notes}</p>
              )}

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => onToggleRush(order.id, !order.rush)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    order.rush ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-700 text-slate-400 hover:text-red-400'
                  }`}>
                  {order.rush ? '🔴 Rush' : '🚨 Rush'}
                </button>
                {(STATUS_FLOW[order.status] || []).map(s => (
                  <button key={s}
                    onClick={() => { onUpdateStatus(order.id, s); }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                      s === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                      : s === 'cancelled' ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                      : 'bg-blue-500/15 text-blue-400 border border-blue-500/25 hover:bg-blue-500/25'
                    }`}>
                    {s === 'completed' ? '💳 Complete & Pay' : s === 'cancelled' ? '✕ Cancel' : `→ ${s}`}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800 flex-shrink-0">
          <button onClick={onClose} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main POS ──────────────────────────────────────────────────────────────────
export default function POS() {
  const showToast = useToast()
  const { refreshLowStock } = useSettings()

  // Core data
  const [menu, setMenu] = useState([])
  const [customers, setCustomers] = useState([])
  const [settings, setSettings] = useState({ tax_rate: '5', currency_symbol: 'OMR', tables_count: '10', loyalty_points_per_omr: '1' })
  const [loading, setLoading] = useState(true)

  // View: 'pos' | 'tables'
  const [view, setView] = useState('pos')
  const [openOrders, setOpenOrders] = useState([])
  const [tablesLoading, setTablesLoading] = useState(false)
  const [selectedTableOrders, setSelectedTableOrders] = useState(null) // { tableNum, orders }

  // Cart
  const [cart, setCart] = useState([])
  const [itemNotes, setItemNotes] = useState({})
  const [expandedCartItem, setExpandedCartItem] = useState(null)
  const [orderType, setOrderType] = useState('dine-in')
  const [tableNum, setTableNum] = useState(1)
  const [customerId, setCustomerId] = useState('')
  const [note, setNote] = useState('')
  const [rush, setRush] = useState(false)

  // Discount
  const [discount, setDiscount] = useState({ amount: '', type: 'percent' })

  // UI state
  const [placing, setPlacing] = useState(false)
  const [payModal, setPayModal] = useState(null)
  const [receiptData, setReceiptData] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [modifierModal, setModifierModal] = useState(null)
  const [modifierLoading, setModifierLoading] = useState(false)
  const [splitModal, setSplitModal] = useState(false)

  const modifierCache = useRef({})
  const searchRef = useRef(null)

  // ── Load initial data ──────────────────────────────────────────────────────
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

  // ── Load open orders for Tables view ──────────────────────────────────────
  const fetchOpenOrders = useCallback(async () => {
    setTablesLoading(true)
    try {
      const res = await apiFetch('/api/orders?status=pending,preparing,ready')
      const data = await res.json()
      setOpenOrders(Array.isArray(data) ? data : [])
    } catch {}
    setTablesLoading(false)
  }, [])

  useEffect(() => {
    if (view === 'tables') fetchOpenOrders()
  }, [view, fetchOpenOrders])

  // ── Computed values ────────────────────────────────────────────────────────
  const taxRate = parseFloat(settings.tax_rate || '5') / 100
  const tablesCount = parseInt(settings.tables_count || '10')
  const currency = settings.currency_symbol || 'OMR'
  const fmtC = (amount) => `${currency} ${parseFloat(amount || 0).toFixed(3)}`

  const subtotal = cart.reduce((s, c) => s + (parseFloat(c.price) * c.qty), 0)
  const discountVal = discount.type === 'percent'
    ? subtotal * parseFloat(discount.amount || 0) / 100
    : Math.min(parseFloat(discount.amount || 0), subtotal)
  const discountedSub = Math.max(0, subtotal - discountVal)
  const tax = discountedSub * taxRate
  const total = discountedSub + tax
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)
  const hasDiscount = discountVal > 0

  // ── Menu filtering ─────────────────────────────────────────────────────────
  const filtered = menu.filter(item => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false
    if (search) return item.name.toLowerCase().includes(search.toLowerCase()) || (item.tags || '').toLowerCase().includes(search.toLowerCase())
    return true
  })

  // ── Cart operations ────────────────────────────────────────────────────────
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
    if (delta < 0) {
      setItemNotes(prev => { const next = { ...prev }; if (cart.find(c => c.cartId === cartId)?.qty <= 1) delete next[cartId]; return next })
    }
  }

  const removeItem = (cartId) => {
    setCart(prev => prev.filter(c => c.cartId !== cartId))
    setItemNotes(prev => { const next = { ...prev }; delete next[cartId]; return next })
    if (expandedCartItem === cartId) setExpandedCartItem(null)
  }

  const clearCart = () => {
    setCart([]); setItemNotes({}); setNote(''); setCustomerId('')
    setRush(false); setDiscount({ amount: '', type: 'percent' }); setExpandedCartItem(null)
  }

  // ── Place order ────────────────────────────────────────────────────────────
  const placeOrder = async () => {
    if (cart.length === 0) return
    setPlacing(true); setError('')
    try {
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: orderType,
          table_number: orderType === 'dine-in' ? tableNum : null,
          customer_id: customerId ? parseInt(customerId) : null,
          notes: note.trim() || null,
          rush,
          discount: parseFloat(discountVal.toFixed(3)),
          discount_type: discount.type,
          items: cart.map(c => ({
            menu_item_id: c.id,
            quantity: c.qty,
            price: parseFloat(c.price),
            name: c.name,
            modifiers: c.modifiers || [],
            item_notes: itemNotes[c.cartId] || null,
          })),
          subtotal: parseFloat(discountedSub.toFixed(3)),
          tax: parseFloat(tax.toFixed(3)),
          total: parseFloat(total.toFixed(3)),
        })
      })
      const order = await res.json()
      if (!res.ok) throw new Error(order.error || 'Failed to place order')

      const selectedCustomer = customerId ? customers.find(c => c.id === parseInt(customerId)) : null
      const cartSnapshot = cart.map(c => ({
        name: c.name, quantity: c.qty, price: parseFloat(c.price),
        modifiers: c.modifiers || [], notes: itemNotes[c.cartId] || null
      }))

      clearCart()
      showToast(`Order #${order.id} placed — awaiting payment`, 'info')
      setPayModal({
        ...order,
        total: parseFloat(total.toFixed(3)),
        subtotal: parseFloat(discountedSub.toFixed(3)),
        tax: parseFloat(tax.toFixed(3)),
        type: orderType,
        items: cartSnapshot,
        customer_name: selectedCustomer?.name || null,
        loyalty_points: parseInt(selectedCustomer?.loyalty_points || 0),
        loyalty_per_omr: parseInt(settings.loyalty_points_per_omr || '1'),
      })
    } catch (err) {
      setError(err.message)
      showToast(err.message, 'error')
    }
    setPlacing(false)
  }

  // ── Handle payment ─────────────────────────────────────────────────────────
  const handlePayment = async (orderId, method, loyaltyRedemptionPoints = 0) => {
    try {
      const res = await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', payment_method: method, loyalty_redemption_points: loyaltyRedemptionPoints || 0 })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Payment failed') }
      const receipt = { ...payModal, payment_method: method, paid_at: new Date().toISOString() }
      setPayModal(null)
      showToast('Payment confirmed! 🎉', 'success')
      setReceiptData(receipt)
      refreshLowStock()
    } catch (err) { showToast(err.message, 'error') }
  }

  // ── Tables view handlers ───────────────────────────────────────────────────
  const tableUpdateStatus = async (orderId, status) => {
    try {
      await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH', body: JSON.stringify({ status })
      })
      fetchOpenOrders()
      setSelectedTableOrders(null)
    } catch {}
  }

  const tableToggleRush = async (orderId, rushVal) => {
    try {
      await apiFetch(`/api/orders/${orderId}/rush`, { method: 'PATCH', body: JSON.stringify({ rush: rushVal }) })
      fetchOpenOrders()
    } catch {}
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
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
      if (e.key === 'Enter' && el === searchRef.current) { e.preventDefault(); addFirstMatchRef.current(); return }
      if (typing) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return }
      if (e.key === 'Enter') { if (cart.length > 0 && !placing) { e.preventDefault(); placeOrderRef.current() }; return }
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1
        if (CATS[idx]) { e.preventDefault(); setSelectedCategory(CATS[idx].id) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [payModal, modifierModal, cart.length, placing, search])

  // ── Tables view ────────────────────────────────────────────────────────────
  const tableMap = {}
  for (const o of openOrders) {
    if (o.type === 'dine-in' && o.table_number) {
      if (!tableMap[o.table_number]) tableMap[o.table_number] = []
      tableMap[o.table_number].push(o)
    }
  }
  const nonTableOrders = openOrders.filter(o => o.type !== 'dine-in' || !o.table_number)
  const activeTableCount = Object.keys(tableMap).length
  const rushCount = openOrders.filter(o => o.rush).length

  if (view === 'tables') {
    return (
      <div className="p-5 h-full overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-3">
              Table View
              {rushCount > 0 && <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">{rushCount} RUSH</span>}
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">{activeTableCount} of {tablesCount} tables occupied</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchOpenOrders} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">↻ Refresh</button>
            <button onClick={() => setView('pos')} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
              🛒 POS
            </button>
          </div>
        </div>

        {tablesLoading ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
            {[...Array(tablesCount)].map((_, i) => (
              <div key={i} className="aspect-square bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Table grid */}
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3 mb-8">
              {Array.from({ length: tablesCount }, (_, i) => i + 1).map(n => {
                const orders = tableMap[n] || []
                const occupied = orders.length > 0
                const isRush = orders.some(o => o.rush)
                const status = occupied ? orders[0].status : null
                const STATUS_DOT = { pending: 'bg-yellow-400', preparing: 'bg-blue-400', ready: 'bg-green-400' }
                return (
                  <button
                    key={n}
                    onClick={() => occupied ? setSelectedTableOrders({ tableNum: n, orders }) : null}
                    disabled={!occupied}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 border-2 transition-all ${
                      isRush ? 'bg-red-500/20 border-red-500 text-red-300 hover:bg-red-500/30 cursor-pointer'
                      : occupied ? 'bg-orange-500/15 border-orange-500/60 text-orange-300 hover:bg-orange-500/25 cursor-pointer'
                      : 'bg-slate-900 border-slate-700 text-slate-600 cursor-default'
                    }`}
                  >
                    <span className="text-xl font-bold">{n}</span>
                    {occupied ? (
                      <>
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || 'bg-slate-400'}`} />
                          <span className="text-xs capitalize">{status}</span>
                        </div>
                        {isRush && <span className="text-xs font-bold">RUSH</span>}
                      </>
                    ) : (
                      <span className="text-xs">free</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Non-table orders */}
            {nonTableOrders.length > 0 && (
              <div>
                <h2 className="text-slate-400 text-sm font-semibold mb-3 uppercase tracking-wide">Takeaway / Delivery</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {nonTableOrders.map(o => (
                    <div key={o.id} className={`bg-slate-900 border rounded-xl p-4 ${o.rush ? 'border-red-500/40' : 'border-slate-800'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold">#{o.id}</span>
                          {o.rush && <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">RUSH</span>}
                          <span className="text-slate-400 text-xs capitalize">{o.type}</span>
                        </div>
                        <span className="text-orange-400 font-semibold text-sm">{fmtC(o.total)}</span>
                      </div>
                      <p className="text-slate-500 text-xs capitalize">{o.status} · {o.items_count} items</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {openOrders.length === 0 && (
              <div className="text-center py-20">
                <p className="text-4xl mb-3">🍽️</p>
                <p className="text-slate-500">All tables free</p>
              </div>
            )}
          </>
        )}

        {/* Table order modal */}
        {selectedTableOrders && (
          <TableOrderModal
            tableNum={selectedTableOrders.tableNum}
            orders={selectedTableOrders.orders}
            currency={currency}
            onClose={() => setSelectedTableOrders(null)}
            onUpdateStatus={tableUpdateStatus}
            onToggleRush={tableToggleRush}
          />
        )}
      </div>
    )
  }

  // ── POS view ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full">
      {/* ── Left: Menu panel ──────────────────────────────────────────── */}
      <div className="flex-1 p-5 overflow-auto flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold text-white">Point of Sale</h1>
              <p className="text-slate-400 text-xs mt-0.5">{menu.length} items · {cartCount > 0 ? `${cartCount} in cart` : 'cart empty'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <button onClick={() => setView('tables')}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5">
              🪑 Tables
            </button>
            {/* Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu… ( / )"
                className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500 w-48" />
            </div>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {CATS.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
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
              return (
                <button key={item.id} onClick={() => handleItemClick(item)}
                  disabled={modifierLoading}
                  className={`bg-slate-900 border rounded-xl p-4 text-left hover:border-orange-500/50 transition-all group relative ${
                    cartQty > 0 ? 'border-orange-500/40 bg-orange-500/5' : 'border-slate-800'
                  }`}>
                  {cartQty > 0 && (
                    <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-lg">
                      {cartQty}
                    </div>
                  )}
                  <p className="text-white font-semibold text-sm leading-tight">{item.name}</p>
                  <p className="text-orange-400 font-bold text-sm mt-2">{fmtC(item.price)}</p>
                  {item.prep_time && <p className="text-slate-600 text-xs mt-1">⏱ {item.prep_time}m</p>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Right: Cart + Order ────────────────────────────────────────── */}
      <div className="w-80 xl:w-96 border-l border-slate-800 flex flex-col bg-slate-950/30 flex-shrink-0">
        {/* Order type + table */}
        <div className="p-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex gap-1 bg-slate-900 rounded-xl p-1 mb-3">
            {[['dine-in','🍽️','Dine-in'],['takeaway','🛍️','Takeaway'],['delivery','🚚','Delivery']].map(([v,e,l]) => (
              <button key={v} onClick={() => setOrderType(v)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  orderType === v ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
                }`}>
                {e} {l}
              </button>
            ))}
          </div>

          {orderType === 'dine-in' && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs">Table</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setTableNum(t => Math.max(1, t - 1))} className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold">−</button>
                <span className="text-white font-bold w-8 text-center">{tableNum}</span>
                <button onClick={() => setTableNum(t => Math.min(tablesCount, t + 1))} className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold">+</button>
              </div>
              <span className="text-slate-600 text-xs">/ {tablesCount}</span>
            </div>
          )}
        </div>

        {/* Customer */}
        <div className="px-4 py-2 border-b border-slate-800 flex-shrink-0">
          <select value={customerId} onChange={e => setCustomerId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
            <option value="">No customer linked</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name} {c.loyalty_points > 0 ? `(${c.loyalty_points} pts)` : ''}</option>
            ))}
          </select>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-4xl mb-2">🛒</p>
                <p className="text-slate-600 text-sm">Cart is empty</p>
                <p className="text-slate-700 text-xs mt-1">Click items to add them</p>
              </div>
            </div>
          ) : cart.map(item => (
            <div key={item.cartId} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-start gap-2 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium leading-tight truncate">{item.name}</p>
                  {item.modifiers.length > 0 && (
                    <p className="text-slate-500 text-xs mt-0.5 truncate">{item.modifiers.map(m => m.name).join(', ')}</p>
                  )}
                  <p className="text-orange-400 text-xs font-semibold mt-1">{fmtC(item.price)} each</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => updateQty(item.cartId, -1)} className="w-6 h-6 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 rounded-md text-sm font-bold transition-colors">−</button>
                  <span className="text-white font-bold w-5 text-center text-sm">{item.qty}</span>
                  <button onClick={() => updateQty(item.cartId, 1)} className="w-6 h-6 bg-slate-800 hover:bg-green-500/20 hover:text-green-400 text-slate-400 rounded-md text-sm font-bold transition-colors">+</button>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <p className="text-white font-semibold text-sm">{fmtC(parseFloat(item.price) * item.qty)}</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setExpandedCartItem(expandedCartItem === item.cartId ? null : item.cartId)}
                      className="text-slate-600 hover:text-slate-400 text-xs transition-colors px-1"
                      title="Add note"
                    >📝</button>
                    <button onClick={() => removeItem(item.cartId)} className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
                  </div>
                </div>
              </div>
              {/* Item note inline */}
              {expandedCartItem === item.cartId && (
                <div className="px-3 pb-3">
                  <input
                    type="text"
                    value={itemNotes[item.cartId] || ''}
                    onChange={e => setItemNotes(prev => ({ ...prev, [item.cartId]: e.target.value }))}
                    placeholder="Add note for kitchen…"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-orange-500"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Discount section */}
        {cart.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs">Discount</span>
              <div className="flex bg-slate-900 rounded-lg p-0.5 gap-0.5">
                {[['percent','%'],['fixed','OMR']].map(([v,l]) => (
                  <button key={v} onClick={() => setDiscount(d => ({ ...d, type: v, amount: '' }))}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      discount.type === v ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
                    }`}>{l}</button>
                ))}
              </div>
              <div className="flex-1 relative">
                <input
                  type="number"
                  min="0"
                  max={discount.type === 'percent' ? '100' : undefined}
                  step={discount.type === 'percent' ? '1' : '0.001'}
                  value={discount.amount}
                  onChange={e => setDiscount(d => ({ ...d, amount: e.target.value }))}
                  placeholder={discount.type === 'percent' ? '0%' : '0.000'}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-orange-500"
                />
              </div>
              {hasDiscount && (
                <button onClick={() => setDiscount({ amount: '', type: 'percent' })} className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
              )}
            </div>
            {hasDiscount && (
              <p className="text-green-400 text-xs mt-1">Discount: −{fmtC(discountVal)}</p>
            )}
          </div>
        )}

        {/* Totals */}
        <div className="p-4 border-t border-slate-800 flex-shrink-0 space-y-1.5">
          {cart.length > 0 && (
            <>
              <div className="flex justify-between text-sm text-slate-400">
                <span>Subtotal</span>
                <span className={hasDiscount ? 'line-through' : ''}>{fmtC(subtotal)}</span>
              </div>
              {hasDiscount && (
                <>
                  <div className="flex justify-between text-sm text-green-400">
                    <span>Discount ({discount.type === 'percent' ? `${discount.amount}%` : 'fixed'})</span>
                    <span>−{fmtC(discountVal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>After discount</span>
                    <span>{fmtC(discountedSub)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm text-slate-400">
                <span>Tax ({settings.tax_rate || 5}%)</span>
                <span>{fmtC(tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-white text-base pt-1 border-t border-slate-800">
                <span>Total</span>
                <span className="text-orange-400">{fmtC(total)}</span>
              </div>
            </>
          )}

          {/* Order options */}
          {cart.length > 0 && (
            <div className="pt-2 space-y-2">
              {/* Note input */}
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Order note…"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
              />

              {/* Rush + Split row */}
              <div className="flex gap-2">
                <button
                  onClick={() => setRush(v => !v)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                    rush ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700'
                  }`}>
                  {rush ? '🔴 RUSH' : '🚨 Rush'}
                </button>
                <button
                  onClick={() => setSplitModal(true)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors">
                  ÷ Split
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          {/* Place order button */}
          <button
            onClick={placeOrder}
            disabled={cart.length === 0 || placing}
            className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors mt-1 flex items-center justify-center gap-2">
            {placing ? (
              <><span className="animate-spin">⏳</span> Placing…</>
            ) : (
              <>Place Order {cart.length > 0 && `· ${fmtC(total)}`}</>
            )}
          </button>

          {cart.length > 0 && (
            <button onClick={clearCart} className="w-full py-2 text-slate-600 hover:text-red-400 text-xs transition-colors">
              Clear cart
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
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
        <PaymentModal
          order={payModal}
          currency={currency}
          onConfirm={handlePayment}
          onClose={() => setPayModal(null)}
        />
      )}

      {splitModal && (
        <SplitBillModal
          cart={cart}
          subtotal={discountedSub}
          tax={tax}
          total={total}
          currency={currency}
          onClose={() => setSplitModal(false)}
        />
      )}

      {receiptData && (
        <ReceiptModal
          order={receiptData}
          settings={settings}
          onClose={() => setReceiptData(null)}
        />
      )}
    </div>
  )
}
