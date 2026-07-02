import React, { useState } from 'react'
import { fmtN, QUADRANT_STYLE } from './shared.jsx'

// ── Menu Engineering Matrix Tab ──────────────────────────────────────────────
export default function MatrixTab({ matrixData, fmt, loading }) {
  const [filter, setFilter] = useState('all')

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-14" />)}
      </div>
    )
  }

  if (!matrixData) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p className="text-4xl mb-3">🍽️</p>
        <p>No menu data available</p>
        <p className="text-xs mt-1">Ensure menu items have prices and food costs set</p>
      </div>
    )
  }

  const { items = [], summary = {}, avgQty = 0, avgMargin = 0 } = matrixData
  const filtered = filter === 'all' ? items : items.filter(i => i.quadrant === filter)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(QUADRANT_STYLE).map(([q, s]) => {
          const count = summary[q === 'plowhorse' ? 'plowhorses' : q + 's'] ?? 0
          return (
            <button key={q} onClick={() => setFilter(filter === q ? 'all' : q)}
              className={`rounded-xl border p-4 text-left transition-all ${
                filter === q ? `${s.bg} ${s.border} ring-1 ring-inset ${s.border}` : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl">{s.emoji}</span>
                <span className={`text-2xl font-bold ${s.color}`}>{count}</span>
              </div>
              <p className={`text-sm font-semibold ${s.color}`}>{s.label}</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {q === 'star' && 'High pop · High margin'}
                {q === 'plowhorse' && 'High pop · Low margin'}
                {q === 'puzzle' && 'Low pop · High margin'}
                {q === 'dog' && 'Low pop · Low margin'}
              </p>
            </button>
          )
        })}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <span>📊 Avg popularity threshold: <strong className="text-white">{fmtN(avgQty, 1)} units sold</strong></span>
        <span>📈 Avg margin threshold: <strong className="text-white">{fmtN(avgMargin, 1)}%</strong></span>
        <span className="ml-auto text-slate-500">Showing: {filtered.length} / {items.length} items</span>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/40">
              <th className="py-3 px-4 text-left text-slate-400 text-xs font-medium">Item</th>
              <th className="py-3 px-4 text-left text-slate-400 text-xs font-medium">Category</th>
              <th className="py-3 px-4 text-right text-slate-400 text-xs font-medium">Qty Sold</th>
              <th className="py-3 px-4 text-right text-slate-400 text-xs font-medium">Revenue</th>
              <th className="py-3 px-4 text-right text-slate-400 text-xs font-medium">Margin%</th>
              <th className="py-3 px-4 text-right text-slate-400 text-xs font-medium">Quadrant</th>
              <th className="py-3 px-4 text-left text-slate-400 text-xs font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-500">No items in this quadrant</td></tr>
            ) : filtered.map(item => {
              const s = QUADRANT_STYLE[item.quadrant]
              return (
                <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/25 transition-colors">
                  <td className="py-3 px-4">
                    <span className="text-white font-medium">{item.name}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-400 capitalize">{item.category || '—'}</td>
                  <td className="py-3 px-4 text-right text-white font-medium">{item.qtySold}</td>
                  <td className="py-3 px-4 text-right text-orange-400 font-medium">{fmt(item.revenue)}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-bold ${item.marginPct >= 65 ? 'text-green-400' : item.marginPct >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {item.marginPct}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`text-xs px-2 py-1 rounded-full border ${s.bg} ${s.color} ${s.border}`}>
                      {s.emoji} {s.label.slice(0, -1)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-xs">{item.action}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
