import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'

const fmtN = (val, dec = 0) => Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const CAT_EMOJI = {
  shawarma: '🌯', grills: '🔥', appetizers: '🥙', salads: '🥗',
  sandwiches: '🥪', meals: '🍱', manakish: '🫓', desserts: '🍮', drinks: '🥤',
}

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

export default function Reports() {
  const { fmt } = useCurrency()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/reports?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

  const periods = [{ id: 'today', label: 'Today' }, { id: 'week', label: '7 Days' }, { id: 'month', label: 'This Month' }]
  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'profitability', label: '💰 Profitability' },
    { id: 'menu', label: '🍽️ Menu Performance' },
    { id: 'inventory', label: '⚠️ Stock Alerts' },
  ]

  return (
    <div className="p-6 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <p className="text-slate-400 text-sm mt-0.5">Business performance overview</p>
        </div>
        <div className="flex gap-2">
          {periods.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p.id ? 'bg-orange-500 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === t.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
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
                    { label: 'Gross Revenue', value: data.revenue, color: 'text-white' },
                    { label: 'Tax Collected', value: -data.taxCollected, color: 'text-slate-400' },
                    { label: 'Net Revenue', value: data.netRevenue, color: 'text-orange-400 font-bold', sep: true },
                    { label: 'Food Cost', value: -data.totalFoodCost, color: 'text-red-400' },
                    { label: 'Gross Profit', value: data.grossProfit, color: data.grossProfit >= 0 ? 'text-green-400 font-bold text-xl' : 'text-red-400 font-bold text-xl', sep: true },
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
                    <div className={`h-3 rounded-full transition-all ${data.grossMargin >= 65 ? 'bg-green-500' : data.grossMargin >= 45 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, data.grossMargin)}%` }} />
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
                        <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Category</th>
                        <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Revenue</th>
                        <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Food Cost</th>
                        <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Profit</th>
                        <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Margin</th>
                        <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Qty Sold</th>
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
                          <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Item</th>
                          <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Category</th>
                          <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">In Stock</th>
                          <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Minimum</th>
                          <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Status</th>
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
