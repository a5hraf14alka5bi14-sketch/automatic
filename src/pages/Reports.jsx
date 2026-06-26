import React, { useState, useEffect } from 'react'

export default function Reports() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

  const formatCurrency = (val) => '$' + Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const StatBox = ({ label, value, color }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <p className="text-slate-400 text-sm">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-white'}`}>{value}</p>
    </div>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-slate-400 text-sm mt-1">Business performance overview</p>
        </div>
        <div className="flex gap-2">
          {['today', 'week', 'month'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                period === p ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-slate-500">Failed to load reports</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatBox label="Revenue" value={formatCurrency(data.revenue)} color="text-orange-400" />
            <StatBox label="Total Orders" value={data.totalOrders || 0} color="text-blue-400" />
            <StatBox label="Avg Order Value" value={formatCurrency(data.avgOrderValue)} color="text-green-400" />
            <StatBox label="Customers Served" value={data.customersServed || 0} color="text-purple-400" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">Orders by Type</h2>
              {data.ordersByType && data.ordersByType.length > 0 ? (
                <div className="space-y-3">
                  {data.ordersByType.map(row => (
                    <div key={row.type} className="flex items-center gap-3">
                      <span className="text-slate-400 text-sm capitalize w-20">{row.type}</span>
                      <div className="flex-1 bg-slate-800 rounded-full h-2">
                        <div
                          className="bg-orange-500 h-2 rounded-full"
                          style={{ width: `${Math.min(100, (row.count / data.totalOrders) * 100)}%` }}
                        />
                      </div>
                      <span className="text-white text-sm font-medium w-8 text-right">{row.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm text-center py-4">No data available</p>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">Top Menu Items</h2>
              {data.topItems && data.topItems.length > 0 ? (
                <div className="space-y-3">
                  {data.topItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-orange-400 text-xs font-bold w-5">#{i + 1}</span>
                        <span className="text-white text-sm">{item.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-sm">{item.qty} sold</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm text-center py-4">No sales data yet</p>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">Revenue Breakdown</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">Gross Revenue</span>
                  <span className="text-white font-medium">{formatCurrency(data.revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">Tax Collected (11%)</span>
                  <span className="text-white font-medium">{formatCurrency(data.taxCollected)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-2 mt-2">
                  <span className="text-white font-semibold">Net Revenue</span>
                  <span className="text-orange-400 font-bold">{formatCurrency((data.revenue || 0) - (data.taxCollected || 0))}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">Order Status Summary</h2>
              {data.ordersByStatus && data.ordersByStatus.length > 0 ? (
                <div className="space-y-3">
                  {data.ordersByStatus.map(row => {
                    const colors = { completed: 'bg-green-500', pending: 'bg-yellow-500', preparing: 'bg-blue-500', cancelled: 'bg-red-500', ready: 'bg-emerald-500' }
                    return (
                      <div key={row.status} className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${colors[row.status] || 'bg-slate-500'}`} />
                        <span className="text-slate-400 text-sm capitalize flex-1">{row.status}</span>
                        <span className="text-white text-sm font-medium">{row.count}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-sm text-center py-4">No data available</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
