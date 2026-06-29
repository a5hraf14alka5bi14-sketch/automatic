import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'

const STATUS_STYLES = {
  pending:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  preparing: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  ready:     'bg-green-500/10 text-green-400 border-green-500/30',
  completed: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/30',
}

const STATUS_FLOW = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

const PAYMENT_ICONS = { cash: '💵', card: '💳', other: '📱' }

export default function Orders() {
  const { fmt } = useCurrency()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [payModal, setPayModal] = useState(null)
  const [payMethod, setPayMethod] = useState('cash')
  const [payLoading, setPayLoading] = useState(false)

  const fetchOrders = async () => {
    try {
      const res = await apiFetch('/api/orders')
      const data = await res.json()
      setOrders(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 15000)
    return () => clearInterval(interval)
  }, [])

  const updateStatus = async (id, status, opts = {}) => {
    try {
      await apiFetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...opts })
      })
      fetchOrders()
    } catch (err) { console.error(err) }
  }

  const handlePay = async () => {
    if (!payModal) return
    setPayLoading(true)
    await updateStatus(payModal.id, 'completed', { payment_method: payMethod })
    setPayModal(null)
    setPayLoading(false)
  }

  const statuses = ['all', 'pending', 'preparing', 'ready', 'completed', 'cancelled']
  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  const counts = {}
  for (const o of orders) counts[o.status] = (counts[o.status] || 0) + 1

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Orders</h1>
          <p className="text-slate-400 text-sm mt-1">{orders.length} total orders</p>
        </div>
        <button onClick={fetchOrders} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
          ↻ Refresh
        </button>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
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
          {filtered.map(order => (
            <div key={order.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                    <span className="text-white font-semibold">Order #{order.id}</span>
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
                  {order.notes && <p className="text-slate-500 text-xs mt-0.5 italic">"{order.notes}"</p>}
                  <p className="text-slate-600 text-xs mt-1">{new Date(order.created_at).toLocaleString()}</p>
                  {Array.isArray(order.items) && order.items.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {order.items.map((item, i) => (
                        <span key={i} className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md">
                          {item.quantity}× {item.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-orange-400 font-bold text-lg">{fmt(order.total)}</p>
                  <p className="text-slate-500 text-xs">{order.items_count} items</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap items-center">
                {(STATUS_FLOW[order.status] || []).map(s => (
                  <button
                    key={s}
                    onClick={() => s === 'completed' ? setPayModal(order) : updateStatus(order.id, s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                      s === 'completed' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30'
                      : s === 'cancelled' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                      : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/25'
                    }`}
                  >
                    {s === 'completed' ? '💳 Complete & Pay' : s === 'cancelled' ? '✕ Cancel' : `→ ${s}`}
                  </button>
                ))}
                {order.status === 'completed' && !order.payment_method && (
                  <button
                    onClick={() => setPayModal(order)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border border-orange-500/25 transition-colors"
                  >
                    💳 Record Payment
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-800">
              <h2 className="text-white font-bold text-lg">Complete Payment</h2>
              <p className="text-slate-400 text-sm mt-0.5">Order #{payModal.id} · {payModal.type}</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-slate-400 text-sm">Total Amount</p>
                <p className="text-orange-400 text-4xl font-bold mt-1">{fmt(payModal.total)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-2 font-medium">Payment Method</p>
                <div className="grid grid-cols-3 gap-2">
                  {[['cash', '💵', 'Cash'], ['card', '💳', 'Card'], ['other', '📱', 'Other']].map(([v, e, l]) => (
                    <button
                      key={v}
                      onClick={() => setPayMethod(v)}
                      className={`py-2.5 rounded-xl text-sm font-medium flex flex-col items-center gap-1 transition-all ${
                        payMethod === v ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="text-xl">{e}</span>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setPayModal(null)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors">
                Cancel
              </button>
              <button onClick={handlePay} disabled={payLoading} className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
                {payLoading ? 'Processing…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
