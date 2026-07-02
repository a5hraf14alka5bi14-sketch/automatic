import React from 'react'
import { StatCard, fmtN } from './shared.jsx'

// ── Cost Trend: daily bars ───────────────────────────────────────────────────
export default function TrendsTab({ trend, fmt }) {
  if (!trend || trend.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p className="text-4xl mb-3">📈</p>
        <p>No trend data for this period</p>
        <p className="text-xs mt-1">Try "7 Days" or "This Month" for trend charts</p>
      </div>
    )
  }

  const maxRevenue = Math.max(...trend.map(d => d.revenue), 1)

  const fmtDay = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const totalRevenue  = trend.reduce((s, d) => s + d.revenue, 0)
  const totalFoodCost = trend.reduce((s, d) => s + d.foodCost, 0)
  const totalProfit   = trend.reduce((s, d) => s + d.profit, 0)
  const totalOrders   = trend.reduce((s, d) => s + d.orders, 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Period Revenue" value={fmt(totalRevenue)} color="text-orange-400" icon="💵" />
        <StatCard label="Period Food Cost" value={fmt(totalFoodCost)} color="text-red-400" icon="🥘" />
        <StatCard label="Gross Profit" value={fmt(totalProfit)} color={totalProfit >= 0 ? 'text-green-400' : 'text-red-400'} icon="📈" />
        <StatCard label="Total Orders" value={fmtN(totalOrders)} color="text-blue-400" icon="📋" />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-5">Daily Revenue vs Food Cost</h2>
        <div className="space-y-3">
          {trend.map(day => (
            <div key={day.date} className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                <span className="font-medium text-white">{fmtDay(day.date)}</span>
                <span>{day.orders} orders</span>
              </div>
              <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden">
                <div className="absolute left-0 top-0 h-full bg-orange-500/80 rounded-full"
                  style={{ width: `${(day.revenue / maxRevenue) * 100}%` }} />
                <div className="absolute left-0 top-0 h-full bg-red-500/60 rounded-full"
                  style={{ width: `${(day.foodCost / maxRevenue) * 100}%` }} />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-orange-400">Rev: {fmt(day.revenue)}</span>
                <span className="text-red-400">Cost: {fmt(day.foodCost)}</span>
                <span className={day.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                  Profit: {fmt(day.profit)}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded bg-orange-500/80" /> Revenue</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded bg-red-500/60" /> Food Cost</div>
        </div>
      </div>
    </div>
  )
}
