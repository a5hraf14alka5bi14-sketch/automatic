import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'

const fmtN = (v, d = 0) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtDay = (s) => {
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function KpiCard({ label, value, icon, color = 'text-white', sub }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-slate-400 text-xs">{label}</p>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

function InsightCard({ insights, generating, error }) {
  if (generating) {
    return (
      <div className="bg-slate-900 border border-orange-500/30 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center animate-pulse">
            <span className="text-lg">🤖</span>
          </div>
          <div>
            <h2 className="text-white font-semibold">AI Analysis in Progress</h2>
            <p className="text-slate-400 text-xs">Processing business data with GPT-4o Mini...</p>
          </div>
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`h-4 bg-slate-800 rounded animate-pulse`} style={{ width: `${70 + i * 8}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
        <div className="flex items-center gap-2 text-red-400 font-semibold mb-1">
          <span>⚠️</span> AI Analysis Error
        </div>
        <p className="text-slate-400 text-sm">{error}</p>
        <p className="text-slate-500 text-xs mt-1">Check that your OpenAI API key is configured in Integrations.</p>
      </div>
    )
  }

  if (!insights) {
    return (
      <div className="bg-slate-900 border border-slate-700 border-dashed rounded-xl p-8 text-center">
        <span className="text-4xl block mb-3">🤖</span>
        <p className="text-slate-300 font-semibold mb-1">No AI Analysis Yet</p>
        <p className="text-slate-500 text-sm">Click <strong className="text-orange-400">Generate Insights</strong> to get AI-powered recommendations based on your current business data.</p>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-orange-500/25 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/15 border border-orange-500/30 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-xl">🤖</span>
          </div>
          <div>
            <p className="text-orange-400 text-xs font-medium uppercase tracking-wide mb-0.5">AI Executive Summary</p>
            <h2 className="text-white font-bold text-lg leading-tight">{insights.headline}</h2>
          </div>
        </div>
        {insights.generatedAt && (
          <span className="text-slate-600 text-xs flex-shrink-0 ml-4">
            {new Date(insights.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {insights.performance && (
          <div className="bg-slate-800/50 rounded-xl p-4">
            <p className="text-blue-400 text-xs font-semibold uppercase tracking-wide mb-2">📊 Performance</p>
            <p className="text-slate-300 text-sm leading-relaxed">{insights.performance}</p>
          </div>
        )}
        {insights.opportunities && (
          <div className="bg-slate-800/50 rounded-xl p-4">
            <p className="text-green-400 text-xs font-semibold uppercase tracking-wide mb-2">🚀 Opportunities</p>
            <p className="text-slate-300 text-sm leading-relaxed">{insights.opportunities}</p>
          </div>
        )}
        {insights.risks && (
          <div className="bg-slate-800/50 rounded-xl p-4">
            <p className="text-yellow-400 text-xs font-semibold uppercase tracking-wide mb-2">⚠️ Risks</p>
            <p className="text-slate-300 text-sm leading-relaxed">{insights.risks}</p>
          </div>
        )}
        {insights.recommendation && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
            <p className="text-orange-400 text-xs font-semibold uppercase tracking-wide mb-2">🎯 Top Recommendation</p>
            <p className="text-white text-sm font-medium leading-relaxed">{insights.recommendation}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ForecastChart({ history, forecast, stats, fmt }) {
  const allData = [...history.slice(-21), ...forecast.slice(0, 21)]
  const maxRev = Math.max(...allData.map(d => d.revenue || 0), ...forecast.map(d => d.upper || 0), 1)
  const histCount = Math.min(history.length, 21)

  if (!allData.length) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500">
        <p className="text-3xl mb-2">📈</p>
        <p>Not enough data for forecast yet</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white font-semibold">Revenue Forecast — 30 Days</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Based on {stats?.dataPoints || 0} days of history · Linear regression + day-of-week seasonality
          </p>
        </div>
        {stats && (
          <div className="text-right">
            <p className="text-orange-400 font-bold text-sm">{fmt(stats.forecast30Total)}</p>
            <p className="text-slate-500 text-xs">30-day projected</p>
          </div>
        )}
      </div>

      <div className="flex items-end gap-px" style={{ height: 140 }}>
        {allData.map((d, i) => {
          const isHistory = i < histCount
          const heightPct = maxRev > 0 ? Math.max(2, (d.revenue / maxRev) * 100) : 2
          const upperPct  = maxRev > 0 ? (((d.upper  || d.revenue) / maxRev) * 100) : heightPct
          const lowerPct  = maxRev > 0 ? (((d.lower  || d.revenue) / maxRev) * 100) : heightPct

          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end relative group"
              title={`${fmtDay(d.date)}: ${fmt(d.revenue)}${!isHistory ? ` (${fmt(d.lower)}–${fmt(d.upper)})` : ''}`}
            >
              {!isHistory && (
                <div className="absolute bottom-0 w-full rounded-sm bg-blue-500/10"
                  style={{ height: `${upperPct}%` }} />
              )}
              <div
                className={`w-full rounded-sm transition-all ${isHistory ? 'bg-orange-500/80 hover:bg-orange-400' : 'bg-blue-500/60 hover:bg-blue-400/80'}`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${histCount}, 1fr)` }}>
          {history.slice(-histCount).filter((_, i) => i % Math.max(1, Math.floor(histCount / 5)) === 0).map(d => (
            <span key={d.date} className="text-slate-600 text-[9px] truncate">{fmtDay(d.date)}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-5 mt-3 pt-3 border-t border-slate-800">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 rounded-sm bg-orange-500/80" />
          <span className="text-slate-400 text-xs">Historical</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 rounded-sm bg-blue-500/60" />
          <span className="text-slate-400 text-xs">Forecast</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 rounded-sm bg-blue-500/10" />
          <span className="text-slate-400 text-xs">Confidence band (±18%)</span>
        </div>
      </div>
    </div>
  )
}

function ForecastStats({ stats, fmt }) {
  if (!stats) return null
  const growing = stats.trendSlope > 0
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
      <h3 className="text-white font-semibold text-sm">Forecast Stats</h3>
      {[
        { label: 'Avg Daily Revenue', value: fmt(stats.avgDailyRevenue), icon: '💵' },
        { label: '30-Day Forecast',   value: fmt(stats.forecast30Total), icon: '📅', accent: true },
        {
          label: 'Revenue Trend',
          value: `${growing ? '▲' : '▼'} ${Math.abs(Number(stats.trendSlope)).toFixed(3)} OMR/day`,
          icon: growing ? '📈' : '📉',
          color: growing ? 'text-green-400' : 'text-red-400',
        },
        {
          label: 'Weekly Growth',
          value: `${stats.weeklyGrowthPct > 0 ? '+' : ''}${stats.weeklyGrowthPct}%`,
          icon: stats.weeklyGrowthPct >= 0 ? '🟢' : '🔴',
          color: stats.weeklyGrowthPct >= 0 ? 'text-green-400' : 'text-red-400',
        },
        { label: 'Data Points', value: `${stats.dataPoints} days`, icon: '📊', color: 'text-slate-400' },
      ].map(row => (
        <div key={row.label} className="flex items-center justify-between">
          <span className="text-slate-400 text-xs flex items-center gap-1.5">{row.icon} {row.label}</span>
          <span className={`text-sm font-semibold ${row.color || (row.accent ? 'text-orange-400' : 'text-white')}`}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}

const QUADRANT_META = {
  star:      { label: 'Stars',       emoji: '⭐', color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/25',  desc: 'Promote actively' },
  plowhorse: { label: 'Plowhorses',  emoji: '🐴', color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/25',    desc: 'Optimize costs' },
  puzzle:    { label: 'Puzzles',     emoji: '❓', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/25', desc: 'Market better' },
  dog:       { label: 'Dogs',        emoji: '🐕', color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/25',       desc: 'Review/remove' },
}

function MatrixSummary({ summary, items, fmt }) {
  const topPerQuadrant = {}
  for (const q of ['star', 'plowhorse', 'puzzle', 'dog']) {
    topPerQuadrant[q] = (items || []).filter(i => i.quadrant === q).slice(0, 2)
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-sm">Menu Engineering Matrix</h3>
        <span className="text-slate-500 text-xs">This month</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {Object.entries(QUADRANT_META).map(([q, meta]) => (
          <div key={q} className={`rounded-xl border p-3 ${meta.bg}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold">{meta.emoji} <span className={meta.color}>{meta.label}</span></span>
              <span className={`text-lg font-bold ${meta.color}`}>{summary?.[q === 'plowhorse' ? 'plowhorses' : q + 's'] ?? summary?.[q] ?? 0}</span>
            </div>
            <p className="text-slate-500 text-xs">{meta.desc}</p>
            {topPerQuadrant[q]?.map(item => (
              <p key={item.id} className="text-slate-400 text-xs mt-1 truncate">· {item.name}</p>
            ))}
          </div>
        ))}
      </div>

      <p className="text-slate-500 text-xs text-center">
        Total: {Object.values(summary || {}).reduce((a, b) => a + b, 0)} menu items analyzed
      </p>
    </div>
  )
}

function TopItems({ items, fmt }) {
  if (!items?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-white font-semibold mb-4">🏆 Best Sellers</h3>
      <div className="space-y-3">
        {items.slice(0, 8).map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className={`text-xs font-bold w-5 flex-shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-600' : 'text-slate-600'}`}>
              #{i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm truncate">{item.name}</p>
              <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1">
                <div className="bg-orange-500 h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, (item.qty / items[0].qty) * 100)}%` }} />
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-white text-sm font-medium">{item.qty} sold</p>
              <p className="text-slate-500 text-xs">{fmt(item.revenue)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StockAlerts({ lowStock }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-white font-semibold mb-4">📦 Stock Status</h3>
      {lowStock.length === 0 ? (
        <div className="text-center py-6">
          <span className="text-4xl block mb-2">✅</span>
          <p className="text-green-400 font-medium text-sm">All stock levels healthy</p>
          <p className="text-slate-500 text-xs mt-1">No items below minimum threshold</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-yellow-400 text-xs font-semibold mb-3">
            <span>⚠️</span>
            <span>{lowStock.length} item{lowStock.length > 1 ? 's' : ''} need restocking</span>
          </div>
          {lowStock.map((item, i) => {
            const pct = parseFloat(item.min_quantity) > 0
              ? Math.round((parseFloat(item.quantity) / parseFloat(item.min_quantity)) * 100) : 0
            const isEmpty = parseFloat(item.quantity) === 0
            return (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
                <div>
                  <p className="text-white text-sm font-medium">{item.name}</p>
                  <p className="text-slate-500 text-xs capitalize">{item.category}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${isEmpty ? 'text-red-400' : 'text-yellow-400'}`}>
                    {item.quantity} {item.unit}
                  </p>
                  <p className="text-slate-600 text-xs">min: {item.min_quantity}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function AIExecutive() {
  const { fmt } = useCurrency()
  const [kpis, setKpis] = useState(null)
  const [forecastData, setForecastData] = useState(null)
  const [matrixData, setMatrixData] = useState(null)
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('today')

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      apiFetch(`/api/reports?period=${period}`).then(r => r.json()).catch(() => null),
      apiFetch('/api/reports/forecast').then(r => r.json()).catch(() => null),
      apiFetch('/api/reports/menu-matrix?period=month').then(r => r.json()).catch(() => null),
      apiFetch('/api/ai/insights').then(r => r.json()).catch(() => null),
    ]).then(([k, f, m, i]) => {
      setKpis(k)
      setForecastData(f)
      setMatrixData(m)
      setInsights(i)
      setLoading(false)
    })
  }, [period])

  const generateInsights = async () => {
    setGenerating(true)
    setError(null)
    try {
      const body = {
        kpis:          kpis          || {},
        forecastStats: forecastData?.stats  || {},
        matrixSummary: matrixData?.summary  || {},
      }
      const r = await apiFetch('/api/ai/insights', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (r.ok) setInsights(data)
      else setError(data.error || 'Failed to generate insights')
    } catch (e) {
      setError(e.message || 'Failed to generate insights')
    } finally {
      setGenerating(false)
    }
  }

  const periods = [
    { id: 'today', label: 'Today' },
    { id: 'week',  label: '7 Days' },
    { id: 'month', label: 'This Month' },
  ]

  return (
    <div className="p-4 md:p-6 min-h-screen">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
            🤖 AI Executive Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">AI-powered business intelligence & 30-day revenue forecasting</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 gap-0.5">
            {periods.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${period === p.id ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={generateInsights}
            disabled={generating || loading}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-orange-500/20"
          >
            <span className={generating ? 'animate-spin inline-block' : ''}>✨</span>
            {generating ? 'Analyzing...' : 'Generate Insights'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-20" />)}
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 animate-pulse h-32" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse h-64" />
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse h-64" />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <InsightCard insights={insights} generating={generating} error={error} />

          {kpis && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard label="Revenue"      value={fmt(kpis.revenue)}          icon="💵" color="text-orange-400" />
              <KpiCard label="Orders"       value={fmtN(kpis.totalOrders)}     icon="📋" color="text-blue-400" />
              <KpiCard label="Avg Order"    value={fmt(kpis.avgOrderValue)}     icon="🧾" color="text-purple-400" />
              <KpiCard label="Gross Profit" value={fmt(kpis.grossProfit)}       icon="📈"
                color={kpis.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'} />
              <KpiCard label="Margin"       value={`${kpis.grossMargin}%`}      icon="%"
                color={kpis.grossMargin >= 65 ? 'text-green-400' : kpis.grossMargin >= 45 ? 'text-yellow-400' : 'text-red-400'}
                sub="gross margin" />
              <KpiCard label="Customers"    value={fmtN(kpis.customersServed)} icon="👥" color="text-cyan-400" />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <ForecastChart
                history={forecastData?.history || []}
                forecast={forecastData?.forecast || []}
                stats={forecastData?.stats}
                fmt={fmt}
              />
            </div>
            <div className="space-y-4">
              {forecastData?.stats && <ForecastStats stats={forecastData.stats} fmt={fmt} />}
              {matrixData?.summary && (
                <MatrixSummary summary={matrixData.summary} items={matrixData.items} fmt={fmt} />
              )}
            </div>
          </div>

          {kpis && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <TopItems items={kpis.topItems || []} fmt={fmt} />
              <StockAlerts lowStock={kpis.lowStock || []} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
