import React from 'react'
import TableOrderModal from './TableOrderModal.jsx'

export default function TablesView({
  rushCount, activeTableCount, tablesCount, fetchOpenOrders, setView,
  tablesLoading, tableMap, nonTableOrders, openOrders,
  setSelectedTableOrders, selectedTableOrders, fmtC, currency,
  tableUpdateStatus, tableToggleRush,
}) {
  return (
    <div className="p-5 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-3">
            Table View
            {rushCount > 0 && <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">{rushCount} RUSH</span>}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">{activeTableCount} of {tablesCount} tables occupied</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchOpenOrders} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">↻ Refresh</button>
          <button onClick={() => setView('pos')} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
            🛒 POS
          </button>
        </div>
      </div>

      {tablesLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-3">
          {[...Array(tablesCount)].map((_, i) => (
            <div key={i} className="aspect-square bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Table grid */}
          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-3 mb-8">
            {Array.from({ length: tablesCount }, (_, i) => i + 1).map(n => {
              const orders = tableMap[n] || []
              const occupied = orders.length > 0
              const isRush = orders.some(o => o.rush)
              const status = occupied ? orders[0].status : null
              const STATUS_DOT = { pending: 'bg-yellow-400', preparing: 'bg-blue-400', ready: 'bg-green-400' }
              return (
                <button
                  key={n}
                  onClick={() => occupied ? setSelectedTableOrders({ tableNum: n, orders }) : null}
                  disabled={!occupied}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 border-2 transition-all ${
                    isRush ? 'bg-red-500/20 border-red-500 text-red-300 hover:bg-red-500/30 cursor-pointer'
                    : occupied ? 'bg-orange-500/15 border-orange-500/60 text-orange-300 hover:bg-orange-500/25 cursor-pointer'
                    : 'bg-slate-900 border-slate-700 text-slate-600 cursor-default'
                  }`}
                >
                  <span className="text-xl font-bold">{n}</span>
                  {occupied ? (
                    <>
                      <div className="flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || 'bg-slate-400'}`} />
                        <span className="text-xs capitalize">{status}</span>
                      </div>
                      {isRush && <span className="text-xs font-bold">RUSH</span>}
                    </>
                  ) : (
                    <span className="text-xs">free</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Non-table orders */}
          {nonTableOrders.length > 0 && (
            <div>
              <h2 className="text-slate-400 text-sm font-semibold mb-3 uppercase tracking-wide">Takeaway / Delivery</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {nonTableOrders.map(o => (
                  <div key={o.id} className={`bg-slate-900 border rounded-xl p-4 ${o.rush ? 'border-red-500/40' : 'border-slate-800'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">#{o.id}</span>
                        {o.rush && <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">RUSH</span>}
                        <span className="text-slate-400 text-xs capitalize">{o.type}</span>
                      </div>
                      <span className="text-orange-400 font-semibold text-sm">{fmtC(o.total)}</span>
                    </div>
                    <p className="text-slate-500 text-xs capitalize">{o.status} · {o.items_count} items</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {openOrders.length === 0 && (
            <div className="text-center py-20">
              <p className="text-4xl mb-3">🍽️</p>
              <p className="text-slate-500">All tables free</p>
            </div>
          )}
        </>
      )}

      {/* Table order modal */}
      {selectedTableOrders && (
        <TableOrderModal
          tableNum={selectedTableOrders.tableNum}
          orders={selectedTableOrders.orders}
          currency={currency}
          onClose={() => setSelectedTableOrders(null)}
          onUpdateStatus={tableUpdateStatus}
          onToggleRush={tableToggleRush}
        />
      )}
    </div>
  )
}
