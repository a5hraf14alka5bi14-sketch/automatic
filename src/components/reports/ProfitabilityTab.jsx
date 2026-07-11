import React from 'react'
import { CAT_EMOJI, marginColor } from './shared.jsx'

// ── Profitability Tab ─────────────────────────────────────────────────────────
export default function ProfitabilityTab({ data, fmt }) {
  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-5">Profit & Loss Summary</h2>
        <div className="space-y-3">
          {[
            { label: 'Gross Revenue',  value: data.revenue,     color: 'text-white' },
            { label: 'Tax Collected',   value: -data.taxCollected, color: 'text-slate-400' },
            { label: 'Net Revenue',     value: data.netRevenue,  color: 'text-orange-400 font-bold', sep: true },
            { label: 'Food Cost',       value: -data.totalFoodCost, color: 'text-red-400' },
            { label: 'Gross Profit',    value: data.grossProfit, color: data.grossProfit >= 0 ? 'text-green-400 font-bold text-xl' : 'text-red-400 font-bold text-xl', sep: true },
          ].map((row, i) => (
            <div key={i}>
              {row.sep && <div className="border-t border-slate-700 my-3" />}
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400 text-sm">{row.label}</span>
                <span className={`text-sm ${row.color}`}>{row.value < 0 ? '−' : ''}{fmt(Math.abs(row.value))}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-slate-800">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-400">Gross Margin</span>
            <span className={`font-bold ${marginColor(data.grossMargin)}`}>{data.grossMargin}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-3">
            <div className={`h-3 rounded-full transition-all ${data.grossMargin >= 65 ? 'bg-green-500' : data.grossMargin >= 45 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, data.grossMargin)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-600 mt-1"><span>0%</span><span>Target: 65%+</span><span>100%</span></div>
        </div>
      </div>
      {data.categoryPerf?.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800"><h2 className="text-white font-semibold">Category Profitability</h2></div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40">
                {['Category','Revenue','Food Cost','Profit','Margin','Qty Sold'].map(h => (
                  <th key={h} className={`py-3 px-4 text-slate-400 text-xs font-medium ${h === 'Category' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.categoryPerf.map(cat => {
                const profit = cat.revenue - cat.foodCost
                return (
                  <tr key={cat.category} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4"><span className="text-white text-sm capitalize">{CAT_EMOJI[cat.category] || '🍽️'} {cat.category}</span></td>
                    <td className="py-3 px-4 text-right text-orange-400 font-medium text-sm">{fmt(cat.revenue)}</td>
                    <td className="py-3 px-4 text-right text-red-400 text-sm">{fmt(cat.foodCost)}</td>
                    <td className="py-3 px-4 text-right"><span className={`text-sm font-medium ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(profit)}</span></td>
                    <td className="py-3 px-4 text-right"><span className={`text-sm font-bold ${marginColor(cat.marginPct)}`}>{cat.marginPct}%</span></td>
                    <td className="py-3 px-4 text-right text-slate-400 text-sm">{cat.qtySold}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
