import React, { useState, useEffect } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'

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
function downloadPDF(data, period, fmtFn) {
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

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/reports?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

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
    { id: 'heatmap',        label: '📅 Heatmap' },
    { id: 'trends',         label: '📈 Trends' },
    { id: 'inventory',      label: '⚠️ Stock' },
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
            onClick={() => data && downloadPDF(data, period, fmt)}
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
        </>
      )}
    </div>
  )
}
