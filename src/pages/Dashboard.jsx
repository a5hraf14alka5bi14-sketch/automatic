import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api.js'

const StatCard = ({ label, value, sub, color, icon }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
    <div className="flex items-center justify-between mb-2">
      <p className="text-slate-400 text-sm font-medium">{label}</p>
      {icon && <span className="text-lg opacity-60">{icon}</span>}
    </div>
    <p className={`text-3xl font-bold mt-1 ${color || 'text-white'}`}>{value}</p>
    {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
  </div>
)

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, ordersRes] = await Promise.all([
          apiFetch('/api/dashboard/stats'),
          apiFetch('/api/orders?limit=5')
        ])
        const statsData = await statsRes.json()
        const ordersData = await ordersRes.json()
        setStats(statsData)
        setOrders(Array.isArray(ordersData) ? ordersData : [])
      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const fmt = (val) => 'OMR ' + Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

  const statusColor = (s) => {
    const map = { pending: 'text-yellow-400', preparing: 'text-blue-400', ready: 'text-green-400', completed: 'text-slate-400', cancelled: 'text-red-400' }
    return map[s] || 'text-slate-400'
  }

  const statusDot = (s) => {
    const map = { pending: 'bg-yellow-400', preparing: 'bg-blue-400', ready: 'bg-green-400', completed: 'bg-slate-400', cancelled: 'bg-red-400' }
    return map[s] || 'bg-slate-400'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Welcome back — here's what's happening today.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon="💵" label="Today's Revenue" value={fmt(stats?.todayRevenue)} sub={`${stats?.todayOrders || 0} orders`} color="text-orange-400" />
          <StatCard icon="⏳" label="Active Orders" value={stats?.activeOrders || 0} sub="in progress" color="text-blue-400" />
          <StatCard icon="🪑" label="Tables Occupied" value={`${stats?.tablesOccupied || 0}/${stats?.totalTables || 10}`} sub="dine-in" color="text-green-400" />
          <StatCard icon="📅" label="Monthly Revenue" value={fmt(stats?.monthRevenue)} sub="this month" color="text-purple-400" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Recent Orders</h2>
          {!loading && orders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-slate-500 text-sm">No orders yet today</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map(order => (
                <div key={order.id} className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(order.status)}`} />
                    <div>
                      <p className="text-white text-sm font-medium">Order #{order.id}</p>
                      <p className="text-slate-500 text-xs capitalize">{order.type}{order.table_number ? ` · Table ${order.table_number}` : ''} · {order.items_count} items</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-sm font-medium">{fmt(order.total)}</p>
                    <p className={`text-xs font-medium capitalize ${statusColor(order.status)}`}>{order.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Quick Stats</h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-6 bg-slate-800 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { label: 'Avg Order Value', value: fmt(stats?.avgOrderValue), color: 'text-white' },
                { label: 'Pending Orders', value: stats?.pendingOrders || 0, color: 'text-yellow-400' },
                { label: 'Customers Today', value: stats?.customersToday || 0, color: 'text-cyan-400' },
                { label: 'Low Stock Items', value: stats?.lowStockCount || 0, color: stats?.lowStockCount > 0 ? 'text-red-400' : 'text-green-400' },
                { label: 'Menu Items Active', value: stats?.menuItems || 0, color: 'text-white' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">{label}</span>
                  <span className={`font-semibold text-sm ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
