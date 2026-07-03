import React, { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'
import { useToast } from '../context/ToastContext.jsx'

const STATUS_STYLES = {
  pending:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  preparing: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  ready:     'bg-green-500/10 text-green-400 border-green-500/30',
  completed: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/30',
}

const STATUS_FLOW = {
  pending:   ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready:     ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

const PAYMENT_ICONS = { cash: '💵', card: '💳', other: '📱' }

// ── Order Detail Drawer ───────────────────────────────────────────────────────
function OrderDetailDrawer({ order, onClose, onUpdateStatus, onToggleRush, fmt }) {
  if (!order) return null
  const items = Array.isArray(order.items) ? order.items : []
  const hasDiscount = parseFloat(order.discount || 0) > 0

  return (
    <div className="fixed inset-0 z-40 flex" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-bold text-lg">Order #{order.id}</h2>
              {order.rush && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">🔴 RUSH</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLES[order.status]}`}>
                {order.status}
              </span>
              <span className="text-xs text-slate-500 capitalize">{order.type}</span>
              {order.table_number && <span className="text-xs text-slate-500">Table {order.table_number}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl transition-colors w-8 h-8 flex items-center justify-center">✕</button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto p-5 space-y-5">
          {/* Meta */}
          <div className="bg-slate-800/60 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Date</span>
              <span className="text-slate-300">{new Date(order.created_at).toLocaleString()}</span>
            </div>
            {order.staff_name && (
              <div className="flex justify-between">
                <span className="text-slate-400">Staff</span>
                <span className="text-slate-300">{order.staff_name}</span>
              </div>
            )}
            {order.payment_method && (
              <div className="flex justify-between">
                <span className="text-slate-400">Payment</span>
                <span className="text-slate-300">{PAYMENT_ICONS[order.payment_method]} {order.payment_method}</span>
              </div>
            )}
            {order.notes && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-400 flex-shrink-0">Note</span>
                <span className="text-yellow-300 text-xs italic text-right">{order.notes}</span>
              </div>
            )}
          </div>

          {/* Items */}
          <div>
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-3">Items ({order.items_count})</h3>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="bg-slate-800/40 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-orange-400 font-bold text-sm">{item.quantity}×</span>
                      <span className="text-white text-sm">{item.name}</span>
                    </div>
                    <span className="text-slate-300 text-sm">{fmt(parseFloat(item.price) * item.quantity)}</span>
                  </div>
                  {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                    <p className="text-slate-500 text-xs pl-7 mt-1">
                      {item.modifiers.map(m => m.name).join(' · ')}
                    </p>
                  )}
                  {(item.item_notes || item.notes) && (
                    <p className="text-yellow-300/70 text-xs pl-7 mt-1 italic">↳ {item.item_notes || item.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-slate-800/60 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal</span><span>{fmt(order.subtotal)}</span>
            </div>
            {hasDiscount && (
              <div className="flex justify-between text-green-400">
                <span>Discount {order.discount_type === 'percent' ? '' : ''}</span>
                <span>−{fmt(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-400">
              <span>Tax</span><span>{fmt(order.tax)}</span>
            </div>
            {parseFloat(order.loyalty_discount || 0) > 0 && (
              <div className="flex justify-between text-purple-400">
                <span>🎁 Loyalty</span><span>−{fmt(order.loyalty_discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-white font-bold text-base pt-2 border-t border-slate-700">
              <span>Total</span><span className="text-orange-400">{fmt(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-800 space-y-2 flex-shrink-0">
          {/* Rush toggle */}
          <button
            onClick={() => onToggleRush(order.id, !order.rush)}
            className={`w-full py-2 rounded-xl text-sm font-medium transition-colors ${
              order.rush
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            {order.rush ? '🔴 Remove Rush Flag' : '🚨 Mark as Rush'}
          </button>

          {/* Status flow */}
          <div className="flex gap-2">
            {(STATUS_FLOW[order.status] || []).map(s => (
              <button
                key={s}
                onClick={() => onUpdateStatus(order.id, s)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors capitalize ${
                  s === 'completed' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30'
                  : s === 'cancelled' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                  : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/25'
                }`}
              >
                {s === 'completed' ? '💳 Complete' : s === 'cancelled' ? '✕ Cancel' : `→ ${s}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
function SimplePayModal({ order, onClose, onPay, fmt }) {
  const [method, setMethod] = useState('cash')
  const [loading, setLoading] = useState(false)
  const handle = async () => { setLoading(true); await onPay(order.id, method); setLoading(false) }
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm">
        <div className="p-5 border-b border-slate-800">
          <h2 className="text-white font-bold text-lg">Complete Payment</h2>
          <p className="text-slate-400 text-sm mt-0.5">Order #{order.id} · {order.type}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-800 rounded-xl p-4 text-center">
            <p className="text-slate-400 text-sm">Total Amount</p>
            <p className="text-orange-400 text-4xl font-bold mt-1">{fmt(order.total)}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[['cash','💵','Cash'],['card','💳','Card'],['other','📱','Other']].map(([v,e,l]) => (
              <button key={v} onClick={() => setMethod(v)}
                className={`py-2.5 rounded-xl text-sm font-medium flex flex-col items-center gap-1 transition-all ${
                  method === v ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}>
                <span className="text-xl">{e}</span>{l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors">Cancel</button>
          <button onClick={handle} disabled={loading} className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
            {loading ? 'Processing…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Orders Page ──────────────────────────────────────────────────────────
export default function Orders() {
  const { fmt } = useCurrency()
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [payModal, setPayModal] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [wsStatus, setWsStatus] = useState('connecting')

  const wsRef = useRef(null)
  const pollRef = useRef(null)
  const reconnectRef = useRef(null)

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders')
      if (!res.ok) throw new Error('Failed to load orders')
      const data = await res.json()
      setOrders(Array.isArray(data) ? data : [])
    } catch (err) {
      toast('Failed to load orders. Please refresh.', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(fetchOrders, 15000)
    setWsStatus('polling')
  }, [fetchOrders])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => {
    fetchOrders()
    function connect() {
      try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
        const ws = new WebSocket(`${proto}//${location.host}/ws`)
        wsRef.current = ws
        ws.onopen = () => { setWsStatus('live'); stopPolling() }
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data)
            if (msg.type === 'order_created' || msg.type === 'order_updated') fetchOrders()
          } catch {}
        }
        ws.onclose = () => { wsRef.current = null; startPolling(); reconnectRef.current = setTimeout(connect, 5000) }
        ws.onerror = () => ws.close()
      } catch { startPolling() }
    }
    connect()
    return () => {
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close() }
      if (pollRef.current) clearInterval(pollRef.current)
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
    }
  }, [fetchOrders, startPolling, stopPolling])

  const updateStatus = async (id, status, opts = {}) => {
    try {
      const res = await apiFetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...opts })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update order')
      }
      fetchOrders()
      if (selectedOrder?.id === id) setSelectedOrder(null)
    } catch (err) {
      toast(err.message || 'Failed to update order status', 'error')
    }
  }

  const toggleRush = async (id, rush) => {
    try {
      await apiFetch(`/api/orders/${id}/rush`, { method: 'PATCH', body: JSON.stringify({ rush }) })
      setOrders(prev => prev.map(o => o.id === id ? { ...o, rush } : o))
      if (selectedOrder?.id === id) setSelectedOrder(prev => prev ? { ...prev, rush } : prev)
    } catch (err) { toast('Failed to update rush flag', 'error') }
  }

  const handlePay = async (orderId, method) => {
    await updateStatus(orderId, 'completed', { payment_method: method })
    setPayModal(null)
  }

  const statuses = ['all', 'pending', 'preparing', 'ready', 'completed', 'cancelled']

  const filtered = orders.filter(o => {
    if (filter !== 'all' && o.status !== filter) return false
    if (paymentFilter === 'unpaid') { if (o.payment_method) return false }
    else if (paymentFilter !== 'all') { if (o.payment_method !== paymentFilter) return false }
    if (dateFrom && new Date(o.created_at) < new Date(dateFrom + 'T00:00:00')) return false
    if (dateTo && new Date(o.created_at) > new Date(dateTo + 'T23:59:59.999')) return false
    return true
  })

  const hasExtraFilters = !!dateFrom || !!dateTo || paymentFilter !== 'all'
  const clearFilters = () => { setDateFrom(''); setDateTo(''); setPaymentFilter('all') }

  const counts = {}
  for (const o of orders) counts[o.status] = (counts[o.status] || 0) + 1

  const WsDot = () => (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
      wsStatus === 'live' ? 'bg-green-500/15 text-green-400' :
      wsStatus === 'polling' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-slate-700 text-slate-400'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'live' ? 'bg-green-400 animate-pulse' : wsStatus === 'polling' ? 'bg-yellow-400' : 'bg-slate-500'}`} />
      {wsStatus === 'live' ? 'Live' : wsStatus === 'polling' ? 'Polling' : '…'}
    </span>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Orders</h1>
            <WsDot />
          </div>
          <p className="text-slate-400 text-sm mt-1">{orders.length} total orders</p>
        </div>
        <button onClick={fetchOrders} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors flex items-center gap-1.5 ${
              filter === s ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {s}
            {s !== 'all' && counts[s] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === s ? 'bg-white/20' : 'bg-slate-700'}`}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap items-end bg-slate-900/50 border border-slate-800 rounded-xl p-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">From</label>
          <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">To</label>
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Payment</label>
          <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500">
            <option value="all">All methods</option>
            <option value="cash">💵 Cash</option>
            <option value="card">💳 Card</option>
            <option value="other">📱 Other</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
        {hasExtraFilters && (
          <button onClick={clearFilters} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
            ✕ Clear
          </button>
        )}
        <span className="ml-auto text-slate-500 text-sm self-center">
          {filtered.length} of {orders.length}
        </span>
      </div>

      {/* Order list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-4xl mb-3">📋</p>
          <p>No orders found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const hasDiscount = parseFloat(order.discount || 0) > 0
            return (
              <div
                key={order.id}
                className={`bg-slate-900 border rounded-xl p-4 cursor-pointer hover:border-slate-700 transition-all ${
                  selectedOrder?.id === order.id ? 'border-orange-500/50' :
                  order.rush ? 'border-red-500/40' : 'border-slate-800'
                }`}
                onClick={() => setSelectedOrder(order.id === selectedOrder?.id ? null : order)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                      <span className="text-white font-semibold">Order #{order.id}</span>
                      {order.rush && (
                        <span className="bg-red-500/20 text-red-400 border border-red-500/40 text-xs px-2 py-0.5 rounded-full font-bold">🔴 RUSH</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLES[order.status] || STATUS_STYLES.cancelled}`}>
                        {order.status}
                      </span>
                      <span className="text-xs text-slate-500 capitalize bg-slate-800 px-2 py-0.5 rounded-full">{order.type}</span>
                      {order.payment_method && (
                        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                          {PAYMENT_ICONS[order.payment_method] || '💳'} {order.payment_method}
                        </span>
                      )}
                    </div>
                    {order.table_number && <p className="text-slate-400 text-xs">Table {order.table_number}</p>}
                    {order.staff_name && <p className="text-slate-500 text-xs">Staff: {order.staff_name}</p>}
                    {order.notes && <p className="text-slate-500 text-xs mt-0.5 italic">"{order.notes}"</p>}
                    <p className="text-slate-600 text-xs mt-1">{new Date(order.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-orange-400 font-bold text-lg">{fmt(order.total)}</p>
                    {hasDiscount && (
                      <p className="text-green-400 text-xs">−{fmt(order.discount)} off</p>
                    )}
                    <p className="text-slate-500 text-xs">{order.items_count} items</p>
                  </div>
                </div>

                {/* Quick actions — stop click from bubbling */}
                <div className="flex gap-2 mt-3 flex-wrap items-center" onClick={e => e.stopPropagation()}>
                  {(STATUS_FLOW[order.status] || []).map(s => (
                    <button key={s}
                      onClick={() => s === 'completed' ? setPayModal(order) : updateStatus(order.id, s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                        s === 'completed' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30'
                        : s === 'cancelled' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                        : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/25'
                      }`}>
                      {s === 'completed' ? '💳 Pay' : s === 'cancelled' ? '✕' : `→ ${s}`}
                    </button>
                  ))}
                  {order.status === 'completed' && !order.payment_method && (
                    <button onClick={() => setPayModal(order)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border border-orange-500/25 transition-colors">
                      💳 Record Payment
                    </button>
                  )}
                  <button
                    onClick={() => toggleRush(order.id, !order.rush)}
                    className={`ml-auto px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      order.rush ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20' : 'text-slate-500 bg-slate-800 hover:text-red-400'
                    }`}
                    title={order.rush ? 'Remove rush' : 'Mark rush'}
                  >
                    {order.rush ? '🔴' : '🚨'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail drawer */}
      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={updateStatus}
          onToggleRush={toggleRush}
          fmt={fmt}
        />
      )}

      {/* Payment modal */}
      {payModal && (
        <SimplePayModal
          order={payModal}
          onClose={() => setPayModal(null)}
          onPay={handlePay}
          fmt={fmt}
        />
      )}
    </div>
  )
}
