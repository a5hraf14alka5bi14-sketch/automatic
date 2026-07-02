import React from 'react'
import { CAT_EMOJI } from './shared.jsx'

// ── Menu Tab ──────────────────────────────────────────────────────────────────
export default function MenuTab({ data, fmt }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">🏆 Best Sellers (by Qty)</h2>
        {data.topItems?.length ? (
          <div className="space-y-3">
            {data.topItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`text-xs font-bold w-5 flex-shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-600' : 'text-slate-600'}`}>#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{item.name}</p>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1">
                    <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (item.qty / data.topItems[0].qty) * 100)}%` }} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-white text-sm font-medium">{item.qty} sold</p>
                  <p className="text-slate-500 text-xs">{fmt(item.revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-slate-500 text-sm text-center py-8">No sales data</p>}
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">💵 Top Earners (by Revenue)</h2>
        {data.topByRevenue?.length ? (
          <div className="space-y-3">
            {data.topByRevenue.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`text-xs font-bold w-5 flex-shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-600' : 'text-slate-600'}`}>#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{item.name}</p>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1">
                    <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (item.revenue / data.topByRevenue[0].revenue) * 100)}%` }} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-green-400 text-sm font-bold">{fmt(item.revenue)}</p>
                  <p className="text-slate-500 text-xs">{item.qty} sold</p>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-slate-500 text-sm text-center py-8">No sales data</p>}
      </div>
      {data.categoryPerf?.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 lg:col-span-2">
          <h2 className="text-white font-semibold mb-4">Revenue by Category</h2>
          <div className="space-y-3">
            {data.categoryPerf.map(cat => (
              <div key={cat.category}>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span className="capitalize">{CAT_EMOJI[cat.category] || '🍽️'} {cat.category}</span>
                  <span className="text-slate-500">{cat.qtySold} sold</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-slate-800 rounded-full h-2.5">
                    <div className="bg-orange-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, (cat.revenue / data.categoryPerf[0].revenue) * 100)}%` }} />
                  </div>
                  <span className="text-orange-400 font-medium text-sm w-20 text-right">{fmt(cat.revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
