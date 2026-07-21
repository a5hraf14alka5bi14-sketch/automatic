import React, { useMemo } from 'react'
import { fmtN, marginColor } from './shared.jsx'
import BarChart from '../BarChart.jsx'

function PctBadge({ current, prev }) {
  if (prev == null || prev === 0) return null
  const p = ((current - prev) / Math.abs(prev)) * 100
  const up = p >= 0
  return (
    <span className={`text-xs font-medium inline-flex items-center gap-0.5 mt-1 ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'}{Math.abs(p).toFixed(1)}% vs prev
    </span>
  )
}

function KpiCard({ icon, label, value, sub, color, current, prev }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col min-h-[96px]">
      <div className="flex items-center justify-between mb-1">
        <p className="text-slate-400 text-xs leading-tight">{label}</p>
        {icon && <span className="text-sm opacity-50">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold leading-none mt-auto ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-slate-500 text-[11px] mt-1">{sub}</p>}
      <PctBadge current={current} prev={prev} />
    </div>
  )
}

export default function OverviewTab({ data, fmt }) {
  const pv = data.prevPeriod || {}

  /* Hourly — aggregate heatmap rows by hour across all days */
  const hourlyData = useMemo(() => {
    if (!data.heatmap?.length) return []
    const buckets = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
      revenue: 0,
    }))
    for (const row of data.heatmap) {
      const h = Number(row.hour)
      if (h >= 0 && h < 24) buckets[h].revenue += Number(row.revenue) || 0
    }
    return buckets
  }, [data.heatmap])

  /* Monthly — map backend rows into all 12 slots */
  const monthlyData = useMemo(() => {
    if (!data.monthlyRevenue) return []
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const map = {}
    for (const r of data.monthlyRevenue) map[r.monthLabel] = Number(r.revenue) || 0
    return MONTHS.map(m => ({ label: m, revenue: map[m] || 0 }))
  }, [data.monthlyRevenue])

  const netPrev = pv.revenue > 0
    ? pv.revenue - (Number(data.taxCollected) * (pv.revenue / (Number(data.revenue) || 1)))
    : 0

  return (
    <div className="space-y-5">

      {/* ── KPI grid — 4 per row on md+, 2 per row on mobile ───────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon="💵" label="Gross Revenue / الإيرادات" color="text-orange-400"
          value={fmt(data.revenue)} current={data.revenue} prev={pv.revenue} />
        <KpiCard icon="💰" label="Net Revenue / الصافي" color="text-emerald-400"
          value={fmt(data.netRevenue)} sub="after tax"
          current={data.netRevenue} prev={netPrev} />
        <KpiCard icon="🏷️" label="Discounts / الخصومات" color="text-yellow-400"
          value={fmt(data.totalDiscounts || 0)}
          current={data.totalDiscounts || 0} prev={pv.discounts} />
        <KpiCard icon="📋" label="Orders / الطلبات" color="text-blue-400"
          value={fmtN(data.totalOrders)}
          current={data.totalOrders} prev={pv.orders} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon="👥" label="PAX / الضيوف" color="text-cyan-400"
          value={fmtN(data.totalPax || 0)} sub="adults + kids"
          current={data.totalPax || 0} prev={pv.pax} />
        <KpiCard icon="🧾" label="Avg Order / متوسط" color="text-purple-400"
          value={fmt(data.avgOrderValue)} />
        <KpiCard icon="📈" label="Gross Profit" color={data.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}
          value={fmt(data.grossProfit)} sub="after food cost" />
        <KpiCard icon="%" label="Gross Margin" color={marginColor(data.grossMargin)}
          value={`${data.grossMargin}%`} sub="after food cost" />
      </div>

      {/* ── Charts ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-sm mb-0.5">Revenue by Hour</h2>
          <p className="text-slate-500 text-xs mb-4">الإيراد بالساعة · hover a bar for amount</p>
          <BarChart data={hourlyData} valueKey="revenue" labelKey="label" color="#f97316" fmt={fmt} />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-sm mb-0.5">Revenue by Month (this year)</h2>
          <p className="text-slate-500 text-xs mb-4">الإيراد الشهري · السنة الحالية</p>
          <BarChart data={monthlyData} valueKey="revenue" labelKey="label" color="#8b5cf6" fmt={fmt} />
        </div>
      </div>

      {/* ── Channel + Status ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-sm mb-4">Orders by Channel</h2>
          {data.ordersByType?.length ? (
            <div className="space-y-3">
              {data.ordersByType.map(row => {
                const total = data.totalOrders || 1
                const share = total > 0 ? ((row.count / total) * 100).toFixed(1) : '0.0'
                return (
                  <div key={row.type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-300 text-sm capitalize">{row.type}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">{row.count}</span>
                        <span className="text-slate-600 text-xs">({share}%)</span>
                        <span className="text-orange-400 text-xs font-medium">{fmt(row.revenue)}</span>
                      </div>
                    </div>
                    <div className="bg-slate-800 rounded-full h-1.5">
                      <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${(row.count / total) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <p className="text-slate-500 text-sm text-center py-6">No data</p>}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-sm mb-4">Order Status</h2>
          {data.ordersByStatus?.length ? (
            <div className="space-y-3">
              {data.ordersByStatus.map(row => {
                const dots = { completed: 'bg-green-500', pending: 'bg-yellow-500', preparing: 'bg-blue-500', cancelled: 'bg-red-500', ready: 'bg-emerald-500' }
                return (
                  <div key={row.status} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dots[row.status] || 'bg-slate-500'}`} />
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
