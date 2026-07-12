import React from 'react'

export default function TableOrderModal({ tableNum, orders, currency, onClose, onUpdateStatus, onToggleRush }) {
  const fmtC = (n) => `${currency} ${parseFloat(n || 0).toFixed(3)}`
  const userRole = (() => { try { return JSON.parse(localStorage.getItem('auth_user') || '{}').role || '' } catch { return '' } })()
  const STATUS_FLOW = {
    pending: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['completed'],
    completed: [], cancelled: []
  }
  const STATUS_COLOR = { pending:'text-yellow-400', preparing:'text-blue-400', ready:'text-green-400', completed:'text-slate-400', cancelled:'text-red-400' }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-xl">Table {tableNum}</h2>
            <p className="text-slate-400 text-sm mt-0.5">{orders.length} active order{orders.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-2xl leading-none transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {orders.map(order => (
            <div key={order.id} className={`border rounded-xl p-4 ${order.rush ? 'border-red-500/50 bg-red-500/5' : 'border-slate-800 bg-slate-800/30'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold">#{order.id}</span>
                  {order.rush && <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">🔴 RUSH</span>}
                  <span className={`text-xs font-semibold capitalize ${STATUS_COLOR[order.status]}`}>{order.status}</span>
                </div>
                <span className="text-orange-400 font-bold">{fmtC(order.total)}</span>
              </div>

              {/* Items */}
              <div className="space-y-1 mb-3">
                {(order.items || []).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-orange-400 font-bold w-5">{item.quantity}×</span>
                    <span className="text-slate-300">{item.name}</span>
                  </div>
                ))}
              </div>

              {order.notes && (
                <p className="text-yellow-300 text-xs italic mb-3">📝 {order.notes}</p>
              )}

              {/* Actions — cashier cannot move pay-later (unpaid) orders to preparing/ready */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => onToggleRush(order.id, !order.rush)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    order.rush ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-700 text-slate-400 hover:text-red-400'
                  }`}>
                  {order.rush ? '🔴 Rush' : '🚨 Rush'}
                </button>
                {(STATUS_FLOW[order.status] || []).map(s => {
                  const isPayLaterBlock = userRole === 'cashier' && !order.payment_method && ['preparing', 'ready'].includes(s)
                  if (isPayLaterBlock) return null
                  return (
                    <button key={s}
                      onClick={() => { onUpdateStatus(order.id, s); }}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                        s === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                        : s === 'cancelled' ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                        : 'bg-blue-500/15 text-blue-400 border border-blue-500/25 hover:bg-blue-500/25'
                      }`}>
                      {s === 'completed' ? '💳 Complete & Pay' : s === 'cancelled' ? '✕ Cancel' : `→ ${s}`}
                    </button>
                  )
                })}
                {userRole === 'cashier' && !order.payment_method && ['pending', 'preparing'].includes(order.status) && (
                  <p className="w-full text-xs text-slate-500 italic pt-1">
                    🍳 Kitchen staff handles preparation for pay-later orders
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800 flex-shrink-0">
          <button onClick={onClose} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
