import React, { useState } from 'react'
import { apiFetch } from '../../utils/api.js'
import { useToast } from '../../context/ToastContext.jsx'

const METHODS = [
  { id: 'cash', label: 'Cash', icon: '💵' },
  { id: 'card', label: 'Card', icon: '💳' },
  { id: 'other', label: 'Other', icon: '📱' },
]

export default function SplitBillModal({ cart, subtotal, tax, total, currency, order, onClose, onAllPaid }) {
  const showToast = useToast()
  const [splits, setSplits] = useState(2)
  const [payments, setPayments] = useState([])
  const [currentMethod, setCurrentMethod] = useState('cash')
  const [customAmount, setCustomAmount] = useState('')
  const [cashGiven, setCashGiven] = useState('')
  const [paying, setPaying] = useState(false)
  const [mode, setMode] = useState('preview') // 'preview' | 'collect'

  const fmtC = (n) => `${currency} ${parseFloat(n || 0).toFixed(3)}`
  const perPerson = splits > 0 ? total / splits : total

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, parseFloat((total - totalPaid).toFixed(3)))
  const isComplete = remaining <= 0.001

  const nextAmount = parseFloat(customAmount) > 0
    ? parseFloat(parseFloat(customAmount).toFixed(3))
    : parseFloat(Math.min(perPerson, remaining).toFixed(3))
  const cashNum = parseFloat(cashGiven || 0)
  const change = currentMethod === 'cash' && cashGiven !== '' ? Math.max(0, cashNum - nextAmount) : 0
  const cashInsufficient = currentMethod === 'cash' && cashGiven !== '' && cashNum < nextAmount

  const payNext = async () => {
    const amount = nextAmount
    if (!(amount > 0)) return showToast('أدخل مبلغاً صحيحاً · Enter a valid amount', 'error')
    if (amount > remaining + 0.001) return showToast(`Max remaining: ${fmtC(remaining)}`, 'error')

    if (order?.id) {
      setPaying(true)
      try {
        const res = await apiFetch(`/api/orders/${order.id}/split-payment`, {
          method: 'POST',
          body: JSON.stringify({ method: currentMethod, amount })
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Payment failed')
      } catch (err) {
        showToast(err.message, 'error')
        setPaying(false)
        return
      }
      setPaying(false)
    }

    setPayments(p => [...p, { method: currentMethod, amount, at: new Date() }])
    setCustomAmount('')
    setCashGiven('')
  }

  if (mode === 'preview') {
    return (
      <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-white font-bold text-lg">Split Bill</h2>
              <p className="text-slate-400 text-sm mt-0.5">تقسيم الفاتورة</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl transition-colors">✕</button>
          </div>
          <div className="p-5 space-y-5">
            <div className="bg-slate-800/60 rounded-xl p-4 space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-slate-400">Subtotal</span><span className="text-white">{fmtC(subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-400">Tax</span><span className="text-white">{fmtC(tax)}</span></div>
              <div className="flex justify-between font-bold pt-2 border-t border-slate-700">
                <span className="text-white">Total</span><span className="text-orange-400">{fmtC(total)}</span>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-sm block mb-3">Number of guests</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setSplits(Math.max(2, splits - 1))}
                  aria-label="Decrease number of guests"
                  className="w-10 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xl font-bold transition-colors">−</button>
                <div className="flex-1 text-center">
                  <span className="text-4xl font-bold text-orange-400">{splits}</span>
                  <span className="text-slate-400 ml-2 text-sm">guests</span>
                </div>
                <button onClick={() => setSplits(Math.min(20, splits + 1))}
                  aria-label="Increase number of guests"
                  className="w-10 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xl font-bold transition-colors">+</button>
              </div>
              <div className="flex gap-2 mt-3">
                {[2,3,4,5,6].map(n => (
                  <button key={n} onClick={() => setSplits(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${splits === n ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
              <p className="text-orange-300 text-xs font-medium mb-2 uppercase tracking-wide">Each guest pays</p>
              <p className="text-orange-400 text-4xl font-bold">{fmtC(perPerson)}</p>
              <div className="flex gap-4 mt-2 text-xs text-slate-400">
                <span>Subtotal: {fmtC(subtotal / splits)}</span>
                <span>Tax: {fmtC(tax / splits)}</span>
              </div>
            </div>
          </div>
          <div className="p-5 border-t border-slate-800 flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
              Cancel
            </button>
            {order?.id && (
              <button onClick={() => setMode('collect')}
                className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-colors">
                Collect Payments
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="text-white font-bold">Collect Payments</h2>
            <p className="text-slate-500 text-xs">{splits} ways — {fmtC(perPerson)}/person</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Progress */}
          <div className="bg-slate-800 rounded-xl p-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">Paid</span>
              <span className="text-green-400 font-semibold">{fmtC(totalPaid)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Remaining</span>
              <span className={`font-bold ${remaining > 0 ? 'text-orange-400' : 'text-green-400'}`}>{fmtC(remaining)}</span>
            </div>
            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${Math.min(100, (totalPaid / total) * 100)}%` }} />
            </div>
          </div>

          {payments.length > 0 && (
            <div className="space-y-1">
              {payments.map((p, i) => (
                <div key={i} className="flex justify-between text-xs bg-slate-800/50 rounded-lg px-3 py-1.5">
                  <span className="text-slate-400">Person {i + 1} · {p.method}</span>
                  <span className="text-green-400">{fmtC(p.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {!isComplete ? (
            <>
              <div className="flex gap-2">
                {METHODS.map(m => (
                  <button key={m.id} onClick={() => setCurrentMethod(m.id)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                      currentMethod === m.id ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-slate-800 text-slate-400 border border-transparent'
                    }`}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1">Amount · المبلغ</label>
                <input type="number" step="0.001" min="0.001" value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  placeholder={nextAmount.toFixed(3)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setCustomAmount(remaining.toFixed(3))}
                    className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors">
                    المتبقي · {fmtC(remaining)}
                  </button>
                  {remaining > 0.002 && (
                    <button onClick={() => setCustomAmount((remaining / 2).toFixed(3))}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors">
                      النصف · {fmtC(remaining / 2)}
                    </button>
                  )}
                </div>
              </div>

              {currentMethod === 'cash' && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
                  <label className="block text-slate-400 text-xs">Cash Given · المبلغ المستلم</label>
                  <input type="number" step="0.001" min="0" value={cashGiven}
                    onChange={e => setCashGiven(e.target.value)}
                    placeholder={nextAmount.toFixed(3)}
                    className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-white text-sm focus:outline-none transition-colors ${
                      cashInsufficient ? 'border-red-500' : 'border-slate-600 focus:border-orange-500'
                    }`} />
                  {cashInsufficient && <p className="text-red-400 text-xs">المبلغ غير كافٍ · Insufficient amount</p>}
                  {cashGiven !== '' && !cashInsufficient && (
                    <div className="flex justify-between items-center bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
                      <span className="text-green-300 text-xs font-medium">Change · الباقي</span>
                      <span className="text-green-400 font-bold">{fmtC(change)}</span>
                    </div>
                  )}
                </div>
              )}

              <button onClick={payNext} disabled={paying || cashInsufficient}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                {paying ? 'Processing…' : `Collect ${fmtC(nextAmount)} · تحصيل`}
              </button>
            </>
          ) : (
            <div className="text-center space-y-3">
              <div className="text-4xl">✅</div>
              <p className="text-green-400 font-bold">Bill fully paid!</p>
              <button onClick={() => onAllPaid?.(payments)}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors">
                Done · إتمام
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
