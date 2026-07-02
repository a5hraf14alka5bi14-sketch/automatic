import React from 'react'
import { DAY_LABELS } from './shared.jsx'

// ── Heatmap: 7 days × 24 hours ───────────────────────────────────────────────
export default function HeatmapTab({ heatmap }) {
  if (!heatmap || heatmap.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p className="text-4xl mb-3">📅</p>
        <p>No data for this period</p>
        <p className="text-xs mt-1">Try "7 Days" or "This Month" for heatmap data</p>
      </div>
    )
  }

  const cellMap = {}
  let maxOrders = 1
  for (const row of heatmap) {
    cellMap[`${row.dow}-${row.hour}`] = row
    if (row.orders > maxOrders) maxOrders = row.orders
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)

  const intensity = (orders) => {
    if (!orders) return 'bg-slate-900 border-slate-800'
    const pct = orders / maxOrders
    if (pct >= 0.8) return 'bg-orange-500 border-orange-400'
    if (pct >= 0.6) return 'bg-orange-500/70 border-orange-500/50'
    if (pct >= 0.4) return 'bg-orange-500/45 border-orange-500/30'
    if (pct >= 0.2) return 'bg-orange-500/25 border-orange-500/20'
    return 'bg-orange-500/10 border-orange-500/10'
  }

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 overflow-x-auto">
        <h2 className="text-white font-semibold mb-4">Orders by Hour & Day of Week</h2>
        <div className="min-w-[640px]">
          <div className="flex gap-1 mb-1 pl-10">
            {hours.map(h => (
              <div key={h} className="flex-1 text-center text-slate-600 text-[9px]">{h}:00</div>
            ))}
          </div>
          {DAY_LABELS.map((day, dow) => (
            <div key={dow} className="flex items-center gap-1 mb-1">
              <span className="w-9 text-xs text-slate-500 flex-shrink-0 text-right pr-1">{day}</span>
              {hours.map(h => {
                const cell = cellMap[`${dow}-${h}`]
                return (
                  <div key={h} title={cell ? `${cell.orders} orders · ${cell.revenue.toFixed(3)} OMR` : ''}
                    className={`flex-1 h-7 rounded border ${intensity(cell?.orders || 0)} transition-colors`} />
                )
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-4">
          <span className="text-slate-500 text-xs">Low</span>
          {['bg-orange-500/10', 'bg-orange-500/25', 'bg-orange-500/45', 'bg-orange-500/70', 'bg-orange-500'].map(c => (
            <div key={c} className={`w-6 h-4 rounded ${c}`} />
          ))}
          <span className="text-slate-500 text-xs">High</span>
          <span className="ml-3 text-slate-600 text-xs">Peak: {maxOrders} orders/hour</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">Busiest Hours</h2>
        {(() => {
          const byHour = {}
          for (const row of heatmap) {
            if (!byHour[row.hour]) byHour[row.hour] = { orders: 0, revenue: 0 }
            byHour[row.hour].orders += row.orders
            byHour[row.hour].revenue += row.revenue
          }
          const sorted = Object.entries(byHour).sort((a, b) => b[1].orders - a[1].orders).slice(0, 8)
          const maxO = sorted[0]?.[1].orders || 1
          return (
            <div className="space-y-2">
              {sorted.map(([hour, data]) => (
                <div key={hour} className="flex items-center gap-3">
                  <span className="text-slate-400 text-xs w-14 flex-shrink-0">{hour}:00–{(parseInt(hour) + 1) % 24}:00</span>
                  <div className="flex-1 bg-slate-800 rounded-full h-2">
                    <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${(data.orders / maxO) * 100}%` }} />
                  </div>
                  <span className="text-white text-xs font-medium w-16 text-right">{data.orders} orders</span>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
