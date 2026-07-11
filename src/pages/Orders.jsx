import React, { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { wsUrl } from '../config.js'
import { useCurrency } from '../utils/currency.js'
import { useToast } from '../context/ToastContext.jsx'
import ShiftCloseModal from '../components/ShiftCloseModal.jsx'
import { useDialogA11y } from '../hooks/useDialogA11y.js'

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

const PAGE_SIZE = 50   // server default; capped server-side at 200

// ── Order Detail Drawer ───────────────────────────────────────────────────────
function OrderDetailDrawer({ order, onClose, onUpdateStatus, onToggleRush, fmt }) {
  const closeBtnRef = useRef(null)
  // Shared dialog a11y: initial focus on the close button, Escape to close,
  // Tab trap, and focus restore — stack-aware so a modal opened on top of the
  // drawer (e.g. payment) takes over Escape handling while it is open.
  const panelRef = useDialogA11y(onClose, { initialFocusRef: closeBtnRef })

  if (!order) return null
  const items = Array.isArray(order.items) ? order.items : []
  const hasDiscount = parseFloat(order.discount || 0) > 0

  return (
    <div className="fixed inset-0 z-40 flex" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex-1 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-drawer-title"
        className="w-full max-w-md bg-slate-900 border-l border-slate-800 flex flex-col h-full shadow-2xl"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="order-drawer-title" className="text-white font-bold text-lg">Order #{order.id}</h2>
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
          <button ref={closeBtnRef} onClick={onClose} aria-label={`Close order #${order.id} details`} className="text-slate-500 hover:text-white text-xl transition-colors w-8 h-8 flex items-center justify-center">✕</button>
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
                      <span className="text-white text-sm">{item.name}{item.name_ar ? <span className="text-slate-400" dir="rtl"> · {item.name_ar}</span> : null}</span>
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
  const panelRef = useDialogA11y(onClose)
  const handle = async () => { setLoading(true); await onPay(order.id, method); setLoading(false) }
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="simple-pay-title" className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm">
        <div className="p-5 border-b border-slate-800">
          <h2 id="simple-pay-title" className="text-white font-bold text-lg">Complete Payment</h2>
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

// ── Void Approval Modal ───────────────────────────────────────────────────────
function VoidApprovalModal({ orderId, wasCompleted, userRole, onConfirm, onClose }) {
  const [reason, setReason]   = useState('')
  const [pin, setPin]         = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const needsPin = !['admin', 'manager'].includes(userRole) && wasCompleted
  // The reason textarea autofocuses; the hook detects that and leaves it.
  const panelRef = useDialogA11y(onClose)

  const handleConfirm = async () => {
    if (!reason.trim()) { setError('A cancellation reason is required.'); return }
    if (needsPin && !pin.trim()) { setError('Manager PIN is required.'); return }
    setLoading(true); setError('')
    try {
      await onConfirm({ void_reason: reason.trim(), void_manager_pin: needsPin ? pin.trim() : undefined })
    } catch (e) { setError(e.message || 'Error'); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="void-approval-title" className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm">
        <div className="p-5 border-b border-slate-800">
          <h2 id="void-approval-title" className="text-white font-bold text-lg">⚠️ Cancel Order #{String(orderId).padStart(4,'0')}</h2>
          {wasCompleted && (
            <span className="inline-block mt-1 text-xs bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20">
              Completed — will reverse inventory &amp; loyalty
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          {wasCompleted && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-300 text-sm">
              ⚠️ This order was already completed and payment was collected. Voiding will reverse stock and loyalty adjustments.
            </div>
          )}
          <div>
            <label className="block text-slate-300 text-sm mb-1.5 font-medium">
              Cancellation reason <span className="text-red-400">*</span>
            </label>
            <textarea
              autoFocus
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Customer changed mind, wrong item…"
              rows={3}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>
          {needsPin && (
            <div>
              <label className="block text-slate-300 text-sm mb-1.5 font-medium">
                Manager override PIN <span className="text-red-400">*</span>
              </label>
              <input
                type="password" value={pin} onChange={e => setPin(e.target.value)}
                placeholder="Enter manager PIN"
                maxLength={20}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500"
              />
              <p className="text-slate-500 text-xs mt-1">Required to void a completed order (set in Settings → Operations → Security)</p>
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors">
            Keep Order
          </button>
          <button onClick={handleConfirm} disabled={loading || !reason.trim()}
            className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
            {loading ? 'Cancelling…' : 'Cancel Order'}
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
  const [voidModal, setVoidModal] = useState(null)     // { orderId, wasCompleted }
  const [showShiftModal, setShowShiftModal] = useState(false)
  const userRole = (() => { try { return JSON.parse(localStorage.getItem('auth_user') || '{}').role || 'staff' } catch { return 'staff' } })()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [branchId, setBranchId] = useState('')
  const [branches, setBranches] = useState([])
  const [searchInput, setSearchInput] = useState('')   // immediate input value
  const [search, setSearch] = useState('')             // debounced value used in queries
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [wsStatus, setWsStatus] = useState('connecting')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({})

  const wsRef = useRef(null)
  const pollRef = useRef(null)
  const reconnectRef = useRef(null)
  const pageRef = useRef(0)   // keeps live refresh (WS/poll) on the current page without re-creating fetchOrders
  const autoOpenedSearchRef = useRef(null)   // remembers the search term we already auto-opened, so we don't re-open after the user closes the drawer

  // Current filter values mirrored into a ref so the stable fetchOrders/fetchCounts
  // callbacks (used by WS + polling live-refresh) always read the latest filters
  // without being re-created on every filter change.
  const filtersRef = useRef({ filter, paymentFilter, dateFrom, dateTo, search, branchId })
  filtersRef.current = { filter, paymentFilter, dateFrom, dateTo, search, branchId }

  // Serialise the active filters into query params. `withPagination` adds
  // limit/offset + status (list query); the counts query omits status so its
  // per-status badges reflect every status under the current payment/date filter.
  const buildFilterParams = useCallback((targetPage, withPagination) => {
    const f = filtersRef.current
    const params = new URLSearchParams()
    if (withPagination) {
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(targetPage * PAGE_SIZE))
      if (f.filter !== 'all') params.set('status', f.filter)
    }
    if (f.paymentFilter !== 'all') params.set('payment', f.paymentFilter)
    if (f.dateFrom) params.set('date_from', new Date(f.dateFrom + 'T00:00:00').toISOString())
    if (f.dateTo) params.set('date_to', new Date(f.dateTo + 'T23:59:59.999').toISOString())
    if (f.search) params.set('search', f.search)
    if (f.branchId) params.set('branch_id', f.branchId)
    return params
  }, [])

  const fetchCounts = useCallback(async () => {
    try {
      const params = buildFilterParams(0, false)
      const res = await apiFetch(`/api/orders/counts?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setCounts(data && typeof data === 'object' ? data : {})
    } catch { /* counts are best-effort; badges just stay stale */ }
  }, [buildFilterParams])

  const fetchOrders = useCallback(async (targetPage = pageRef.current) => {
    try {
      const params = buildFilterParams(targetPage, true)
      const res = await apiFetch(`/api/orders?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load orders')
      const totalCount = parseInt(res.headers.get('X-Total-Count'), 10)
      const data = await res.json()
      setTotal(Number.isFinite(totalCount) ? totalCount : (Array.isArray(data) ? data.length : 0))
      setOrders(Array.isArray(data) ? data : [])
      pageRef.current = targetPage
      setPage(targetPage)
    } catch (err) {
      toast('Failed to load orders. Please refresh.', 'error')
    } finally {
      setLoading(false)
    }
  }, [buildFilterParams, toast])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const goToPage = useCallback((p) => {
    const np = Math.min(Math.max(0, p), Math.max(0, Math.ceil(total / PAGE_SIZE) - 1))
    if (np === pageRef.current) return
    setLoading(true)
    fetchOrders(np)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [total, fetchOrders])

  // Live-refresh the current page + status counts together
  const liveRefresh = useCallback(() => { fetchOrders(); fetchCounts() }, [fetchOrders, fetchCounts])

  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(liveRefresh, 15000)
    setWsStatus('polling')
  }, [liveRefresh])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  // Debounce the raw search input so we don't fire a query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Re-run the query whenever a filter changes; changing a filter resets to page 1.
  // Load branches list once for the filter dropdown
  useEffect(() => {
    apiFetch('/api/branches').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setBranches(d)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    pageRef.current = 0
    fetchOrders(0)
    fetchCounts()
  }, [filter, paymentFilter, dateFrom, dateTo, search, branchId, fetchOrders, fetchCounts])

  // Jump-to-order: when the search term is an exact numeric order-id match that
  // returns exactly one result, auto-open its detail drawer. We remember which
  // search term we already auto-opened so live refreshes (WS/poll) — or the user
  // closing the drawer — don't surprise-reopen it. Partial/multi-result searches
  // and non-numeric (table/customer) searches never auto-open.
  useEffect(() => {
    if (!search) { autoOpenedSearchRef.current = null; return }
    if (loading) return
    if (autoOpenedSearchRef.current === search) return
    if (!/^\d+$/.test(search)) return
    if (orders.length !== 1) return
    if (orders[0].id !== parseInt(search, 10)) return
    autoOpenedSearchRef.current = search
    setSelectedOrder(orders[0])
  }, [orders, search, loading])

  useEffect(() => {
    function connect() {
      try {
        const ws = new WebSocket(wsUrl('/ws'))
        wsRef.current = ws
        ws.onopen = () => { setWsStatus('live'); stopPolling() }
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data)
            if (msg.type === 'order_created' || msg.type === 'order_updated') liveRefresh()
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
  }, [liveRefresh, startPolling, stopPolling])

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

  // Open void-approval modal instead of cancelling inline
  const requestVoid = useCallback((order) => {
    setVoidModal({ orderId: order.id, wasCompleted: order.status === 'completed' })
  }, [])

  // Called by VoidApprovalModal on confirm
  const confirmVoid = useCallback(async ({ void_reason, void_manager_pin }) => {
    if (!voidModal) return
    const res = await apiFetch(`/api/orders/${voidModal.orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled', void_reason, void_manager_pin })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to cancel order')
    }
    setVoidModal(null)
    fetchOrders()
    if (selectedOrder?.id === voidModal.orderId) setSelectedOrder(null)
    toast('Order cancelled', 'info')
  }, [voidModal, fetchOrders, selectedOrder])

  const handlePay = async (orderId, method) => {
    await updateStatus(orderId, 'completed', { payment_method: method })
    setPayModal(null)
  }

  const statuses = ['all', 'pending', 'preparing', 'ready', 'completed', 'cancelled']

  // Filtering + counts now run server-side, so `orders` already holds the
  // current filtered page and `counts` holds whole-dataset per-status totals.
  const hasExtraFilters = !!dateFrom || !!dateTo || paymentFilter !== 'all' || !!searchInput || !!branchId
  const clearFilters = () => { setDateFrom(''); setDateTo(''); setPaymentFilter('all'); setSearchInput(''); setBranchId('') }

  const WsDot = () => (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
      wsStatus === 'live' ? 'bg-green-500/15 text-green-400' :
      wsStatus === 'polling' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-slate-700 text-slate-400'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'live' ? 'bg-green-400 animate-pulse' : wsStatus === 'polling' ? 'bg-yellow-400' : 'bg-slate-500'}`} />
      {wsStatus === 'live' ? 'Live' : wsStatus === 'polling' ? 'Polling' : '…'}
    </span>
  )

  const [filtersOpen, setFiltersOpen] = React.useState(false)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Orders</h1>
            <WsDot />
          </div>
          <p className="hidden sm:block text-slate-400 text-sm mt-1">{total} total orders</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {['admin', 'manager'].includes(userRole) && (
            <button onClick={() => setShowShiftModal(true)}
              className="px-3 sm:px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-orange-400 rounded-lg text-xs sm:text-sm font-medium transition-colors">
              🕐 <span className="hidden sm:inline">Z-Report</span>
            </button>
          )}
          <button onClick={fetchOrders} aria-label="Refresh" className="px-3 sm:px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
            ↻ <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Status tabs — horizontal scroll on mobile */}
      <div className="flex gap-1.5 sm:gap-2 mb-4 sm:mb-5 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 flex-nowrap sm:flex-wrap" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium capitalize transition-colors flex items-center gap-1 sm:gap-1.5 flex-shrink-0 ${
              filter === s ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {s}
            {s !== 'all' && counts[s] > 0 && (
              <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full ${filter === s ? 'bg-white/20' : 'bg-slate-700'}`}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters — search always visible; date/payment collapsed on mobile */}
      <div className="mb-4 bg-slate-900/50 border border-slate-800 rounded-xl p-3 space-y-2">
        {/* Search row + filter toggle */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">🔍</span>
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Order # · table · customer"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-sm">✕</button>
            )}
          </div>
          <button
            onClick={() => setFiltersOpen(f => !f)}
            className={`sm:hidden flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              (filtersOpen || hasExtraFilters) ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {hasExtraFilters ? '● Filters' : 'Filters'}
          </button>
        </div>

        {/* Expanded filter controls — always visible on desktop, toggled on mobile */}
        <div className={`${filtersOpen ? 'flex' : 'hidden'} sm:flex gap-2 flex-wrap items-end pt-1 border-t border-slate-800`}>
            <div>
              <label className="block text-xs text-slate-500 mb-1">From</label>
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500 w-full sm:w-auto" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">To</label>
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500 w-full sm:w-auto" />
            </div>
            <div className="flex-1 min-w-[130px]">
              <label className="block text-xs text-slate-500 mb-1">Payment</label>
              <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500">
                <option value="all">All methods</option>
                <option value="cash">💵 Cash</option>
                <option value="card">💳 Card</option>
                <option value="other">📱 Other</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>
            {branches.length > 1 && (
              <div className="flex-1 min-w-[130px]">
                <label className="block text-xs text-slate-500 mb-1">Branch</label>
                <select value={branchId} onChange={e => setBranchId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500">
                  <option value="">All branches</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}
            {hasExtraFilters && (
              <button onClick={() => { clearFilters(); setFiltersOpen(false) }} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors border border-red-500/20">
                ✕ Clear all
              </button>
            )}
          </div>
        {!filtersOpen && (
          <p className="sm:hidden text-slate-600 text-xs">{total} order{total !== 1 ? 's' : ''} matching</p>
        )}
      </div>

      {/* Order list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-4xl mb-3">📋</p>
          <p>No orders found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
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
                      onClick={() => s === 'completed' ? setPayModal(order) : s === 'cancelled' ? requestVoid(order) : updateStatus(order.id, s)}
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

      {/* Pagination controls */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-800 flex-wrap">
          <p className="text-slate-500 text-sm">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page === 0 || loading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 rounded-lg text-sm transition-colors"
            >
              ← Previous
            </button>
            <span className="text-slate-400 text-sm px-2">Page {page + 1} of {pageCount}</span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= pageCount - 1 || loading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 rounded-lg text-sm transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={(id, s) => s === 'cancelled' ? requestVoid(orders.find(o => o.id === id) || { id, status: selectedOrder?.status }) : updateStatus(id, s)}
          onToggleRush={toggleRush}
          fmt={fmt}
        />
      )}

      {/* Void approval modal */}
      {voidModal && (
        <VoidApprovalModal
          orderId={voidModal.orderId}
          wasCompleted={voidModal.wasCompleted}
          userRole={userRole}
          onConfirm={confirmVoid}
          onClose={() => setVoidModal(null)}
        />
      )}

      {/* Shift close / Z-Report modal */}
      {showShiftModal && (
        <ShiftCloseModal
          onClose={() => setShowShiftModal(false)}
          onDone={(action) => {
            setShowShiftModal(false)
            toast(action === 'opened' ? 'Shift opened' : 'Shift closed — Z-Report generated', 'success')
          }}
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
