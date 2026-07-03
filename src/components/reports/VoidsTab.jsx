import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../utils/api.js'

export default function VoidsTab({ period, fmt }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/reports/voids?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {[...Array(3)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse h-24" />)}
    </div>
  )

  if (!data) return <div className="text-center py-16 text-slate-500">Failed to load voids report</div>

  const { summary, orders } = data

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Total Voids"       value={summary.total_voids}      sub="cancelled orders" />
        <Card label="Voided Revenue"    value={fmt(summary.voided_value)} sub="value lost" accent />
        <Card label="With Reason"       value={summary.with_reason}      sub="recorded reasons" />
        <Card label="Completed → Void"  value={summary.completed_voids}  sub="post-completion" accent />
      </div>

      {/* Breakdown by void reason */}
      {summary.by_reason?.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-3">Top Void Reasons</h3>
          <div className="space-y-2">
            {summary.by_reason.map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div className="bg-red-500 h-2 rounded-full" style={{ width: `${r.pct}%` }} />
                </div>
                <span className="text-slate-300 text-sm w-40 truncate">{r.reason || '(no reason)'}</span>
                <span className="text-slate-400 text-sm w-6 text-right">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-white font-semibold">Voided Orders</h3>
          <span className="text-slate-400 text-sm">{orders.length} orders</span>
        </div>
        {orders.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <p className="text-3xl mb-2">✅</p>
            <p>No voided orders in this period</p>
          </div>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40">
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Order</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Voided At</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Voided By</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Reason</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Was Completed</th>
                <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 text-white font-mono text-sm">#{String(o.id).padStart(4, '0')}</td>
                  <td className="py-3 px-4 text-slate-400 text-sm">
                    {o.voided_at ? new Date(o.voided_at).toLocaleString() : new Date(o.updated_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-slate-300 text-sm">{o.voided_by_name || '—'}</td>
                  <td className="py-3 px-4 text-sm max-w-[200px]">
                    {o.void_reason
                      ? <span className="text-orange-300">{o.void_reason}</span>
                      : <span className="text-slate-600 italic">no reason</span>}
                  </td>
                  <td className="py-3 px-4">
                    {o.was_completed
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Post-completion</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Before completion</span>}
                  </td>
                  <td className="py-3 px-4 text-right text-white font-medium">{fmt(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Card({ label, value, sub, accent }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-red-400' : 'text-white'}`}>{value ?? '—'}</p>
      <p className="text-slate-500 text-xs mt-1">{sub}</p>
    </div>
  )
}
