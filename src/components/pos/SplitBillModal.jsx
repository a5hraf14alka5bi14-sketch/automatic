import React, { useState } from 'react'

export default function SplitBillModal({ cart, subtotal, tax, total, currency, onClose }) {
  const [splits, setSplits] = useState(2)
  const fmtC = (n) => `${currency} ${parseFloat(n || 0).toFixed(3)}`
  const perPerson = splits > 0 ? total / splits : total

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">Split Bill</h2>
            <p className="text-slate-400 text-sm mt-0.5">Divide equally among guests</p>
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
                className="w-10 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xl font-bold transition-colors">−</button>
              <div className="flex-1 text-center">
                <span className="text-4xl font-bold text-orange-400">{splits}</span>
                <span className="text-slate-400 ml-2 text-sm">guests</span>
              </div>
              <button onClick={() => setSplits(Math.min(20, splits + 1))}
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
        <div className="p-5 border-t border-slate-800">
          <button onClick={onClose} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
