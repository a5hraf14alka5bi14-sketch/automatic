import React, { useState, useEffect, useCallback } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'
import logoUrl from '../assets/brand/logo-full.png'

// Cache the logo as a data URL so repeated PDF exports don't re-fetch.
let _logoDataUrl = null
async function getLogoDataUrl() {
  if (_logoDataUrl) return _logoDataUrl
  try {
    const res = await fetch(logoUrl)
    const blob = await res.blob()
    _logoDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return _logoDataUrl
  } catch {
    return null
  }
}

const fmtN = (val, dec = 0) => Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const CAT_EMOJI = {
  shawarma: '🌯', grills: '🔥', appetizers: '🥙', salads: '🥗',
  sandwiches: '🥪', meals: '🍱', manakish: '🫓', desserts: '🍮', drinks: '🥤',
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-slate-400 text-xs">{label}</p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

function Bar({ label, value, max, color = 'bg-orange-500', suffix = '' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-slate-400 text-sm w-32 truncate">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-white text-sm font-medium w-20 text-right">{suffix}{fmtN(value, 2)}</span>
    </div>
  )
}

function marginColor(pct) {
  if (pct >= 65) return 'text-green-400'
  if (pct >= 45) return 'text-yellow-400'
  return 'text-red-400'
}

// ── Heatmap: 7 days × 24 hours ───────────────────────────────────────────────
function HeatmapTab({ heatmap }) {
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

// ── Cost Trend: daily bars ───────────────────────────────────────────────────
function TrendsTab({ trend, fmt }) {
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

// ── Menu Engineering Matrix Tab ──────────────────────────────────────────────
const QUADRANT_STYLE = {
  star:      { label: 'Stars',      emoji: '⭐', color: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-500/10' },
  plowhorse: { label: 'Plowhorses', emoji: '🐴', color: 'text-blue-400',   border: 'border-blue-500/30',   bg: 'bg-blue-500/10'  },
  puzzle:    { label: 'Puzzles',    emoji: '❓', color: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-500/10'},
  dog:       { label: 'Dogs',       emoji: '🐕', color: 'text-red-400',    border: 'border-red-500/30',    bg: 'bg-red-500/10'  },
}

function MatrixTab({ matrixData, fmt, loading }) {
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

// ── Revenue Forecast Tab ──────────────────────────────────────────────────────
function ForecastTab({ forecastData, fmt, loading }) {
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

// ── CSV Export ────────────────────────────────────────────────────────────────
function downloadCSV(period) {
  const url = `/api/reports/export?period=${period}&format=csv`
  const a = document.createElement('a')
  a.href = url
  a.download = `report-${period}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ── PDF Export ────────────────────────────────────────────────────────────────
async function downloadPDF(data, period, fmtFn) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const periodLabel = { today: 'Today', week: 'Last 7 Days', month: 'This Month' }[period] || period
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const dark   = [15,  23,  42]   // slate-950
  const panel  = [30,  41,  59]   // slate-800
  const orange = [249, 115, 22]   // orange-500
  const muted  = [148, 163, 184]  // slate-400
  const light  = [226, 232, 240]  // slate-200

  // Header banner
  doc.setFillColor(...dark)
  doc.rect(0, 0, 210, 38, 'F')

  // Brand logo on a white plate (top-right)
  const logoData = await getLogoDataUrl()
  if (logoData) {
    const props = doc.getImageProperties(logoData)
    const h = 26
    const w = (props.width / props.height) * h
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(210 - w - 12, 6, w + 4, h + 2, 2, 2, 'F')
    doc.addImage(logoData, 'PNG', 210 - w - 10, 7, w, h)
  }

  doc.setTextColor(...orange)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Automatic Restaurant OS', 14, 16)
  doc.setTextColor(...muted)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Reports — ${periodLabel}`, 14, 25)
  doc.text(`Generated: ${now}`, 14, 31)

  // KPI Summary table
  autoTable(doc, {
    startY: 44,
    head: [['Metric', 'Value']],
    body: [
      ['Revenue',          fmtFn(data.revenue)],
      ['Total Orders',     String(data.totalOrders  || 0)],
      ['Avg Order Value',  fmtFn(data.avgOrderValue)],
      ['Customers Served', String(data.customersServed || 0)],
      ['Food Cost',        fmtFn(data.totalFoodCost)],
      ['Gross Profit',     fmtFn(data.grossProfit)],
      ['Gross Margin',     `${data.grossMargin || 0}%`],
    ],
    tableWidth: 90,
    headStyles:         { fillColor: panel, textColor: orange, fontStyle: 'bold' },
    bodyStyles:         { fillColor: dark,  textColor: light },
    alternateRowStyles: { fillColor: panel },
    theme: 'grid',
  })

  // Category Profitability
  if (data.categoryPerf?.length > 0) {
    const y1 = doc.lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...light)
    doc.text('Category Profitability', 14, y1)
    autoTable(doc, {
      startY: y1 + 4,
      head: [['Category', 'Revenue', 'Food Cost', 'Profit', 'Margin']],
      body: data.categoryPerf.map(c => [
        (c.category || 'Other').charAt(0).toUpperCase() + (c.category || 'Other').slice(1),
        fmtFn(c.revenue),
        fmtFn(c.foodCost),
        fmtFn(c.profit),
        `${c.margin || 0}%`,
      ]),
      headStyles:         { fillColor: panel, textColor: orange, fontStyle: 'bold' },
      bodyStyles:         { fillColor: dark,  textColor: light },
      alternateRowStyles: { fillColor: panel },
      theme: 'grid',
    })
  }

  // Top Menu Items
  if (data.topItems?.length > 0) {
    const y2 = doc.lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...light)
    doc.text('Top Menu Items', 14, y2)
    autoTable(doc, {
      startY: y2 + 4,
      head: [['Item', 'Category', 'Qty Sold', 'Revenue']],
      body: data.topItems.slice(0, 10).map(item => [
        item.name,
        item.category || '',
        String(item.totalQty   || 0),
        fmtFn(item.totalRevenue),
      ]),
      headStyles:         { fillColor: panel, textColor: orange, fontStyle: 'bold' },
      bodyStyles:         { fillColor: dark,  textColor: light },
      alternateRowStyles: { fillColor: panel },
      theme: 'grid',
    })
  }

  doc.save(`report-${period}-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Reports() {
  const { fmt } = useCurrency()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')
  const [activeTab, setActiveTab] = useState('overview')
  const [exporting, setExporting] = useState(false)
  const [staffData, setStaffData] = useState(null)
  const [staffLoading, setStaffLoading] = useState(false)
  const [matrixData, setMatrixData] = useState(null)
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [forecastData, setForecastData] = useState(null)
  const [forecastLoading, setForecastLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/reports?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

  useEffect(() => {
    if (activeTab !== 'staff') return
    setStaffLoading(true)
    apiFetch(`/api/reports/staff?period=${period}`)
      .then(r => r.json())
      .then(d => { setStaffData(Array.isArray(d) ? d : []); setStaffLoading(false) })
      .catch(() => setStaffLoading(false))
  }, [activeTab, period])

  useEffect(() => {
    if (activeTab !== 'matrix') return
    setMatrixLoading(true)
    apiFetch(`/api/reports/menu-matrix?period=${period}`)
      .then(r => r.json())
      .then(d => { setMatrixData(d); setMatrixLoading(false) })
      .catch(() => setMatrixLoading(false))
  }, [activeTab, period])

  useEffect(() => {
    if (activeTab !== 'forecast') return
    setForecastLoading(true)
    apiFetch('/api/reports/forecast')
      .then(r => r.json())
      .then(d => { setForecastData(d); setForecastLoading(false) })
      .catch(() => setForecastLoading(false))
  }, [activeTab])

  const handleExport = async () => {
    setExporting(true)
    try { downloadCSV(period) } finally {
      setTimeout(() => setExporting(false), 1500)
    }
  }

  const periods = [{ id: 'today', label: 'Today' }, { id: 'week', label: '7 Days' }, { id: 'month', label: 'This Month' }]
  const tabs = [
    { id: 'overview',       label: '📊 Overview' },
    { id: 'profitability',  label: '💰 Profitability' },
    { id: 'menu',           label: '🍽️ Menu' },
    { id: 'matrix',         label: '⭐ Matrix' },
    { id: 'forecast',       label: '🔮 Forecast' },
    { id: 'heatmap',        label: '📅 Heatmap' },
    { id: 'trends',         label: '📈 Trends' },
    { id: 'inventory',      label: '⚠️ Stock' },
    { id: 'staff',          label: '👤 Staff' },
  ]

  return (
    <div className="p-6 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <p className="text-slate-400 text-sm mt-0.5">Business performance overview</p>
        </div>
        <div className="flex items-center gap-2">
          {periods.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p.id ? 'bg-orange-500 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'}`}>
              {p.label}
            </button>
          ))}
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors">
            {exporting ? '⏳' : '⬇'} CSV
          </button>
          <button
            onClick={() => { if (data) downloadPDF(data, period, fmt).catch(() => {}) }}
            disabled={!data || loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors">
            📄 PDF
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 w-fit overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === t.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse h-28" />)}
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-slate-500">Failed to load reports</div>
      ) : (
        <>
          {activeTab === 'overview' && (
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
          )}

          {activeTab === 'profitability' && (
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
                  <table className="w-full">
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
              )}
            </div>
          )}

          {activeTab === 'menu' && (
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
          )}

          {activeTab === 'matrix'   && <MatrixTab   matrixData={matrixData}     fmt={fmt} loading={matrixLoading} />}
          {activeTab === 'forecast' && <ForecastTab forecastData={forecastData}  fmt={fmt} loading={forecastLoading} />}
          {activeTab === 'heatmap' && <HeatmapTab heatmap={data.heatmap} />}
          {activeTab === 'trends'  && <TrendsTab  trend={data.trend} fmt={fmt} />}

          {activeTab === 'inventory' && (
            <div className="space-y-6">
              {!data.lowStock || data.lowStock.length === 0 ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-8 text-center">
                  <p className="text-4xl mb-3">✅</p>
                  <p className="text-green-400 font-semibold">All stock levels are healthy</p>
                  <p className="text-slate-500 text-sm mt-1">No items are below their minimum threshold</p>
                </div>
              ) : (
                <>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div>
                      <p className="text-red-400 font-semibold">{data.lowStock.length} item{data.lowStock.length > 1 ? 's' : ''} below minimum stock</p>
                      <p className="text-slate-400 text-sm">Restock soon to avoid running out during service</p>
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-800/40">
                          {['Item','Category','In Stock','Minimum','Status'].map((h, i) => (
                            <th key={h} className={`py-3 px-4 text-slate-400 text-xs font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.lowStock.map((item, i) => {
                          const pct = parseFloat(item.min_quantity) > 0 ? Math.round((parseFloat(item.quantity) / parseFloat(item.min_quantity)) * 100) : 0
                          const isEmpty = parseFloat(item.quantity) === 0
                          return (
                            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                              <td className="py-3 px-4 text-white font-medium text-sm">{item.name}</td>
                              <td className="py-3 px-4 text-slate-400 text-sm capitalize">{item.category}</td>
                              <td className="py-3 px-4 text-right"><span className={`font-semibold text-sm ${isEmpty ? 'text-red-400' : 'text-yellow-400'}`}>{item.quantity} {item.unit}</span></td>
                              <td className="py-3 px-4 text-right text-slate-400 text-sm">{item.min_quantity} {item.unit}</td>
                              <td className="py-3 px-4 text-right">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium border ${isEmpty ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'}`}>
                                  {isEmpty ? '🚫 Out of stock' : `⚠️ ${pct}% of min`}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'staff' && (
            <div className="space-y-5">
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800">
                  <h2 className="text-white font-semibold">👤 Staff Performance — {periods.find(p => p.id === period)?.label}</h2>
                  <p className="text-slate-400 text-xs mt-0.5">Revenue and orders per team member</p>
                </div>
                {staffLoading ? (
                  <div className="p-6 space-y-3">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-800 rounded-lg animate-pulse" />)}
                  </div>
                ) : !staffData || staffData.length === 0 ? (
                  <div className="text-center py-16 text-slate-500">
                    <p className="text-4xl mb-3">👤</p>
                    <p className="font-medium">No staff data for this period</p>
                    <p className="text-xs mt-1 text-slate-600">Orders need to be linked to staff members</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-800/40">
                        {['Staff Member', 'Role', 'Orders', 'Revenue', 'Avg Ticket', 'Items Sold'].map((h, i) => (
                          <th key={h} className={`py-3 px-4 text-slate-400 text-xs font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {staffData.map((s, i) => (
                        <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-400 text-xs font-bold">
                                {s.name?.[0]?.toUpperCase() || '?'}
                              </div>
                              <span className="text-white font-medium text-sm">{s.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border capitalize ${
                              s.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                              s.role === 'manager' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                              'bg-slate-700 text-slate-400 border-slate-600'
                            }`}>{s.role}</span>
                          </td>
                          <td className="py-3 px-4 text-right text-white font-medium text-sm">{s.orders}</td>
                          <td className="py-3 px-4 text-right text-orange-400 font-semibold text-sm">{fmt(s.revenue)}</td>
                          <td className="py-3 px-4 text-right text-slate-300 text-sm">{fmt(s.avgTicket)}</td>
                          <td className="py-3 px-4 text-right text-slate-400 text-sm">{s.itemsSold}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
