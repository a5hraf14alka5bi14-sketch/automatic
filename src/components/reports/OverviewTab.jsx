import React from 'react'
import { StatCard, Bar, fmtN, marginColor } from './shared.jsx'

// ── Overview Tab ──────────────────────────────────────────────────────────────
export default function OverviewTab({ data, fmt }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Revenue" value={fmt(data.revenue)} color="text-orange-400" icon="💵" />
        <StatCard label="Total Orders" value={fmtN(data.totalOrders)} color="text-blue-400" icon="📋" />
        <StatCard label="Avg Order" value={fmt(data.avgOrderValue)} color="text-purple-400" icon="🧾" />
        <StatCard label="Customers" value={fmtN(data.customersServed)} color="text-cyan-400" icon="👥" />
        <StatCard label="Gross Profit" value={fmt(data.grossProfit)} color={data.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'} icon="📈" />
        <StatCard label="Gross Margin" value={`${data.grossMargin}%`} color={marginColor(data.grossMargin)} icon="%" sub="after food cost" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Orders by Type</h2>
          {data.ordersByType?.length ? (
            <div className="space-y-3">
              {data.ordersByType.map(row => (
                <div key={row.type}>
                  <Bar label={row.type} value={row.count} max={data.totalOrders} />
                  <p className="text-slate-600 text-xs text-right mt-0.5">{fmt(row.revenue)}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-slate-500 text-sm text-center py-6">No data</p>}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Order Status</h2>
          {data.ordersByStatus?.length ? (
            <div className="space-y-3">
              {data.ordersByStatus.map(row => {
                const colors = { completed: 'bg-green-500', pending: 'bg-yellow-500', preparing: 'bg-blue-500', cancelled: 'bg-red-500', ready: 'bg-emerald-500' }
                return (
                  <div key={row.status} className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors[row.status] || 'bg-slate-500'}`} />
                    <span className="text-slate-400 text-sm capitalize flex-1">{row.status}</span>
                    <span className="text-white font-semibold text-sm">{row.count}</span>
                  </div>
                )
              })}
            </div>
          ) : <p className="text-slate-500 text-sm text-center py-6">No data</p>}
        </div>
      </div>
    </div>
  )
}
