import React, { useState, useEffect } from 'react'

function elapsed(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 60000)
  if (diff < 1) return 'just now'
  return `${diff}m ago`
}

export default function Kitchen() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/orders?status=pending,preparing,ready')
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
    const interval = setInterval(fetchOrders, 10000)
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

  const pending = orders.filter(o => o.status === 'pending')
  const preparing = orders.filter(o => o.status === 'preparing')
  const ready = orders.filter(o => o.status === 'ready')

  const KitchenCard = ({ order, actions }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-white font-bold">#{order.id}</p>
          <p className="text-slate-400 text-xs capitalize">{order.type}{order.table_number ? ` • Table ${order.table_number}` : ''}</p>
        </div>
        <span className="text-slate-400 text-xs">{elapsed(order.created_at)}</span>
      </div>
      <p className="text-slate-500 text-xs mb-3">{order.items_count} item(s)</p>
      <div className="flex gap-2">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={() => updateStatus(order.id, a.to)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${a.style}`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )

  if (loading) return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Kitchen Display</h1>
      <div className="grid grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-32" />
        ))}
      </div>
    </div>
  )

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Kitchen Display</h1>
          <p className="text-slate-400 text-sm mt-1">Live order queue — auto-refreshes every 10s</p>
        </div>
        <button onClick={fetchOrders} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
            <h2 className="text-yellow-400 font-semibold">Pending ({pending.length})</h2>
          </div>
          <div className="space-y-3">
            {pending.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-8">No pending orders</p>
            ) : pending.map(o => (
              <KitchenCard key={o.id} order={o} actions={[
                { label: 'Start Preparing', to: 'preparing', style: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30' },
                { label: 'Cancel', to: 'cancelled', style: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' }
              ]} />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-blue-400"></div>
            <h2 className="text-blue-400 font-semibold">Preparing ({preparing.length})</h2>
          </div>
          <div className="space-y-3">
            {preparing.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-8">Nothing being prepared</p>
            ) : preparing.map(o => (
              <KitchenCard key={o.id} order={o} actions={[
                { label: 'Mark Ready', to: 'ready', style: 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30' }
              ]} />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-green-400"></div>
            <h2 className="text-green-400 font-semibold">Ready ({ready.length})</h2>
          </div>
          <div className="space-y-3">
            {ready.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-8">No orders ready</p>
            ) : ready.map(o => (
              <KitchenCard key={o.id} order={o} actions={[
                { label: 'Complete', to: 'completed', style: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/30' }
              ]} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
