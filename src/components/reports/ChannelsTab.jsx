import React from 'react'
import { fmtN } from './shared.jsx'

function pct(current, prev) {
  if (!prev || prev === 0) return null
  return ((current - prev) / prev * 100)
}

function PctBadge({ current, prev, suffix = '%' }) {
  const p = pct(current, prev)
  if (p === null) return null
  const up = p >= 0
  return (
    <span className={`text-xs font-medium inline-flex items-center gap-0.5 ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'}{Math.abs(p).toFixed(1)}{suffix}
    </span>
  )
}

function MiniBar({ value, max, color = 'bg-orange-500' }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex-1 bg-slate-800 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full`} style={{ width: `${w}%` }} />
    </div>
  )
}

const CHANNEL_EMOJI = { 'dine-in': '🪑', takeaway: '🛍️', delivery: '🚗' }
const CHANNEL_COLOR = { 'dine-in': 'text-green-400', takeaway: 'text-amber-400', delivery: 'text-red-400' }
const CHANNEL_BAR   = { 'dine-in': 'bg-green-500',   takeaway: 'bg-amber-500',   delivery: 'bg-red-500' }
const PAY_EMOJI     = { cash: '💵', card: '💳', tap: '📱', online: '🌐', other: '🔄' }

export default function ChannelsTab({ data, fmt }) {
  if (!data) return null

  const totalRev = data.ordersByType?.reduce((s, r) => s + r.revenue, 0) || 1
  const totalPayRev = data.byPayment?.reduce((s, r) => s + r.revenue, 0) || 1
  const topTableMax = data.topTables?.[0]?.revenue || 1
  const topItemMax  = data.topByRevenue?.[0]?.revenue || 1

  return (
    <div className="space-y-6">

      {/* ── Channel Breakdown ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-1">Sales by Channel</h2>
          <p className="text-slate-500 text-xs mb-4">مبيعات حسب القناة · revenue &amp; % vs prior period</p>
          {data.ordersByType?.length ? (
            <div className="space-y-4">
              {data.ordersByType.map(row => (
                <div key={row.type}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span>{CHANNEL_EMOJI[row.type] || '📦'}</span>
                      <span className={`text-sm font-medium capitalize ${CHANNEL_COLOR[row.type] || 'text-white'}`}>{row.type}</span>
                      <span className="text-slate-600 text-xs">({row.count} orders)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold text-sm">{fmt(row.revenue)}</span>
                      <PctBadge current={row.revenue} prev={row.prevRevenue} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MiniBar value={row.revenue} max={totalRev} color={CHANNEL_BAR[row.type] || 'bg-slate-500'} />
                    <span className="text-slate-500 text-xs w-10 text-right">
                      {totalRev > 0 ? ((row.revenue / totalRev) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-slate-500 text-sm text-center py-8">No data for this period</p>}
        </div>

        {/* ── Payment Method Breakdown ───────────────────────────── */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-1">Sales by Payment</h2>
          <p className="text-slate-500 text-xs mb-4">مبيعات حسب طريقة الدفع · revenue % of total</p>
          {data.byPayment?.length ? (
            <div className="space-y-4">
              {data.byPayment.map(row => (
                <div key={row.method}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span>{PAY_EMOJI[row.method?.toLowerCase()] || '💳'}</span>
                      <span className="text-sm font-medium text-white capitalize">{row.method || 'Other'}</span>
                      <span className="text-slate-600 text-xs">({row.count} orders)</span>
                    </div>
                    <span className="text-white font-semibold text-sm">{fmt(row.revenue)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MiniBar value={row.revenue} max={totalPayRev} color="bg-blue-500" />
                    <span className="text-slate-500 text-xs w-10 text-right">
                      {totalPayRev > 0 ? ((row.revenue / totalPayRev) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-slate-500 text-sm text-center py-8">No paid orders in this period</p>}
        </div>
      </div>

      {/* ── Top 5 Tables + Top 5 Items ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top 5 Tables */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-white font-semibold">🪑 Top 5 Tables by Revenue</h2>
            <p className="text-slate-500 text-xs mt-0.5">أفضل 5 طاولات · dine-in only</p>
          </div>
          {data.topTables?.length ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40">
                  <th className="py-2.5 px-4 text-slate-400 text-xs font-medium text-left">#</th>
                  <th className="py-2.5 px-4 text-slate-400 text-xs font-medium text-left">Table</th>
                  <th className="py-2.5 px-4 text-slate-400 text-xs font-medium text-right">Orders</th>
                  <th className="py-2.5 px-4 text-slate-400 text-xs font-medium text-right">Revenue</th>
                  <th className="py-2.5 px-4 text-slate-400 text-xs font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.topTables.map((t, i) => (
                  <tr key={t.tableNumber} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 text-slate-600 text-sm">{i + 1}</td>
                    <td className="py-2.5 px-4">
                      <span className="text-white font-medium text-sm">Table {t.tableNumber}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-400 text-sm">{t.orders}</td>
                    <td className="py-2.5 px-4 text-right text-orange-400 font-semibold text-sm">{fmt(t.revenue)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-12 bg-slate-800 rounded-full h-1.5">
                          <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${(t.revenue / topTableMax) * 100}%` }} />
                        </div>
                        <span className="text-slate-500 text-xs w-8 text-right">
                          {totalRev > 0 ? ((t.revenue / totalRev) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <p className="text-3xl mb-2">🪑</p>
              <p className="text-sm">No dine-in tables for this period</p>
            </div>
          )}
        </div>

        {/* Top 5 Items by Revenue */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-white font-semibold">🍽️ Top 5 Items by Revenue</h2>
            <p className="text-slate-500 text-xs mt-0.5">أفضل 5 أصناف · ranked by gross revenue</p>
          </div>
          {data.topByRevenue?.length ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40">
                  <th className="py-2.5 px-4 text-slate-400 text-xs font-medium text-left">#</th>
                  <th className="py-2.5 px-4 text-slate-400 text-xs font-medium text-left">Item</th>
                  <th className="py-2.5 px-4 text-slate-400 text-xs font-medium text-right">Qty</th>
                  <th className="py-2.5 px-4 text-slate-400 text-xs font-medium text-right">Revenue</th>
                  <th className="py-2.5 px-4 text-slate-400 text-xs font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.topByRevenue.map((item, i) => (
                  <tr key={item.name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 text-slate-600 text-sm">{i + 1}</td>
                    <td className="py-2.5 px-4">
                      <p className="text-white font-medium text-sm truncate max-w-[140px]">{item.name}</p>
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-400 text-sm">{fmtN(item.qty)}</td>
                    <td className="py-2.5 px-4 text-right text-orange-400 font-semibold text-sm">{fmt(item.revenue)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-12 bg-slate-800 rounded-full h-1.5">
                          <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${(item.revenue / topItemMax) * 100}%` }} />
                        </div>
                        <span className="text-slate-500 text-xs w-8 text-right">
                          {totalRev > 0 ? ((item.revenue / totalRev) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <p className="text-3xl mb-2">🍽️</p>
              <p className="text-sm">No orders in this period</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
