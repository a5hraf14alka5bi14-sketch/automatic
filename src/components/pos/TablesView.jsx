import React, { useState } from 'react'
import TableOrderModal from './TableOrderModal.jsx'
import TableInfoModal from './TableInfoModal.jsx'

const TYPE_COLOR = {
  takeaway: { border: 'border-amber-500/40', dot: 'bg-amber-400', text: 'text-amber-400', icon: '🛍️' },
  delivery:  { border: 'border-red-500/40',  dot: 'bg-red-400',   text: 'text-red-400',  icon: '🚗' },
}
const STATUS_DOT = { pending: 'bg-yellow-400', preparing: 'bg-blue-400', ready: 'bg-green-400', completed: 'bg-slate-500', cancelled: 'bg-red-400' }
const STATUS_TEXT = { pending: 'text-yellow-400', preparing: 'text-blue-400', ready: 'text-green-400', completed: 'text-slate-500', cancelled: 'text-red-400' }

export default function TablesView({
  rushCount, activeTableCount, tablesCount, fetchOpenOrders, setView,
  tablesLoading, tableMap, nonTableOrders, openOrders,
  setSelectedTableOrders, selectedTableOrders, fmtC, currency,
  tableUpdateStatus, tableToggleRush, goToTableOrder,
  settings, onPay, showToast,
}) {
  const [tableInfoPending, setTableInfoPending] = useState(null)

  return (
    <div className="p-5 h-full overflow-auto">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-3">
            Table View
            {rushCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                {rushCount} RUSH
              </span>
            )}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {activeTableCount} of {tablesCount} tables occupied
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchOpenOrders}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors border border-slate-700"
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => setView('pos')}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            🛒 POS
          </button>
        </div>
      </div>

      {tablesLoading ? (
        /* Loading skeleton */
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2.5">
          {[...Array(tablesCount)].map((_, i) => (
            <div key={i} className="aspect-square bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Table grid ──────────────────────────────────────────── */}
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2.5 mb-8">
            {Array.from({ length: tablesCount }, (_, i) => i + 1).map(n => {
              const orders   = tableMap[n] || []
              const occupied = orders.length > 0
              const isRush   = orders.some(o => o.rush)
              const hasFire  = orders.some(o => o.fire_together)
              const status   = occupied ? orders[0].status : null

              return (
                <button
                  key={n}
                  onClick={() =>
                    occupied
                      ? setSelectedTableOrders({ tableNum: n, orders })
                      : setTableInfoPending(n)
                  }
                  className={`
                    aspect-square rounded-xl flex flex-col items-center justify-center gap-1
                    border-2 transition-all cursor-pointer text-center
                    ${isRush
                      ? 'bg-red-500/20 border-red-500 text-red-300 hover:bg-red-500/30'
                      : occupied
                        ? 'bg-orange-500/15 border-orange-500/50 text-orange-300 hover:bg-orange-500/25'
                        : 'bg-slate-900 border-slate-700/60 text-slate-500 hover:bg-slate-800 hover:border-slate-500 hover:text-slate-300'
                    }
                  `}
                >
                  <span className="text-lg font-bold leading-none">{n}</span>
                  {occupied ? (
                    <>
                      <div className="flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || 'bg-slate-400'}`} />
                        <span className="text-[10px] capitalize leading-none">{status}</span>
                      </div>
                      {isRush  && <span className="text-[10px] font-bold leading-none">RUSH</span>}
                      {hasFire && !isRush && <span className="text-xs leading-none">🔥</span>}
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-600">free</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* ── Takeaway / Delivery orders ───────────────────────────── */}
          {nonTableOrders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-widest">
                  Takeaway &amp; Delivery
                </h2>
                <span className="bg-slate-800 text-slate-400 text-xs font-medium px-2 py-0.5 rounded-full">
                  {nonTableOrders.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {nonTableOrders.map(o => {
                  const tc = TYPE_COLOR[o.type] || { border: 'border-slate-700', dot: 'bg-slate-500', text: 'text-slate-400', icon: '📦' }
                  return (
                    <div
                      key={o.id}
                      className={`bg-slate-900 border rounded-xl p-3.5 ${o.rush ? 'border-red-500/50' : tc.border}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none">{tc.icon}</span>
                          <span className="text-white font-bold text-sm">#{o.id}</span>
                          {o.rush && (
                            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                              RUSH
                            </span>
                          )}
                        </div>
                        <span className="text-orange-400 font-semibold text-sm">{fmtC(o.total)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[o.status] || 'bg-slate-500'}`} />
                        <span className={`text-xs capitalize ${STATUS_TEXT[o.status] || 'text-slate-400'}`}>{o.status}</span>
                        <span className="text-slate-600 text-xs">· {o.items_count} items</span>
                        <span className={`text-xs capitalize ml-auto ${tc.text}`}>{o.type}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Empty state ──────────────────────────────────────────── */}
          {openOrders.length === 0 && (
            <div className="text-center py-20">
              <p className="text-4xl mb-3">🍽️</p>
              <p className="text-slate-500 text-sm">All tables free</p>
            </div>
          )}
        </>
      )}

      {/* "Who is ordering?" modal */}
      {tableInfoPending !== null && (
        <TableInfoModal
          tableNum={tableInfoPending}
          onCancel={() => setTableInfoPending(null)}
          onProceed={info => {
            setTableInfoPending(null)
            goToTableOrder(tableInfoPending, info)
          }}
        />
      )}

      {/* Occupied table modal */}
      {selectedTableOrders && (
        <TableOrderModal
          tableNum={selectedTableOrders.tableNum}
          orders={selectedTableOrders.orders}
          currency={currency}
          onClose={() => setSelectedTableOrders(null)}
          onUpdateStatus={tableUpdateStatus}
          onToggleRush={tableToggleRush}
          onAddItems={() => goToTableOrder(selectedTableOrders.tableNum)}
          settings={settings}
          onPay={onPay}
          fetchOpenOrders={fetchOpenOrders}
          showToast={showToast}
          tableMap={tableMap}
          tablesCount={tablesCount}
        />
      )}
    </div>
  )
}
