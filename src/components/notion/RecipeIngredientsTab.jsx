import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../utils/api.js'
import { API } from './notionShared.jsx'

export default function RecipeIngredientsTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    apiFetch(`${API}/recipe-ingredients`)
      .then(r => { if (!r.ok) throw new Error('Failed to load recipe ingredients'); return r.json() })
      .then(d => { if (alive) setRows(d) })
      .catch(e => { if (alive) setErr(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (loading) return (
    <div className="flex items-center gap-3 text-slate-500 py-16 justify-center">
      <div className="w-5 h-5 border-2 border-slate-600 border-t-orange-400 rounded-full animate-spin" />
      <span className="text-sm">Loading recipe ingredients…</span>
    </div>
  )

  if (err) return (
    <div className="text-sm px-4 py-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">{err}</div>
  )

  if (rows.length === 0) return (
    <div className="text-center py-16 text-slate-500">
      <p className="text-4xl mb-3">🧾</p>
      <p className="font-medium">No recipe ingredients yet</p>
      <p className="text-sm mt-1">Run a full sync from the Status tab to pull the Recipe Ingredients database from Notion.</p>
    </div>
  )

  const groups = {}
  for (const r of rows) {
    const key = r.menu_item_name || '— Unlinked ingredients —'
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([menuName, items]) => {
        const totalCost = items.reduce((s, i) => s + (parseFloat(i.cost) || 0) * (parseFloat(i.quantity) || 0), 0)
        return (
          <div key={menuName} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <span>🍽️</span> {menuName}
                <span className="text-slate-500 font-normal">· {items.length} ingredient{items.length !== 1 ? 's' : ''}</span>
              </h3>
              <span className="text-xs text-orange-400 font-medium">Recipe cost: {totalCost.toFixed(3)} OMR</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800/60">
                  <th className="px-5 py-2 font-medium">Ingredient</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium">Cost/Unit</th>
                  <th className="px-3 py-2 font-medium">Linked Inventory</th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="border-b border-slate-800/40 last:border-0">
                    <td className="px-5 py-2.5 text-slate-200">{i.ingredient_name}</td>
                    <td className="px-3 py-2.5 text-slate-400">{parseFloat(i.quantity)}</td>
                    <td className="px-3 py-2.5 text-slate-400">{i.unit}</td>
                    <td className="px-3 py-2.5 text-slate-400">{(parseFloat(i.cost) || 0).toFixed(3)}</td>
                    <td className="px-3 py-2.5">
                      {i.inventory_item_name ? (
                        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full">
                          🔗 {i.inventory_item_name}
                          {i.inventory_stock != null && (
                            <span className="text-green-400/60">({parseFloat(i.inventory_stock)} {i.inventory_unit})</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-500 rounded-full">not linked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
