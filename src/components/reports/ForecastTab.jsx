import React from 'react'
import { StatCard } from './shared.jsx'

// ── Revenue Forecast Tab ──────────────────────────────────────────────────────
export default function ForecastTab({ forecastData, fmt, loading }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse h-28" />)}
      </div>
    )
  }

  if (!forecastData) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p className="text-4xl mb-3">📈</p><p>Unable to load forecast</p>
      </div>
    )
  }

  const { history = [], forecast = [], stats, message } = forecastData

  if (message && forecast.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p className="text-4xl mb-3">📊</p>
        <p className="font-medium text-slate-300">Not enough data yet</p>
        <p className="text-xs mt-1">{message}</p>
      </div>
    )
  }

  const allData  = [...history.slice(-28), ...forecast.slice(0, 30)]
  const histLen  = Math.min(history.length, 28)
  const maxRev   = Math.max(...allData.map(d => d.upper || d.revenue || 0), 1)
  const growing  = stats?.trendSlope > 0

  const fmtDate = (s) => {
    const d = new Date(s + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Avg Daily Revenue"  value={fmt(stats.avgDailyRevenue)}  color="text-orange-400"                                                             icon="💵" />
          <StatCard label="30-Day Forecast"    value={fmt(stats.forecast30Total)}  color="text-blue-400"                                                               icon="📅" />
          <StatCard label="Weekly Growth"
            value={`${stats.weeklyGrowthPct >= 0 ? '+' : ''}${stats.weeklyGrowthPct}%`}
            color={stats.weeklyGrowthPct >= 0 ? 'text-green-400' : 'text-red-400'}                                                                                     icon={stats.weeklyGrowthPct >= 0 ? '📈' : '📉'} />
          <StatCard label="Trend"
            value={`${growing ? '▲' : '▼'} ${Math.abs(Number(stats.trendSlope)).toFixed(3)} OMR/day`}
            color={growing ? 'text-green-400' : 'text-red-400'}
            sub={`${stats.dataPoints} days of data`}                                                                                                                   icon="📊" />
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-semibold">Revenue Forecast — Next 30 Days</h2>
            <p className="text-slate-500 text-xs mt-0.5">Linear regression + day-of-week seasonality adjustment</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5"><div className="w-3 h-2.5 rounded-sm bg-orange-500/80" /> Historical</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2.5 rounded-sm bg-blue-500/60"   /> Forecast</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2.5 rounded-sm bg-blue-500/15"   /> Band ±18%</div>
          </div>
        </div>

        <div className="flex items-end gap-0.5 mb-2" style={{ height: 160 }}>
          {allData.map((d, i) => {
            const isHist = i < histLen
            const h  = Math.max(2, (d.revenue / maxRev) * 100)
            const hi = Math.max(2, ((d.upper  || d.revenue) / maxRev) * 100)
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end relative group"
                title={`${fmtDate(d.date)}: ${fmt(d.revenue)}${!isHist ? ` (${fmt(d.lower)}–${fmt(d.upper)})` : ''}`}>
                {!isHist && (
                  <div className="absolute bottom-0 w-full rounded-sm bg-blue-500/15"
                    style={{ height: `${hi}%` }} />
                )}
                <div className={`w-full rounded-sm ${isHist ? 'bg-orange-500/80' : 'bg-blue-500/55'}`}
                  style={{ height: `${h}%` }} />
              </div>
            )
          })}
        </div>

        <div className="flex justify-between text-slate-600 text-[9px] mt-1">
          {allData.filter((_, i) => i % Math.max(1, Math.floor(allData.length / 8)) === 0).map(d => (
            <span key={d.date}>{fmtDate(d.date)}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Next 7 Days Forecast</h3>
          <div className="space-y-2">
            {forecast.slice(0, 7).map(d => (
              <div key={d.date} className="flex items-center gap-3">
                <span className="text-slate-400 text-xs w-20 flex-shrink-0">{fmtDate(d.date)}</span>
                <div className="flex-1 bg-slate-800 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${Math.min(100, (d.revenue / Math.max(...forecast.slice(0,7).map(x => x.revenue), 1)) * 100)}%` }} />
                </div>
                <div className="text-right flex-shrink-0 w-24">
                  <span className="text-white text-xs font-medium">{fmt(d.revenue)}</span>
                  <span className="text-slate-600 text-xs"> ±18%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Historical Daily Revenue (Last 14 Days)</h3>
          <div className="space-y-2">
            {history.slice(-14).reverse().map(d => (
              <div key={d.date} className="flex items-center gap-3">
                <span className="text-slate-400 text-xs w-20 flex-shrink-0">{fmtDate(d.date)}</span>
                <div className="flex-1 bg-slate-800 rounded-full h-2">
                  <div className="bg-orange-500 h-2 rounded-full"
                    style={{ width: `${Math.min(100, (d.revenue / Math.max(...history.slice(-14).map(x => x.revenue), 1)) * 100)}%` }} />
                </div>
                <div className="text-right flex-shrink-0 w-24">
                  <span className="text-orange-400 text-xs font-medium">{fmt(d.revenue)}</span>
                  <span className="text-slate-600 text-xs"> · {d.orders}ord</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
