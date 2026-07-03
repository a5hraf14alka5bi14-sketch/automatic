import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'

export default function ShiftCloseModal({ onClose, onDone }) {
  const { fmt } = useCurrency()
  const [current, setCurrent]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [actualCash, setActualCash] = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [view, setView]           = useState('close') // 'close' | 'history'
  const [history, setHistory]     = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const [selectedShift, setSelectedShift] = useState(null)
  const [shiftDetail, setShiftDetail] = useState(null)

  useEffect(() => {
    apiFetch('/api/shifts/current')
      .then(r => r.json())
      .then(d => { setCurrent(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (view !== 'history') return
    setHistLoading(true)
    apiFetch('/api/shifts?limit=20')
      .then(r => r.json())
      .then(d => { setHistory(Array.isArray(d) ? d : []); setHistLoading(false) })
      .catch(() => setHistLoading(false))
  }, [view])

  useEffect(() => {
    if (!selectedShift) return
    apiFetch(`/api/shifts/${selectedShift}`)
      .then(r => r.json())
      .then(d => setShiftDetail(d))
      .catch(() => {})
  }, [selectedShift])

  const handleOpen = async () => {
    setSaving(true); setError('')
    try {
      const r = await apiFetch('/api/shifts/open', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Failed to open shift'); setSaving(false); return }
      setCurrent(d)
      setSaving(false)
      onDone?.('opened')
    } catch { setError('Network error'); setSaving(false) }
  }

  const handleClose = async () => {
    if (!actualCash && actualCash !== 0) { setError('Enter the actual cash amount'); return }
    setSaving(true); setError('')
    try {
      const r = await apiFetch(`/api/shifts/${current.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual_cash: parseFloat(actualCash), notes }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Failed to close shift'); setSaving(false); return }
      setSaving(false)
      onDone?.('closed', d)
    } catch { setError('Network error'); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-white font-bold text-lg">🕐 Shift Management</h2>
          <div className="flex gap-2">
            <button onClick={() => setView('close')}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${view === 'close' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
              Current
            </button>
            <button onClick={() => setView('history')}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${view === 'history' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
              History
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white ml-2">✕</button>
          </div>
        </div>

        <div className="p-6">
          {view === 'close' && (
            loading ? <div className="text-center py-8 text-slate-400">Loading…</div>
            : !current ? (
              <div className="text-center space-y-4">
                <div className="text-5xl mb-2">🏪</div>
                <p className="text-white font-semibold text-lg">No shift is currently open</p>
                <p className="text-slate-400 text-sm">Open a shift to start tracking orders, cash, and Z-Reports.</p>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button onClick={handleOpen} disabled={saving}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                  {saving ? 'Opening…' : 'Open Shift'}
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="bg-slate-800 rounded-xl p-4 space-y-2">
                  <p className="text-slate-400 text-xs">Shift opened</p>
                  <p className="text-white font-medium">{new Date(current.opened_at).toLocaleString()}</p>
                  <p className="text-slate-400 text-xs">Opened by: {current.opened_by_name}</p>
                </div>

                <div>
                  <label className="block text-slate-300 text-sm mb-1.5 font-medium">
                    Actual Cash in Drawer <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number" min="0" step="0.001"
                    value={actualCash}
                    onChange={e => setActualCash(e.target.value)}
                    placeholder="0.000"
                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 text-lg font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 text-sm mb-1.5 font-medium">Notes (optional)</label>
                  <textarea
                    value={notes} onChange={e => setNotes(e.target.value)}
                    rows={2} placeholder="End-of-shift notes…"
                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 resize-none"
                  />
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button onClick={handleClose} disabled={saving || !actualCash}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                  {saving ? 'Closing…' : 'Close Shift & Generate Z-Report'}
                </button>
              </div>
            )
          )}

          {view === 'history' && (
            <div className="space-y-4">
              {histLoading ? <div className="text-center py-8 text-slate-400">Loading…</div>
               : history.length === 0 ? <div className="text-center py-8 text-slate-500">No shifts yet</div>
               : history.map(sh => (
                <div key={sh.id}>
                  <button onClick={() => setSelectedShift(selectedShift === sh.id ? null : sh.id)}
                    className="w-full text-left bg-slate-800 hover:bg-slate-700 rounded-xl p-4 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium text-sm">{new Date(sh.opened_at).toLocaleDateString()}</p>
                        <p className="text-slate-400 text-xs">{new Date(sh.opened_at).toLocaleTimeString()} → {sh.closed_at ? new Date(sh.closed_at).toLocaleTimeString() : 'Open'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-bold">{fmt(sh.total_revenue)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${sh.status === 'open' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-700 text-slate-400'}`}>
                          {sh.status}
                        </span>
                      </div>
                    </div>
                  </button>
                  {selectedShift === sh.id && shiftDetail && (
                    <ZReportCard shift={shiftDetail} fmt={fmt} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ZReportCard({ shift, fmt }) {
  const variance = parseFloat(shift.variance || 0)
  const methods  = shift.revenue_by_method || {}

  return (
    <div className="bg-slate-950 border border-slate-700 rounded-xl p-5 mt-2 space-y-4">
      <h3 className="text-orange-400 font-bold text-sm tracking-wider">Z-REPORT</h3>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-400 text-xs">Total Orders</p>
          <p className="text-white font-bold text-lg">{shift.total_orders}</p>
        </div>
        <div>
          <p className="text-slate-400 text-xs">Total Revenue</p>
          <p className="text-white font-bold text-lg">{fmt(shift.total_revenue)}</p>
        </div>
        <div>
          <p className="text-slate-400 text-xs">Expected Cash</p>
          <p className="text-white font-semibold">{fmt(shift.expected_cash)}</p>
        </div>
        <div>
          <p className="text-slate-400 text-xs">Actual Cash</p>
          <p className="text-white font-semibold">{fmt(shift.actual_cash)}</p>
        </div>
      </div>

      <div className={`rounded-xl p-3 ${variance === 0 ? 'bg-green-500/10 border border-green-500/20' : variance > 0 ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
        <p className="text-xs text-slate-400 mb-0.5">Cash Variance</p>
        <p className={`text-lg font-bold ${variance === 0 ? 'text-green-400' : variance > 0 ? 'text-blue-400' : 'text-red-400'}`}>
          {variance >= 0 ? '+' : ''}{fmt(variance)}
          {variance === 0 && ' ✓ Balanced'}
        </p>
      </div>

      {Object.keys(methods).length > 0 && (
        <div>
          <p className="text-slate-400 text-xs mb-2">Revenue by Payment Method</p>
          <div className="space-y-1">
            {Object.entries(methods).map(([method, total]) => (
              <div key={method} className="flex justify-between text-sm">
                <span className="text-slate-300 capitalize">{method}</span>
                <span className="text-white font-medium">{fmt(total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm border-t border-slate-800 pt-3">
        <div>
          <p className="text-slate-400 text-xs">Total Discounts</p>
          <p className="text-orange-400 font-semibold">{fmt(shift.discounts_total)}</p>
        </div>
        <div>
          <p className="text-slate-400 text-xs">Void Orders</p>
          <p className="text-red-400 font-semibold">{shift.voids_count} ({fmt(shift.voids_total)})</p>
        </div>
      </div>

      {shift.notes && (
        <div className="border-t border-slate-800 pt-3">
          <p className="text-slate-400 text-xs mb-1">Notes</p>
          <p className="text-slate-300 text-sm">{shift.notes}</p>
        </div>
      )}
    </div>
  )
}
