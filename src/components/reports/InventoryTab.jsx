import React from 'react'

// ── Inventory / Stock Tab ─────────────────────────────────────────────────────
export default function InventoryTab({ data }) {
  return (
    <div className="space-y-6">
      {!data.lowStock || data.lowStock.length === 0 ? (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-8 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-green-400 font-semibold">All stock levels are healthy</p>
          <p className="text-slate-500 text-sm mt-1">No items are below their minimum threshold</p>
        </div>
      ) : (
        <>
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-red-400 font-semibold">{data.lowStock.length} item{data.lowStock.length > 1 ? 's' : ''} below minimum stock</p>
              <p className="text-slate-400 text-sm">Restock soon to avoid running out during service</p>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40">
                  {['Item','Category','In Stock','Minimum','Status'].map((h, i) => (
                    <th key={h} className={`py-3 px-4 text-slate-400 text-xs font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((item, i) => {
                  const pct = parseFloat(item.min_quantity) > 0 ? Math.round((parseFloat(item.quantity) / parseFloat(item.min_quantity)) * 100) : 0
                  const isEmpty = parseFloat(item.quantity) === 0
                  return (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="py-3 px-4 text-white font-medium text-sm">{item.name}</td>
                      <td className="py-3 px-4 text-slate-400 text-sm capitalize">{item.category}</td>
                      <td className="py-3 px-4 text-right"><span className={`font-semibold text-sm ${isEmpty ? 'text-red-400' : 'text-yellow-400'}`}>{item.quantity} {item.unit}</span></td>
                      <td className="py-3 px-4 text-right text-slate-400 text-sm">{item.min_quantity} {item.unit}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium border ${isEmpty ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'}`}>
                          {isEmpty ? '🚫 Out of stock' : `⚠️ ${pct}% of min`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
