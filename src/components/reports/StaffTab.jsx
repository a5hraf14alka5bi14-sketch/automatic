import React from 'react'

// ── Staff Performance Tab ─────────────────────────────────────────────────────
export default function StaffTab({ staffData, staffLoading, period, periods, fmt }) {
  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-white font-semibold">👤 Staff Performance — {periods.find(p => p.id === period)?.label}</h2>
          <p className="text-slate-400 text-xs mt-0.5">Revenue and orders per team member</p>
        </div>
        {staffLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-800 rounded-lg animate-pulse" />)}
          </div>
        ) : !staffData || staffData.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="text-4xl mb-3">👤</p>
            <p className="font-medium">No staff data for this period</p>
            <p className="text-xs mt-1 text-slate-600">Orders need to be linked to staff members</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40">
                {['Staff Member', 'Role', 'Orders', 'Revenue', 'Avg Ticket', 'Items Sold'].map((h, i) => (
                  <th key={h} className={`py-3 px-4 text-slate-400 text-xs font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffData.map((s, i) => (
                <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-400 text-xs font-bold">
                        {s.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="text-white font-medium text-sm">{s.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border capitalize ${
                      s.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                      s.role === 'manager' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                      'bg-slate-700 text-slate-400 border-slate-600'
                    }`}>{s.role}</span>
                  </td>
                  <td className="py-3 px-4 text-right text-white font-medium text-sm">{s.orders}</td>
                  <td className="py-3 px-4 text-right text-orange-400 font-semibold text-sm">{fmt(s.revenue)}</td>
                  <td className="py-3 px-4 text-right text-slate-300 text-sm">{fmt(s.avgTicket)}</td>
                  <td className="py-3 px-4 text-right text-slate-400 text-sm">{s.itemsSold}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
