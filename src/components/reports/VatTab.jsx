import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../utils/api.js'

// ── VAT Reconciliation Tab ────────────────────────────────────────────────────
export default function VatTab({ period, fmt }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/reports/vat?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

  if (loading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-24 animate-pulse" />
      ))}
    </div>
  )

  if (!data) return (
    <div className="text-center py-16 text-slate-500">Failed to load VAT data</div>
  )

  const netPayable = data.net_vat_payable
  const isRefund = netPayable < 0

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-slate-400 text-xs mb-1">Output VAT (Sales)</p>
          <p className="text-2xl font-bold text-orange-400">{fmt(data.output_vat)}</p>
          <p className="text-slate-500 text-xs mt-1">VAT collected from customers</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-slate-400 text-xs mb-1">Input VAT (Purchases)</p>
          <p className="text-2xl font-bold text-blue-400">{fmt(data.input_vat)}</p>
          <p className="text-slate-500 text-xs mt-1">VAT paid to suppliers · {data.po_count} PO{data.po_count !== 1 ? 's' : ''} received</p>
        </div>
        <div className={`bg-slate-900 border rounded-xl p-5 ${isRefund ? 'border-green-500/30' : 'border-orange-500/30'}`}>
          <p className="text-slate-400 text-xs mb-1">Net VAT {isRefund ? 'Refund Due' : 'Payable'}</p>
          <p className={`text-2xl font-bold ${isRefund ? 'text-green-400' : 'text-white'}`}>
            {isRefund ? '−' : ''}{fmt(Math.abs(netPayable))}
          </p>
          <p className="text-slate-500 text-xs mt-1">{isRefund ? 'To reclaim from Tax Authority' : 'To remit to Tax Authority'}</p>
        </div>
      </div>

      {/* Reconciliation Detail */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-5">VAT Reconciliation</h2>
        <div className="space-y-3">
          {[
            { label: 'Output VAT (charged on sales)',     value: data.output_vat,   color: 'text-orange-400' },
            { label: 'Input VAT (paid on purchases)',     value: -data.input_vat,   color: 'text-blue-400', sep: true },
            {
              label: netPayable >= 0 ? 'Net VAT Payable to Tax Authority' : 'Net VAT Refund from Tax Authority',
              value: netPayable,
              color: netPayable >= 0 ? 'text-white font-bold text-lg' : 'text-green-400 font-bold text-lg',
              sep: true,
            },
          ].map((row, i) => (
            <div key={i}>
              {row.sep && <div className="border-t border-slate-700 my-3" />}
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400 text-sm">{row.label}</span>
                <span className={`text-sm ${row.color}`}>
                  {row.value < 0 ? '−' : ''}{fmt(Math.abs(row.value))}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Purchase Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-4">Purchase Cost Breakdown</h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Gross Purchases (inc. VAT)</span>
            <span className="text-white">{fmt(data.gross_purchases)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Input VAT on Purchases</span>
            <span className="text-blue-400">−{fmt(data.input_vat)}</span>
          </div>
          <div className="border-t border-slate-700 pt-3 flex justify-between text-sm">
            <span className="text-slate-300 font-medium">Net Purchases (ex. VAT)</span>
            <span className="text-white font-semibold">{fmt(data.net_purchases)}</span>
          </div>
        </div>
        <p className="text-slate-600 text-xs mt-4">
          Net cost is used for food cost and margin calculations. Only received purchase orders are included.
        </p>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
        <span className="text-xl flex-shrink-0">ℹ️</span>
        <div>
          <p className="text-amber-300 font-medium text-sm">VAT Filing Reminder</p>
          <p className="text-slate-400 text-xs mt-1">
            These figures are for reference only. Verify against official tax records before filing with Oman Tax Authority.
            Input VAT is counted when purchase orders are marked received.
          </p>
        </div>
      </div>
    </div>
  )
}
