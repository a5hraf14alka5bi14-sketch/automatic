import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'
import { useRole, canManage } from '../utils/auth.js'
import { useToast } from '../context/ToastContext.jsx'

const UNITS = ['kg', 'g', 'L', 'mL', 'pcs', 'pack', 'box', 'bag', 'bottle', 'can', 'tbsp', 'tsp', 'cup']

function CostBadge({ pct, size = 'sm' }) {
  const n = parseFloat(pct) || 0
  if (n === 0) return <span className="text-xs text-slate-500">No recipe</span>
  const cls = n < 30
    ? 'bg-green-500/15 text-green-400 border-green-500/30'
    : n < 40
      ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
      : 'bg-red-500/15 text-red-400 border-red-500/30'
  const dot = n < 30 ? '🟢' : n < 40 ? '🟡' : '🔴'
  return (
    <span className={`${size === 'lg' ? 'text-sm px-3 py-1' : 'text-xs px-2 py-0.5'} rounded-full border font-medium ${cls} flex items-center gap-1`}>
      <span>{dot}</span>{n.toFixed(1)}% cost
    </span>
  )
}

function RecipePanel({ item, invItems, onFoodCostUpdate, isManager }) {
  const { fmt } = useCurrency()
  const toast = useToast()
  const [recipe, setRecipe] = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ inventory_item_id: '', ingredient_name: '', quantity: '', unit: 'kg', cost: '' })
  const [saving, setSaving] = useState(false)

  const loadRecipe = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/menu/${item.id}/recipe`)
      if (!res.ok) throw new Error()
      setRecipe(await res.json())
    } catch { toast('Failed to load recipe', 'error') }
    setLoading(false)
  }, [item.id, toast])

  useEffect(() => { loadRecipe() }, [loadRecipe])

  const totalCost = recipe.reduce((s, r) => s + parseFloat(r.cost || 0) * parseFloat(r.quantity || 0), 0)
  const price = parseFloat(item.price)
  const costPct = price > 0 ? (totalCost / price) * 100 : 0
  const marginPct = price > 0 ? ((price - totalCost) / price) * 100 : 0

  const handleInvSelect = (invId) => {
    const inv = invItems.find(i => i.id === parseInt(invId))
    if (inv) setAddForm(f => ({ ...f, inventory_item_id: invId, ingredient_name: inv.name, unit: inv.unit || 'kg', cost: inv.cost || '' }))
    else setAddForm(f => ({ ...f, inventory_item_id: '' }))
  }

  const handleAdd = async () => {
    if (!addForm.ingredient_name.trim() || !addForm.quantity) { toast('Name and quantity are required', 'error'); return }
    setSaving(true)
    try {
      const res = await apiFetch(`/api/menu/${item.id}/recipe`, {
        method: 'POST',
        body: JSON.stringify({
          inventory_item_id: addForm.inventory_item_id ? parseInt(addForm.inventory_item_id) : null,
          ingredient_name: addForm.ingredient_name.trim(),
          quantity: parseFloat(addForm.quantity),
          unit: addForm.unit,
          cost: addForm.cost !== '' ? parseFloat(addForm.cost) : 0
        })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setAddForm({ inventory_item_id: '', ingredient_name: '', quantity: '', unit: 'kg', cost: '' })
      setAdding(false)
      await loadRecipe()
      onFoodCostUpdate()
      toast('Ingredient added', 'success')
    } catch (e) { toast(e.message || 'Failed to add', 'error') }
    setSaving(false)
  }

  const startEdit = (ing) => {
    setEditId(ing.id)
    setEditForm({ quantity: ing.quantity, unit: ing.unit, cost: ing.cost })
  }

  const handleEdit = async (rid) => {
    setSaving(true)
    try {
      const res = await apiFetch(`/api/menu/${item.id}/recipe/${rid}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: parseFloat(editForm.quantity), unit: editForm.unit, cost: parseFloat(editForm.cost || 0) })
      })
      if (!res.ok) throw new Error()
      setEditId(null)
      await loadRecipe()
      onFoodCostUpdate()
      toast('Updated', 'success')
    } catch { toast('Failed to update', 'error') }
    setSaving(false)
  }

  const handleDelete = async (rid, name) => {
    if (!confirm(`Remove "${name}" from recipe?`)) return
    try {
      await apiFetch(`/api/menu/${item.id}/recipe/${rid}`, { method: 'DELETE' })
      await loadRecipe()
      onFoodCostUpdate()
      toast('Removed', 'success')
    } catch { toast('Failed to remove', 'error') }
  }

  if (loading) return (
    <div className="space-y-2 p-6">
      {[...Array(4)].map((_, i) => <div key={i} className="bg-slate-800 rounded-xl h-12 animate-pulse" />)}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Item header */}
      <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-white font-bold text-lg">{item.name}</h2>
          <p className="text-slate-400 text-sm capitalize">{item.category} · {fmt(price)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <CostBadge pct={costPct} size="lg" />
          <span className="text-xs text-slate-400">Margin: <span className={marginPct >= 60 ? 'text-green-400' : marginPct >= 40 ? 'text-yellow-400' : 'text-red-400'}>{marginPct.toFixed(1)}%</span></span>
        </div>
      </div>

      {/* Cost summary bar */}
      <div className="mx-5 mt-4 bg-slate-800 rounded-xl p-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-slate-400 text-xs mb-0.5">Food Cost</p>
          <p className="text-white font-bold text-sm">{fmt(totalCost)}</p>
        </div>
        <div>
          <p className="text-slate-400 text-xs mb-0.5">Menu Price</p>
          <p className="text-white font-bold text-sm">{fmt(price)}</p>
        </div>
        <div>
          <p className="text-slate-400 text-xs mb-0.5">Gross Profit</p>
          <p className={`font-bold text-sm ${(price - totalCost) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(price - totalCost)}</p>
        </div>
      </div>

      {/* Ingredients list */}
      <div className="flex-1 overflow-y-auto px-5 mt-4">
        {recipe.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-3xl mb-2">🧪</p>
            <p className="text-slate-400 text-sm">No ingredients yet</p>
            <p className="text-slate-500 text-xs mt-1">Add ingredients to calculate food cost automatically</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-3">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50">
                  <th className="text-left py-2 px-3 text-slate-400 text-xs font-medium">Ingredient</th>
                  <th className="text-right py-2 px-3 text-slate-400 text-xs font-medium">Qty</th>
                  <th className="text-left py-2 px-3 text-slate-400 text-xs font-medium">Unit</th>
                  <th className="text-right py-2 px-3 text-slate-400 text-xs font-medium">Cost/unit</th>
                  <th className="text-right py-2 px-3 text-slate-400 text-xs font-medium">Line Cost</th>
                  {isManager && <th className="py-2 px-3 w-16"></th>}
                </tr>
              </thead>
              <tbody>
                {recipe.map(ing => {
                  const lineCost = parseFloat(ing.cost || 0) * parseFloat(ing.quantity || 0)
                  const isEditing = editId === ing.id
                  return (
                    <tr key={ing.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-2">
                        <p className="text-white text-sm font-medium">{ing.ingredient_name}</p>
                        {ing.inventory_name && ing.inventory_name !== ing.ingredient_name && (
                          <p className="text-slate-500 text-xs">→ {ing.inventory_name}</p>
                        )}
                      </td>
                      {isEditing ? (
                        <>
                          <td className="px-3 py-2">
                            <input type="number" step="any" min="0" value={editForm.quantity}
                              onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                              className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right focus:outline-none focus:border-orange-500" />
                          </td>
                          <td className="px-3 py-2">
                            <select value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                              className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-orange-500">
                              {UNITS.map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" step="0.001" min="0" value={editForm.cost}
                              onChange={e => setEditForm(f => ({ ...f, cost: e.target.value }))}
                              className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right focus:outline-none focus:border-orange-500" />
                          </td>
                          <td className="px-3 py-2 text-right text-slate-400 text-xs">
                            {fmt(parseFloat(editForm.cost || 0) * parseFloat(editForm.quantity || 0))}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <button onClick={() => handleEdit(ing.id)} disabled={saving}
                                className="text-green-400 hover:text-green-300 text-xs">✓</button>
                              <button onClick={() => setEditId(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right text-white text-sm">{parseFloat(ing.quantity)}</td>
                          <td className="px-3 py-2 text-slate-400 text-sm">{ing.unit}</td>
                          <td className="px-3 py-2 text-right text-slate-400 text-sm">{parseFloat(ing.cost || 0) > 0 ? fmt(ing.cost) : '—'}</td>
                          <td className="px-3 py-2 text-right text-orange-400 text-sm font-medium">{fmt(lineCost)}</td>
                          {isManager && (
                            <td className="px-3 py-2">
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => startEdit(ing)} className="text-slate-400 hover:text-blue-400 text-xs transition-colors" title="Edit">✏️</button>
                                <button onClick={() => handleDelete(ing.id, ing.ingredient_name)} className="text-slate-400 hover:text-red-400 text-xs transition-colors" title="Remove">🗑️</button>
                              </div>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  )
                })}
                <tr className="bg-slate-800/30">
                  <td colSpan={isManager ? 4 : 3} className="px-3 py-2 text-slate-400 text-xs font-medium text-right">Total Food Cost</td>
                  <td className="px-3 py-2 text-right text-orange-400 font-bold text-sm">{fmt(totalCost)}</td>
                  {isManager && <td />}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Add ingredient */}
        {isManager && (
          adding ? (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4">
              <p className="text-white text-sm font-medium mb-3">Add Ingredient</p>
              <div className="space-y-3">
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">Inventory Item (optional link)</label>
                  <select value={addForm.inventory_item_id} onChange={e => handleInvSelect(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                    <option value="">— Free text (no inventory link) —</option>
                    {invItems.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit}) — {i.quantity} in stock</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">Ingredient Name *</label>
                    <input value={addForm.ingredient_name} onChange={e => setAddForm(f => ({ ...f, ingredient_name: e.target.value }))}
                      placeholder="e.g. Chicken breast"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">Cost per Unit (OMR)</label>
                    <input type="number" step="0.001" min="0" value={addForm.cost} onChange={e => setAddForm(f => ({ ...f, cost: e.target.value }))}
                      placeholder="0.000"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">Quantity *</label>
                    <input type="number" step="any" min="0" value={addForm.quantity} onChange={e => setAddForm(f => ({ ...f, quantity: e.target.value }))}
                      placeholder="e.g. 0.25"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">Unit</label>
                    <select value={addForm.unit} onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                {addForm.quantity && addForm.cost && (
                  <div className="bg-slate-800 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                    <span className="text-slate-400">Line cost:</span>
                    <span className="text-orange-400 font-medium">{fmt(parseFloat(addForm.quantity || 0) * parseFloat(addForm.cost || 0))}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setAdding(false); setAddForm({ inventory_item_id: '', ingredient_name: '', quantity: '', unit: 'kg', cost: '' }) }}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">Cancel</button>
                  <button onClick={handleAdd} disabled={saving}
                    className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                    {saving && <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
                    Add Ingredient
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="w-full py-2.5 border border-dashed border-slate-700 hover:border-orange-500 text-slate-400 hover:text-orange-400 text-sm rounded-xl transition-colors mb-4">
              + Add Ingredient
            </button>
          )
        )}
      </div>
    </div>
  )
}

function FoodCostAnalysis({ items, fmt }) {
  const total = items.length
  const withRecipe = items.filter(i => parseInt(i.ingredient_count) > 0).length
  const highCost = items.filter(i => parseFloat(i.food_cost_pct) > 40).length
  const avgCostPct = total > 0 ? items.reduce((s, i) => s + parseFloat(i.food_cost_pct || 0), 0) / total : 0

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Dishes', value: total, color: 'text-white' },
          { label: 'With Recipe', value: withRecipe, color: 'text-blue-400' },
          { label: 'High Cost (>40%)', value: highCost, color: highCost > 0 ? 'text-red-400' : 'text-green-400' },
          { label: 'Avg Food Cost', value: `${avgCostPct.toFixed(1)}%`, color: avgCostPct < 30 ? 'text-green-400' : avgCostPct < 40 ? 'text-yellow-400' : 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/50">
              <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Dish</th>
              <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Category</th>
              <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Price</th>
              <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Food Cost</th>
              <th className="text-center py-3 px-4 text-slate-400 text-xs font-medium">Cost %</th>
              <th className="text-center py-3 px-4 text-slate-400 text-xs font-medium">Margin %</th>
              <th className="text-center py-3 px-4 text-slate-400 text-xs font-medium">Ingredients</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const costPct = parseFloat(item.food_cost_pct) || 0
              const marginPct = parseFloat(item.margin_pct) || 0
              const ingCount = parseInt(item.ingredient_count) || 0
              const costColor = costPct === 0 ? 'text-slate-500' : costPct < 30 ? 'text-green-400' : costPct < 40 ? 'text-yellow-400' : 'text-red-400'
              const marginColor = marginPct >= 60 ? 'text-green-400' : marginPct >= 40 ? 'text-yellow-400' : 'text-red-400'
              return (
                <tr key={item.id} className={`border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 transition-colors ${!item.available ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="text-white text-sm font-medium">{item.name}</p>
                    {!item.available && <span className="text-xs text-slate-500">Hidden</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm capitalize">{item.category}</td>
                  <td className="px-4 py-3 text-right text-white text-sm">{fmt(item.price)}</td>
                  <td className="px-4 py-3 text-right text-slate-400 text-sm">{parseFloat(item.food_cost) > 0 ? fmt(item.food_cost) : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {costPct > 0 ? (
                      <span className={`text-sm font-semibold ${costColor}`}>{costPct.toFixed(1)}%</span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {marginPct > 0 ? (
                      <span className={`text-sm font-semibold ${marginColor}`}>{marginPct.toFixed(1)}%</span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {ingCount > 0 ? (
                      <span className="bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded-full">{ingCount}</span>
                    ) : (
                      <span className="text-slate-600 text-xs">No recipe</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InventoryLinkTab({ invItems, isManager, onLinked }) {
  const toast = useToast()
  const [groups, setGroups] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [picks, setPicks] = useState({})       // ingredient_name -> inventory_item_id
  const [applyCost, setApplyCost] = useState({}) // ingredient_name -> bool
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, sRes] = await Promise.all([
        apiFetch('/api/menu/recipe/unlinked'),
        apiFetch('/api/menu/recipe/link-summary'),
      ])
      if (!uRes.ok || !sRes.ok) throw new Error()
      setGroups(await uRes.json())
      setSummary(await sRes.json())
    } catch { toast('Failed to load link status', 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleLink = async (name) => {
    const invId = picks[name]
    if (!invId) { toast('Choose an inventory item first', 'error'); return }
    setBusy(name)
    try {
      const res = await apiFetch('/api/menu/recipe/link', {
        method: 'PATCH',
        body: JSON.stringify({ ingredient_name: name, inventory_item_id: parseInt(invId), apply_cost: !!applyCost[name] }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      toast(`Linked — ${data.updated} line(s) across ${data.affected_dishes} dish(es)`, 'success')
      setPicks(p => { const n = { ...p }; delete n[name]; return n })
      await load()
      onLinked?.()
    } catch (e) { toast(e.message || 'Failed to link', 'error') }
    setBusy(null)
  }

  const filtered = groups.filter(g => !search || g.ingredient_name.includes(search))
  const pct = summary && summary.total > 0 ? Math.round((summary.linked / summary.total) * 100) : 0

  return (
    <div>
      {/* Progress summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-white text-sm font-medium">Inventory linking progress</p>
          <p className="text-slate-400 text-xs">
            {summary ? `${summary.linked} of ${summary.total} ingredient lines linked` : '—'}
          </p>
        </div>
        <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-slate-500">{summary ? `${summary.distinct_unlinked} distinct ingredients still need linking` : ''}</span>
          <span className="text-orange-400 font-medium">{pct}%</span>
        </div>
      </div>

      <p className="text-slate-400 text-xs mb-4">
        Link each recipe ingredient to a supplier inventory item so selling a dish deducts real stock.
        Linking applies to <span className="text-slate-300">every dish</span> that uses the same ingredient name.
      </p>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ingredient name…"
          className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-24 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-white font-medium">{groups.length === 0 ? 'All ingredients are linked to inventory' : 'No matching ingredients'}</p>
          <p className="text-slate-500 text-sm mt-1">{groups.length === 0 ? 'Sales will now deduct real stock for every recipe.' : 'Try a different search.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(g => {
            const pick = picks[g.ingredient_name] || ''
            return (
              <div key={g.ingredient_name} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-base" dir="rtl">{g.ingredient_name}</p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      used in {g.occurrences} dish{g.occurrences !== 1 ? 'es' : ''} · unit {g.unit || '—'}
                    </p>
                  </div>
                  <span className="flex-shrink-0 bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 text-xs px-2 py-0.5 rounded-full">Unlinked</span>
                </div>

                {/* Suggestions */}
                {g.suggestions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-slate-400 text-xs mb-1.5">Suggested matches:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.suggestions.map(s => {
                        const active = String(pick) === String(s.id)
                        return (
                          <button key={s.id} disabled={!isManager}
                            onClick={() => setPicks(p => ({ ...p, [g.ingredient_name]: s.id }))}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${active
                              ? 'bg-orange-500 border-orange-500 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-orange-500/60'} disabled:opacity-60 disabled:cursor-not-allowed`}
                            dir="rtl" title={`match ${(s.score * 100).toFixed(0)}%`}>
                            {s.name} <span className="opacity-60">({(s.score * 100).toFixed(0)}%)</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Full picker + action */}
                {isManager && (
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <select value={pick} onChange={e => setPicks(p => ({ ...p, [g.ingredient_name]: e.target.value }))}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" dir="rtl">
                      <option value="">— pick any inventory item —</option>
                      {invItems.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
                      <input type="checkbox" checked={!!applyCost[g.ingredient_name]}
                        onChange={e => setApplyCost(a => ({ ...a, [g.ingredient_name]: e.target.checked }))}
                        className="accent-orange-500" />
                      sync cost
                    </label>
                    <button onClick={() => handleLink(g.ingredient_name)} disabled={!pick || busy === g.ingredient_name}
                      className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap">
                      {busy === g.ingredient_name && <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
                      Link
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Recipes() {
  const { fmt } = useCurrency()
  const toast = useToast()
  const isManager = canManage(useRole())
  const [tab, setTab] = useState('builder')
  const [menuItems, setMenuItems] = useState([])
  const [invItems, setInvItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showPanel, setShowPanel] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mRes, iRes] = await Promise.all([
        apiFetch('/api/menu/food-cost'),
        apiFetch('/api/inventory'),
      ])
      if (!mRes.ok) throw new Error('Failed to load menu')
      const [mData, iData] = await Promise.all([mRes.json(), iRes.json()])
      setMenuItems(Array.isArray(mData) ? mData : [])
      setInvItems(Array.isArray(iData) ? iData : [])
    } catch (e) { toast(e.message || 'Failed to load', 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleFoodCostUpdate = useCallback(() => {
    apiFetch('/api/menu/food-cost').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setMenuItems(d)
    }).catch(() => {})
  }, [])

  const filtered = menuItems.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase())
  )

  const selectedItem = menuItems.find(m => m.id === selectedId)

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Recipes & Food Cost</h1>
          <p className="text-slate-400 text-sm mt-0.5">Build recipes, track ingredient costs, analyse profitability</p>
        </div>
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-0.5">
          {[['builder', '🧪 Recipe Builder'], ['links', '🔗 Inventory Links'], ['analysis', '📊 Food Cost Analysis']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'analysis' ? (
        loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-12 animate-pulse" />)}
          </div>
        ) : (
          <FoodCostAnalysis items={menuItems} fmt={fmt} />
        )
      ) : tab === 'links' ? (
        <InventoryLinkTab invItems={invItems} isManager={isManager} onLinked={handleFoodCostUpdate} />
      ) : (
        /* Recipe Builder — split layout */
        <div className="flex gap-5 h-[calc(100vh-180px)]">
          {/* Left: menu item list */}
          <div className="w-80 flex-shrink-0 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-3 border-b border-slate-800">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search dishes…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-3 space-y-2">
                  {[...Array(8)].map((_, i) => <div key={i} className="bg-slate-800 rounded-xl h-16 animate-pulse" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">No dishes found</div>
              ) : (
                filtered.map(item => {
                  const costPct = parseFloat(item.food_cost_pct) || 0
                  const ingCount = parseInt(item.ingredient_count) || 0
                  const isActive = item.id === selectedId
                  return (
                    <button key={item.id} onClick={() => { setSelectedId(item.id); setShowPanel(true) }}
                      className={`w-full text-left px-4 py-3 border-b border-slate-800/50 last:border-0 transition-colors ${isActive ? 'bg-orange-500/10 border-l-2 border-l-orange-500' : 'hover:bg-slate-800/50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isActive ? 'text-orange-400' : 'text-white'}`}>{item.name}</p>
                          <p className="text-slate-500 text-xs capitalize">{item.category} · {fmt(item.price)}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <CostBadge pct={costPct} />
                          <p className="text-slate-600 text-xs mt-0.5">{ingCount ? `${ingCount} ing.` : 'No recipe'}</p>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Right: recipe editor */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {!selectedItem ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <p className="text-6xl mb-4">🍳</p>
                <h3 className="text-white font-bold text-lg mb-2">Select a Dish</h3>
                <p className="text-slate-400 text-sm max-w-xs">Choose a dish from the left panel to view and edit its recipe ingredients and food cost breakdown.</p>
              </div>
            ) : (
              <RecipePanel
                key={selectedItem.id}
                item={selectedItem}
                invItems={invItems}
                onFoodCostUpdate={handleFoodCostUpdate}
                isManager={isManager}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
