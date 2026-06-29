import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api.js'

function elapsed(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 60000)
  if (diff < 1) return { label: 'just now', color: 'text-slate-400', urgent: false }
  if (diff < 10) return { label: `${diff}m`, color: 'text-slate-400', urgent: false }
  if (diff < 20) return { label: `${diff}m ⚠️`, color: 'text-yellow-400', urgent: true }
  return { label: `${diff}m 🔴`, color: 'text-red-400', urgent: true }
}

const COL_CONFIG = {
  pending: {
    title: 'New Orders',
    dot: 'bg-yellow-400',
    titleColor: 'text-yellow-400',
    actions: [
      { label: 'Start Preparing', to: 'preparing', style: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30' },
      { label: '✕ Cancel', to: 'cancelled', style: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' }
    ]
  },
  preparing: {
    title: 'Preparing',
    dot: 'bg-blue-400',
    titleColor: 'text-blue-400',
    actions: [
      { label: '✓ Mark Ready', to: 'ready', style: 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30' }
    ]
  },
  ready: {
    title: 'Ready to Serve',
    dot: 'bg-green-400',
    titleColor: 'text-green-400',
    actions: [
      { label: '💳 Complete', to: 'completed', style: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/30' }
    ]
  }
}

function KitchenCard({ order, actions, onAction }) {
  const time = elapsed(order.created_at)
  return (
    <div className={`bg-slate-900 border rounded-xl p-4 transition-all ${time.urgent ? 'border-red-500/30' : 'border-slate-800'}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-white font-bold text-lg">#{order.id}</p>
          <p className="text-slate-400 text-xs capitalize mt-0.5">
            {order.type}{order.table_number ? ` · Table ${order.table_number}` : ''}
          </p>
        </div>
        <span className={`text-xs font-medium ${time.color}`}>{time.label}</span>
      </div>

      {Array.isArray(order.items) && order.items.length > 0 ? (
        <div className="space-y-1 mb-3">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-orange-400 font-bold w-6 flex-shrink-0">{item.quantity}×</span>
              <span className="text-white">{item.name}</span>
              {item.notes && <span className="text-slate-500 text-xs italic">({item.notes})</span>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-slate-600 text-xs mb-3">{order.items_count} item(s)</p>
      )}

      {order.notes && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2.5 py-1.5 mb-3">
          <p className="text-yellow-300 text-xs italic">📝 {order.notes}</p>
        </div>
      )}

      <div className="flex gap-2">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={() => onAction(order.id, a.to)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${a.style}`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Kitchen() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)

  const fetchOrders = async () => {
    try {
      const res = await apiFetch('/api/orders?status=pending,preparing,ready')
      const data = await res.json()
      setOrders(Array.isArray(data) ? data : [])
      setLastUpdate(new Date())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 10000)
    return () => clearInterval(interval)
  }, [])

  const updateStatus = async (id, status) => {
    try {
      await apiFetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      })
      fetchOrders()
    } catch (err) { console.error(err) }
  }

  const byStatus = {
    pending: orders.filter(o => o.status === 'pending'),
    preparing: orders.filter(o => o.status === 'preparing'),
    ready: orders.filter(o => o.status === 'ready'),
  }

  const totalActive = orders.length

  if (loading) return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Kitchen Display</h1>
      <div className="grid grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-36" />
        ))}
      </div>
    </div>
  )

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Kitchen Display</h1>
          <p className="text-slate-400 text-sm mt-1">
            {totalActive} active order{totalActive !== 1 ? 's' : ''} · auto-refreshes every 10s
            {lastUpdate && <span className="ml-2 text-slate-600">· {lastUpdate.toLocaleTimeString()}</span>}
          </p>
        </div>
        <button onClick={fetchOrders} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
          ↻ Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {Object.entries(COL_CONFIG).map(([status, cfg]) => (
          <div key={status}>
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
              <h2 className={`font-semibold ${cfg.titleColor}`}>
                {cfg.title} ({byStatus[status].length})
              </h2>
            </div>
            <div className="space-y-3">
              {byStatus[status].length === 0 ? (
                <div className="border-2 border-dashed border-slate-800 rounded-xl p-8 text-center">
                  <p className="text-slate-700 text-sm">Empty</p>
                </div>
              ) : byStatus[status].map(o => (
                <KitchenCard
                  key={o.id}
                  order={o}
                  actions={cfg.actions}
                  onAction={updateStatus}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
