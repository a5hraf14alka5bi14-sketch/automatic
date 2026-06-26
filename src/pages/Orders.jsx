import React, { useState, useEffect } from 'react'

const statusColor = (s) => {
  const map = {
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    preparing: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    ready: 'bg-green-500/10 text-green-400 border-green-500/30',
    completed: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/30'
  }
  return map[s] || 'bg-slate-500/10 text-slate-400 border-slate-500/30'
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/orders')
      const data = await res.json()
      setOrders(data)
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

  const updateStatus = async (id, status) => {
    try {
      await fetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      fetchOrders()
    } catch (err) {
      console.error(err)
    }
  }

  const statuses = ['all', 'pending', 'preparing', 'ready', 'completed', 'cancelled']
  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Orders</h1>
          <p className="text-slate-400 text-sm mt-1">{orders.length} total orders</p>
        </div>
        <button onClick={fetchOrders} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
          Refresh
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
              filter === s ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-4xl mb-3">📋</p>
          <p>No orders found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <div key={order.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-white font-semibold">Order #{order.id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${statusColor(order.status)}`}>
                      {order.status}
                    </span>
                    <span className="text-xs text-slate-500 capitalize bg-slate-800 px-2 py-0.5 rounded-full">{order.type}</span>
                  </div>
                  {order.table_number && (
                    <p className="text-slate-400 text-xs">Table {order.table_number}</p>
                  )}
                  <p className="text-slate-500 text-xs mt-1">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-orange-400 font-bold">${parseFloat(order.total).toFixed(2)}</p>
                  <p className="text-slate-500 text-xs">{order.items_count} items</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                {['pending', 'preparing', 'ready', 'completed', 'cancelled'].map(s => (
                  <button
                    key={s}
                    onClick={() => updateStatus(order.id, s)}
                    disabled={order.status === s}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                      order.status === s
                        ? 'bg-slate-700 text-slate-300 cursor-default'
                        : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
