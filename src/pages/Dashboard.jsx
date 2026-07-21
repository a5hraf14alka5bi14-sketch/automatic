import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'
import { useToast } from '../context/ToastContext.jsx'
import { useLiveEvents, useDebouncedCallback } from '../utils/useLiveEvents.js'
import BarChart from '../components/BarChart.jsx'
import logo from '../assets/brand/logo-full.png'

/* ── Stat card — main KPI row ─────────────────────────────────────────────── */
const StatCard = ({ label, value, sub, color, icon, pulse }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col min-h-[90px]">
    <div className="flex items-center justify-between mb-2">
      <p className="text-slate-400 text-xs font-medium leading-tight">{label}</p>
      <div className="flex items-center gap-1.5">
        {pulse && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />}
        {icon && <span className="text-base opacity-50">{icon}</span>}
      </div>
    </div>
    <p className={`text-2xl font-bold mt-auto ${color || 'text-white'}`}>{value}</p>
    {sub && <p className="text-slate-500 text-[11px] mt-1">{sub}</p>}
  </div>
)

/* ── Channel pill — compact delivery / takeaway indicator ─────────────────── */
const ChannelPill = ({ icon, label, newCount, activeCount, color }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
    <span className="text-xl flex-shrink-0">{icon}</span>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-slate-300 text-xs font-medium">{label}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500 text-xs">New</span>
        <span className={`font-bold ${color}`}>{newCount}</span>
        <span className="text-slate-700 select-none">·</span>
        <span className="text-slate-500 text-xs">Active</span>
        <span className={`font-bold ${color}`}>{activeCount}</span>
      </div>
    </div>
  </div>
)

function useGreeting() {
  const h = new Date().getHours()
  if (h < 12) return { en: 'Good Morning',   ar: 'صباح الخير' }
  if (h < 18) return { en: 'Good Afternoon', ar: 'مرحباً'     }
  return            { en: 'Good Evening',    ar: 'مساء الخير'  }
}

function useDateLabel() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function getAuthName() {
  try {
    const u = JSON.parse(localStorage.getItem('auth_user') || '{}')
    return (u.name || '').trim() || null
  } catch { return null }
}

