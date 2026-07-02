import React, { useState } from 'react'

export default function PaymentModal({ order, currency, onConfirm, onClose }) {
  const [method, setMethod] = useState('cash')
  const [applyLoyalty, setApplyLoyalty] = useState(false)
  const [cashGiven, setCashGiven] = useState('')
  const [loading, setLoading] = useState(false)

  const loyaltyPoints = order.loyalty_points || 0
  const loyaltyPerOmr = order.loyalty_per_omr || 1
  const orderTotal = parseFloat(order.total)
  const maxRedeemable = Math.min(loyaltyPoints, Math.floor(orderTotal * loyaltyPerOmr))
  const discountAmount = loyaltyPerOmr > 0 ? parseFloat((maxRedeemable / loyaltyPerOmr).toFixed(3)) : 0
  const pointsToRedeem = applyLoyalty ? maxRedeemable : 0
  const amountDue = parseFloat((orderTotal - (applyLoyalty ? discountAmount : 0)).toFixed(3))

  const cashNum = parseFloat(cashGiven || 0)
  const change = method === 'cash' ? Math.max(0, cashNum - amountDue) : 0
  const cashInsufficient = method === 'cash' && cashGiven !== '' && cashNum < amountDue

  const handle = async () => {
    setLoading(true)
    await onConfirm(order.id, method, pointsToRedeem)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="p-5 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-white font-bold text-lg">Payment</h2>
          <p className="text-slate-400 text-sm mt-0.5">Order #{order.id} · {order.type}</p>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* Total */}
          <div className="bg-slate-800 rounded-2xl p-5 text-center">
            <p className="text-slate-400 text-sm">{applyLoyalty ? 'After Loyalty Discount' : 'Amount Due'}</p>
            <p className={`text-5xl font-bold mt-1 transition-colors ${applyLoyalty ? 'text-green-400' : 'text-orange-400'}`}>
              {currency} {amountDue.toFixed(3)}
            </p>
            {applyLoyalty && discountAmount > 0 && (
              <p className="text-slate-500 text-xs mt-2 line-through">{currency} {orderTotal.toFixed(3)}</p>
            )}
          </div>

          {/* Loyalty redemption */}
          {loyaltyPoints > 0 && discountAmount > 0 && (
            <button onClick={() => setApplyLoyalty(v => !v)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                applyLoyalty
                  ? 'bg-orange-500/10 border-orange-500 text-orange-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
              }`}>
              <div className="text-left">
                <p className="text-sm font-medium">🎁 Redeem Loyalty Points</p>
                <p className="text-xs opacity-70 mt-0.5">
                  {maxRedeemable} pts → save {currency} {discountAmount.toFixed(3)}
                  {loyaltyPoints > maxRedeemable ? ` (of ${loyaltyPoints})` : ''}
                </p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                applyLoyalty ? 'border-orange-400 bg-orange-400' : 'border-slate-500'
              }`}>
                {applyLoyalty && <span className="text-white text-xs font-bold leading-none">✓</span>}
              </div>
            </button>
          )}

          {/* Payment method */}
          <div>
            <p className="text-slate-400 text-sm font-medium mb-2">Payment Method</p>
            <div className="grid grid-cols-3 gap-2">
              {[['cash','💵','Cash'],['card','💳','Card'],['other','📱','Other']].map(([v,e,l]) => (
                <button key={v} onClick={() => setMethod(v)}
                  className={`py-3 rounded-xl flex flex-col items-center gap-1.5 transition-all text-sm font-medium ${
                    method === v ? 'bg-orange-500 text-white ring-2 ring-orange-400' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}>
                  <span className="text-2xl">{e}</span>{l}
                </button>
              ))}
            </div>
          </div>

          {/* Cash change calculator */}
          {method === 'cash' && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
              <p className="text-slate-300 text-sm font-medium">Cash Calculator</p>
              <div>
                <label className="text-slate-500 text-xs mb-1 block">Cash Given</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={cashGiven}
                  onChange={e => setCashGiven(e.target.value)}
                  placeholder={amountDue.toFixed(3)}
                  className={`w-full bg-slate-900 border rounded-xl px-3 py-2 text-white text-sm focus:outline-none transition-colors ${
                    cashInsufficient ? 'border-red-500' : 'border-slate-600 focus:border-orange-500'
                  }`}
                />
                {cashInsufficient && <p className="text-red-400 text-xs mt-1">Insufficient amount</p>}
              </div>
              {cashGiven !== '' && !cashInsufficient && (
                <div className="flex justify-between items-center bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
                  <span className="text-green-300 text-sm font-medium">Change Due</span>
                  <span className="text-green-400 text-xl font-bold">{currency} {change.toFixed(3)}</span>
                </div>
              )}
              {/* Quick cash buttons */}
              <div className="flex gap-2 flex-wrap">
                {[amountDue, Math.ceil(amountDue), amountDue + 0.5, amountDue + 1].filter((v,i,a) => a.indexOf(v) === i && v > 0).slice(0,4).map(v => (
                  <button key={v} onClick={() => setCashGiven(v.toFixed(3))}
                    className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors">
                    {currency} {v.toFixed(3)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-800 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            Pay Later
          </button>
          <button onClick={handle} disabled={loading || cashInsufficient}
            className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
            {loading ? 'Processing…' : '✓ Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
