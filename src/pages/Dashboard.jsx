import React, { useState, useEffect } from 'react'

const StatCard = ({ label, value, sub, color }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
    <p className="text-slate-400 text-sm font-medium">{label}</p>
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
          fetch('/api/dashboard/stats'),
          fetch('/api/orders?limit=5')
        ])
        const statsData = await statsRes.json()
        const ordersData = await ordersRes.json()
        setStats(statsData)
        setOrders(ordersData)
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

  const formatCurrency = (val) => {
    if (val === undefined || val === null) return '$0'
    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 0 })
  }

  const statusColor = (s) => {
    const map = { pending: 'text-yellow-400', preparing: 'text-blue-400', ready: 'text-green-400', completed: 'text-slate-400', cancelled: 'text-red-400' }
    return map[s] || 'text-slate-400'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Welcome back — here's what's happening today.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Today's Revenue" value={formatCurrency(stats?.todayRevenue)} sub={`${stats?.todayOrders || 0} orders`} color="text-orange-400" />
          <StatCard label="Active Orders" value={stats?.activeOrders || 0} sub="in progress" color="text-blue-400" />
          <StatCard label="Tables Occupied" value={`${stats?.tablesOccupied || 0}/${stats?.totalTables || 10}`} sub="dine-in" color="text-green-400" />
          <StatCard label="Monthly Revenue" value={formatCurrency(stats?.monthRevenue)} sub="this month" color="text-purple-400" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Recent Orders</h2>
          {orders.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">No orders yet today</p>
          ) : (
            <div className="space-y-3">
              {orders.map(order => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <div>
                    <p className="text-white text-sm font-medium">Order #{order.id}</p>
                    <p className="text-slate-400 text-xs">{order.type} • {order.items_count} items</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-sm font-medium">{formatCurrency(order.total)}</p>
                    <p className={`text-xs font-medium ${statusColor(order.status)}`}>{order.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Quick Stats</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Average Order Value</span>
              <span className="text-white font-semibold">{formatCurrency(stats?.avgOrderValue)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Pending Orders</span>
              <span className="text-yellow-400 font-semibold">{stats?.pendingOrders || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Customers Today</span>
              <span className="text-white font-semibold">{stats?.customersToday || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Low Stock Items</span>
              <span className="text-red-400 font-semibold">{stats?.lowStockCount || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Total Menu Items</span>
              <span className="text-white font-semibold">{stats?.menuItems || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