export default function Dashboard() {
  const toast = useToast()
  const [stats, setStats]     = useState(null)
  const [orders, setOrders]   = useState([])
  const [staffData, setStaffData] = useState(null)
  const [hourly, setHourly]   = useState([])
  const [loading, setLoading] = useState(true)

  const greeting  = useGreeting()
  const dateLabel = useDateLabel()
  const authName  = getAuthName()

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, ordersRes, hourlyRes] = await Promise.all([
        apiFetch('/api/dashboard/stats'),
        apiFetch('/api/orders?limit=8'),
        apiFetch('/api/dashboard/hourly'),
      ])
      if (!statsRes.ok || !ordersRes.ok) throw new Error('Failed to load dashboard data')
      const [statsData, ordersData] = await Promise.all([statsRes.json(), ordersRes.json()])
      setStats(statsData)
      setOrders(Array.isArray(ordersData) ? ordersData : [])
      if (hourlyRes.ok) {
        const hData = await hourlyRes.json()
        setHourly(Array.isArray(hData) ? hData : [])
      }
    } catch {
      toast('Failed to load dashboard data. Please refresh.', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchStaff = useCallback(async () => {
    try {
      const r = await apiFetch('/api/reports/staff?period=today')
      if (r.ok) {
        const d = await r.json()
        setStaffData(Array.isArray(d) ? d.filter(s => s.orders > 0).slice(0, 5) : null)
      }
    } catch (_) {}
  }, [])

  useEffect(() => {
    fetchData()
    fetchStaff()
    const iv = setInterval(fetchData, 30000)
    return () => clearInterval(iv)
  }, [fetchData, fetchStaff])

  const liveRefresh = useDebouncedCallback(() => { fetchData(); fetchStaff() }, 800)
  useLiveEvents(liveRefresh, ['order_created', 'order_updated', 'inventory_updated', 'menu_updated'])

  const { fmt } = useCurrency()

  const statusColor = s => ({ pending: 'text-yellow-400', preparing: 'text-blue-400', ready: 'text-green-400', completed: 'text-slate-500', cancelled: 'text-red-400' }[s] || 'text-slate-400')
  const statusDot   = s => ({ pending: 'bg-yellow-400',  preparing: 'bg-blue-400',   ready: 'bg-green-400',   completed: 'bg-slate-600',   cancelled: 'bg-red-400'   }[s] || 'bg-slate-600')

  const hasChannelActivity = stats && (stats.deliveryNew + stats.deliveryActive + stats.takeawayNew + stats.takeawayActive) > 0

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center justify-center bg-white rounded-2xl p-2 shadow-lg shadow-black/30 ring-1 ring-white/10 flex-shrink-0">
          <img src={logo} alt="الأوتوماتيك اللبناني" className="h-12 w-auto" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">
            {greeting.en}{authName ? `, ${authName}` : ''} &mdash;{' '}
            <span className="text-orange-400">{greeting.ar}{authName ? `، ${authName}` : ''}</span>
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">{dateLabel}</p>
          <p className="text-slate-400 text-sm mt-0.5">Your restaurant at a glance · نظرة عامة على مطعمك</p>
        </div>
      </div>

      {/* ── Main KPI row ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-[90px] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats?.todayRevenue !== undefined
            ? <StatCard icon="💵" label="Today's Revenue"  value={fmt(stats.todayRevenue)}  sub={`${stats.todayOrders || 0} orders`}            color="text-orange-400" />
            : <StatCard icon="🧾" label="Today's Orders"   value={stats?.todayOrders || 0}  sub="orders today"                                    color="text-orange-400" />}
          <StatCard icon="⏳" label="Active Orders"    value={stats?.activeOrders || 0}
            sub={stats?.activeOrdersValue !== undefined ? `${fmt(stats.activeOrdersValue)} in progress` : 'in progress'}
            color="text-blue-400" pulse />
          <StatCard icon="🪑" label="Tables Occupied"  value={`${stats?.tablesOccupied || 0}/${stats?.totalTables || 10}`} sub="dine-in" color="text-green-400" pulse />
          {stats?.monthRevenue !== undefined
            ? <StatCard icon="📅" label="Monthly Revenue" value={fmt(stats.monthRevenue)}   sub="this month"             color="text-purple-400" />
            : <StatCard icon="🍽️" label="Menu Items"      value={stats?.menuItems || 0}     sub="available"             color="text-purple-400" />}
        </div>
      )}

      {/* ── Channel live row (compact pills, only when there is activity OR always show) */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ChannelPill
            icon="🚗" label="Delivery"
            newCount={stats?.deliveryNew ?? 0}
            activeCount={stats?.deliveryActive ?? 0}
            color="text-red-400"
          />
          <ChannelPill
            icon="🛍️" label="Takeaway"
            newCount={stats?.takeawayNew ?? 0}
            activeCount={stats?.takeawayActive ?? 0}
            color="text-amber-400"
          />
        </div>
      )}

      {/* ── Live Revenue Chart (only visible to roles with revenue access) ── */}
      {!loading && stats?.todayRevenue !== undefined && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-white font-semibold text-sm">Today's Revenue · الإيراد اليوم</h2>
              <p className="text-slate-500 text-xs mt-0.5">by hour · بالساعة — hover bars for amount</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-slate-600 text-xs">live</span>
            </div>
          </div>
          <BarChart data={hourly} valueKey="revenue" labelKey="label" color="#f97316" fmt={fmt} />
        </div>
      )}

      {/* ── Bottom row: Recent Orders + Staff/Quick Stats ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent orders */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-sm mb-4">Recent Orders</h2>
          {!loading && orders.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-slate-500 text-sm">No orders yet today</p>
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-slate-800/60">
              {orders.map(order => (
                <div key={order.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(order.status)}`} />
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium">Order #{order.id}</p>
                      <p className="text-slate-500 text-xs capitalize truncate">
                        {order.type}{order.table_number ? ` · Table ${order.table_number}` : ''} · {order.items_count} items
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-white text-sm font-medium">{fmt(order.total)}</p>
                    <p className={`text-xs font-medium capitalize ${statusColor(order.status)}`}>{order.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel — Top Staff (admin/manager) or Quick Stats */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-sm mb-4">
            {staffData && staffData.length > 0 ? '👤 Top Staff Today' : '📊 Quick Stats'}
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-5 bg-slate-800 rounded animate-pulse" />)}
            </div>
          ) : staffData && staffData.length > 0 ? (
            <div className="space-y-3">
              {staffData.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2.5">
                  <span className="text-slate-600 text-xs font-mono w-4 flex-shrink-0">{i + 1}</span>
                  <div className="w-7 h-7 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-400 text-xs font-bold flex-shrink-0">
                    {s.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-slate-300 text-sm flex-1 truncate">{s.name}</span>
                  <div className="text-right flex-shrink-0">
                    <p className="text-orange-400 text-sm font-semibold">{fmt(s.revenue)}</p>
                    <p className="text-slate-600 text-[11px]">{s.orders} orders</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                ...(stats?.avgOrderValue !== undefined ? [{ label: 'Avg Order Value',   value: fmt(stats.avgOrderValue), color: 'text-white'   }] : []),
                { label: 'Pending Orders',  value: stats?.pendingOrders  || 0, color: 'text-yellow-400' },
                { label: 'Customers Today', value: stats?.customersToday || 0, color: 'text-cyan-400'   },
                { label: 'Low Stock Items', value: stats?.lowStockCount  || 0, color: stats?.lowStockCount > 0 ? 'text-red-400' : 'text-green-400' },
                { label: 'Menu Items',      value: stats?.menuItems      || 0, color: 'text-slate-300'  },
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
