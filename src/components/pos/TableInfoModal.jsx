import React, { useState } from 'react'
import { apiFetch } from '../../utils/api.js'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'

export default function TableInfoModal({ tableNum, onProceed, onCancel }) {
  const [mobile, setMobile]   = useState('')
  const [name, setName]       = useState('')
  const [adults, setAdults]   = useState(0)
  const [kids, setKids]       = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const panelRef = useDialogA11y(onCancel)

  const handleProceed = async () => {
    setLoading(true); setError('')
    try {
      let customerId = null

      if (mobile.trim()) {
        const res  = await apiFetch(`/api/customers?q=${encodeURIComponent(mobile.trim())}`)
        const list = await res.json()
        const found = Array.isArray(list) ? list.find(c =>
          (c.phone || '').replace(/\D/g, '').endsWith(mobile.replace(/\D/g, '').slice(-8))
        ) : null

        if (found) {
          customerId = found.id
        } else {
          const cr  = await apiFetch('/api/customers', {
            method: 'POST',
            body: JSON.stringify({ name: name.trim() || mobile.trim(), phone: mobile.trim() })
          })
          if (!cr.ok) { const d = await cr.json(); throw new Error(d.error || 'Could not create customer') }
          const nc = await cr.json()
          customerId = nc.id
        }
      }

      onProceed({ customerId, adultsCount: adults, kidsCount: kids })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="tbl-info-title"
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm">

        <div className="p-5 border-b border-slate-800">
          <h2 id="tbl-info-title" className="text-white font-bold text-xl">
            من الذي يطلب؟ · Who is ordering?
          </h2>
          <p className="text-orange-400 text-sm mt-0.5 font-medium">Table {tableNum}</p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">
              📱 Mobile Number · رقم الجوال <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="tel"
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              placeholder="+968 9xxx xxxx"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1.5">
              👤 Customer Name · اسم العميل <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Name…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">👨‍👩‍👧 Adults · بالغين</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAdults(a => Math.max(0, a - 1))}
                  className="w-9 h-9 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors"
                >−</button>
                <span className="flex-1 text-center text-white font-bold text-lg">{adults}</span>
                <button
                  onClick={() => setAdults(a => a + 1)}
                  className="w-9 h-9 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors"
                >+</button>
              </div>
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">🧒 Kids · أطفال</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setKids(k => Math.max(0, k - 1))}
                  className="w-9 h-9 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors"
                >−</button>
                <span className="flex-1 text-center text-white font-bold text-lg">{kids}</span>
                <button
                  onClick={() => setKids(k => k + 1)}
                  className="w-9 h-9 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors"
                >+</button>
              </div>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="p-4 border-t border-slate-800 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors"
          >
            رجوع · Cancel
          </button>
          <button
            onClick={handleProceed}
            disabled={loading}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {loading ? '…' : 'متابعة · Proceed'}
          </button>
        </div>
      </div>
    </div>
  )
}
