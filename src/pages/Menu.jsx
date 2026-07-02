import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'
import { useRole, canManage } from '../utils/auth.js'

const CATEGORIES = [
  { id: 'all', label: 'All Items', emoji: '🍽️' },
  { id: 'shawarma', label: 'Shawarma', emoji: '🌯' },
  { id: 'grills', label: 'Grills', emoji: '🔥' },
  { id: 'appetizers', label: 'Appetizers', emoji: '🥙' },
  { id: 'salads', label: 'Salads', emoji: '🥗' },
  { id: 'sandwiches', label: 'Sandwiches', emoji: '🥪' },
  { id: 'meals', label: 'Meals', emoji: '🍱' },
  { id: 'manakish', label: 'Manakish', emoji: '🫓' },
  { id: 'desserts', label: 'Desserts', emoji: '🍮' },
  { id: 'drinks', label: 'Drinks', emoji: '🥤' },
]

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]))

const AVAILABILITY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'available', label: 'Available' },
  { id: 'unavailable', label: 'Hidden' },
]

function margin(price, cost) {
  const p = parseFloat(price), c = parseFloat(cost)
  if (!p || p === 0) return 0
  return Math.round(((p - c) / p) * 100)
}

function marginColor(pct) {
  if (pct >= 70) return 'text-green-400'
  if (pct >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

function ImagePlaceholder({ category, name }) {
  const cat = CAT_MAP[category] || { emoji: '🍽️' }
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-800 text-4xl select-none">
      {cat.emoji}
    </div>
  )
}

function MenuCard({ item, onEdit, onToggle, onDelete, onModifiers }) {
  const { fmt } = useCurrency()
  const navigate = useNavigate()
  const isManager = canManage(useRole())
  const mgn = margin(item.price, item.food_cost)
  const costPct = parseFloat(item.price) > 0 ? Math.round((parseFloat(item.food_cost || 0) / parseFloat(item.price)) * 100) : 0
  const costPctColor = costPct === 0 ? 'text-slate-500' : costPct < 30 ? 'text-green-400' : costPct < 40 ? 'text-yellow-400' : 'text-red-400'
  const tags = item.tags ? item.tags.split(',').map(t => t.trim()).filter(Boolean) : []

  return (
    <div className={`bg-slate-900 border rounded-xl overflow-hidden flex flex-col transition-all group ${item.available ? 'border-slate-800' : 'border-slate-700 opacity-60'}`}>
      {/* Image */}
      <div className="h-36 relative overflow-hidden bg-slate-800 flex-shrink-0">
        {item.image_url
          ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
          : null}
        <div className={`${item.image_url ? 'hidden' : 'flex'} w-full h-full items-center justify-center text-5xl`}>
          {(CAT_MAP[item.category] || CAT_MAP.all).emoji}
        </div>

        {/* Availability badge */}
        <div className="absolute top-2 left-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.available ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-slate-700 text-slate-400 border border-slate-600'}`}>
            {item.available ? 'Available' : 'Hidden'}
          </span>
        </div>

        {/* Actions overlay */}
        {isManager && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => navigate('/recipes')} className="w-7 h-7 bg-slate-900/90 hover:bg-green-500 text-white rounded-lg flex items-center justify-center text-xs transition-colors" title="Recipe">🧪</button>
            <button onClick={() => onModifiers(item)} className="w-7 h-7 bg-slate-900/90 hover:bg-blue-500 text-white rounded-lg flex items-center justify-center text-xs transition-colors" title="Modifiers">⚡</button>
            <button onClick={() => onEdit(item)} className="w-7 h-7 bg-slate-900/90 hover:bg-orange-500 text-white rounded-lg flex items-center justify-center text-xs transition-colors" title="Edit">✏️</button>
            <button onClick={() => onDelete(item)} className="w-7 h-7 bg-slate-900/90 hover:bg-red-500 text-white rounded-lg flex items-center justify-center text-xs transition-colors" title="Delete">🗑️</button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-white font-semibold text-sm leading-tight">{item.name}</h3>
          <span className="text-orange-400 font-bold text-sm flex-shrink-0">{fmt(item.price)}</span>
        </div>

        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
            {(CAT_MAP[item.category] || { emoji: '🍽️' }).emoji} {item.category}
          </span>
          {item.prep_time && <span className="text-xs text-slate-500">⏱ {item.prep_time}m</span>}
        </div>

        {item.description && (
          <p className="text-slate-500 text-xs leading-relaxed mb-2 line-clamp-2">{item.description}</p>
        )}

        {/* Cost + Margin */}
        <div className="flex items-center gap-3 mb-2 mt-auto pt-2 border-t border-slate-800">
          <div>
            <p className="text-slate-500 text-xs">Food Cost</p>
            <p className="text-slate-300 text-xs font-medium">{fmt(item.food_cost || 0)}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Cost %</p>
            <p className={`text-xs font-bold ${costPctColor}`}>{costPct > 0 ? `${costPct}%` : '—'}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Margin</p>
            <p className={`text-xs font-bold ${marginColor(mgn)}`}>{mgn}%</p>
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.slice(0, 3).map(t => (
              <span key={t} className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        )}

        {/* Toggle availability */}
        <button
          onClick={() => onToggle(item)}
          className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors mt-1 ${item.available ? 'bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400' : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'}`}
        >
          {item.available ? 'Hide from POS' : 'Make Available'}
        </button>
      </div>
    </div>
  )
}

function MenuRow({ item, onEdit, onToggle, onDelete, onModifiers }) {
  const { fmt } = useCurrency()
  const isManager = canManage(useRole())
  const mgn = margin(item.price, item.food_cost)
  const tags = item.tags ? item.tags.split(',').map(t => t.trim()).filter(Boolean) : []
  return (
    <tr className={`border-b border-slate-800 hover:bg-slate-800/40 transition-colors ${!item.available ? 'opacity-60' : ''}`}>
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800 flex items-center justify-center text-xl">
            {item.image_url
              ? <img src={item.image_url} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display='none' }} />
              : (CAT_MAP[item.category] || CAT_MAP.all).emoji}
          </div>
          <div>
            <p className="text-white font-medium text-sm">{item.name}</p>
            {item.description && <p className="text-slate-500 text-xs truncate max-w-xs">{item.description}</p>}
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
          {(CAT_MAP[item.category] || { emoji: '🍽️' }).emoji} {item.category}
        </span>
      </td>
      <td className="py-3 px-4 text-orange-400 font-bold">{fmt(item.price)}</td>
      <td className="py-3 px-4 text-slate-400 text-sm">{fmt(item.food_cost || 0)}</td>
      <td className={`py-3 px-4 font-bold text-sm ${marginColor(mgn)}`}>{mgn}%</td>
      <td className="py-3 px-4 text-slate-500 text-sm">{item.prep_time || 15}m</td>
      <td className="py-3 px-4">
        <div className="flex flex-wrap gap-1">
          {tags.slice(0,2).map(t => <span key={t} className="text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">{t}</span>)}
        </div>
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.available ? 'bg-green-500/10 text-green-400' : 'bg-slate-700 text-slate-500'}`}>
          {item.available ? 'Available' : 'Hidden'}
        </span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {isManager && <>
            <button onClick={() => onModifiers(item)} className="text-slate-400 hover:text-blue-400 transition-colors text-sm" title="Modifiers">⚡</button>
            <button onClick={() => onEdit(item)} className="text-slate-400 hover:text-orange-400 transition-colors text-sm" title="Edit">✏️</button>
            <button onClick={() => onToggle(item)} className="text-slate-400 hover:text-yellow-400 transition-colors text-sm" title="Toggle">{item.available ? '🙈' : '👁️'}</button>
            <button onClick={() => onDelete(item)} className="text-slate-400 hover:text-red-400 transition-colors text-sm" title="Delete">🗑️</button>
          </>}
        </div>
      </td>
    </tr>
  )
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

function ItemModal({ item, inventory, onClose, onSave }) {
  const { fmt, symbol } = useCurrency()
  const isEdit = !!item?.id
  const [form, setForm] = useState({
    name: item?.name || '',
    category: item?.category || 'appetizers',
    price: item?.price || '',
    description: item?.description || '',
    image_url: item?.image_url || '',
    prep_time: item?.prep_time || 15,
    tags: item?.tags || '',
    food_cost: item?.food_cost || 0,
    available: item?.available !== false,
  })
  const [recipe, setRecipe] = useState(item?.recipe || [])
  const [newIng, setNewIng] = useState({ inventory_item_id: '', ingredient_name: '', quantity: 1, unit: 'pcs', cost: 0 })
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('basic')
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addIngredient = () => {
    if (!newIng.ingredient_name.trim()) return
    setRecipe(r => [...r, { ...newIng, id: Date.now() }])
    const inv = inventory.find(i => i.id === parseInt(newIng.inventory_item_id))
    const cost = inv ? parseFloat(inv.cost || 0) * parseFloat(newIng.quantity) : parseFloat(newIng.cost || 0) * parseFloat(newIng.quantity)
    setNewIng({ inventory_item_id: '', ingredient_name: '', quantity: 1, unit: 'pcs', cost: 0 })
    // Auto-recalculate food cost
    const totalCost = [...recipe, { ...newIng, cost: inv ? parseFloat(inv.cost || 0) : parseFloat(newIng.cost || 0) }]
      .reduce((s, r) => s + parseFloat(r.cost || 0) * parseFloat(r.quantity || 1), 0)
    set('food_cost', totalCost.toFixed(2))
  }

  const removeIngredient = (idx) => {
    const updated = recipe.filter((_, i) => i !== idx)
    setRecipe(updated)
    const totalCost = updated.reduce((s, r) => s + parseFloat(r.cost || 0) * parseFloat(r.quantity || 1), 0)
    set('food_cost', totalCost.toFixed(2))
  }

  const handleInventorySelect = (invId) => {
    const inv = inventory.find(i => i.id === parseInt(invId))
    setNewIng(n => ({
      ...n,
      inventory_item_id: invId,
      ingredient_name: inv ? inv.name : n.ingredient_name,
      unit: inv ? inv.unit : n.unit,
      cost: inv ? parseFloat(inv.cost || 0) : n.cost,
    }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.price) { setError('Name and price are required'); return }
    setSaving(true)
    setError('')
    try {
      const url = isEdit ? `/api/menu/${item.id}` : '/api/menu'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({ ...form, price: parseFloat(form.price), food_cost: parseFloat(form.food_cost || 0) })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const saved = await res.json()

      // Sync recipe if editing
      if (isEdit) {
        const existingIds = (item.recipe || []).map(r => r.id)
        const keptIds = recipe.filter(r => existingIds.includes(r.id)).map(r => r.id)
        for (const id of existingIds) {
          if (!keptIds.includes(id)) await apiFetch(`/api/menu/${item.id}/recipe/${id}`, { method: 'DELETE' })
        }
        for (const ing of recipe.filter(r => !existingIds.includes(r.id))) {
          await apiFetch(`/api/menu/${item.id}/recipe`, { method: 'POST', body: JSON.stringify(ing) })
        }
      } else {
        for (const ing of recipe) {
          await apiFetch(`/api/menu/${saved.id}/recipe`, { method: 'POST', body: JSON.stringify(ing) })
        }
      }

      onSave()
      onClose()
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  const calcMargin = margin(form.price, form.food_cost)

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-white font-bold text-lg">{isEdit ? 'Edit Item' : 'Add New Item'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 px-5">
          {[['basic','📋 Basic Info'], ['details','⚙️ Details'], ['recipe','🧪 Recipe']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === id ? 'border-orange-500 text-orange-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'basic' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-slate-400 text-xs mb-1 block">Item Name *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="e.g. Chicken Shawarma"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">Category *</label>
                  <select value={form.category} onChange={e => set('category', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                    {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                      <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">Price ({symbol}) *</label>
                  <input type="number" step="0.01" min="0" value={form.price} onChange={e => set('price', e.target.value)}
                    placeholder="12.99"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div className="col-span-2">
                  <label className="text-slate-400 text-xs mb-1 block">Description</label>
                  <textarea value={form.description} onChange={e => set('description', e.target.value)}
                    placeholder="Short description of the item…" rows={3}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 resize-none" />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div onClick={() => set('available', !form.available)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${form.available ? 'bg-orange-500' : 'bg-slate-700'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.available ? 'left-5' : 'left-0.5'}`} />
                    </div>
                    <span className="text-slate-300 text-sm">Available on POS</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {tab === 'details' && (
            <>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">Image URL</label>
                <input value={form.image_url} onChange={e => set('image_url', e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                {form.image_url && (
                  <div className="mt-2 h-24 w-24 rounded-lg overflow-hidden border border-slate-700">
                    <img src={form.image_url} alt="preview" className="w-full h-full object-cover"
                      onError={e => e.target.style.display = 'none'} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">Prep Time (minutes)</label>
                  <input type="number" min="1" value={form.prep_time} onChange={e => set('prep_time', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">Food Cost ({symbol})</label>
                  <input type="number" step="0.01" min="0" value={form.food_cost} onChange={e => set('food_cost', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">Tags (comma-separated)</label>
                <input value={form.tags} onChange={e => set('tags', e.target.value)}
                  placeholder="spicy, popular, chef's special, halal"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
              </div>

              {/* Margin preview */}
              {form.price && (
                <div className="bg-slate-800 rounded-xl p-4 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-slate-400 text-xs">Price</p>
                    <p className="text-orange-400 font-bold">{fmt(form.price || 0)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Food Cost</p>
                    <p className="text-slate-300 font-bold">{fmt(form.food_cost || 0)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Margin</p>
                    <p className={`font-bold ${marginColor(calcMargin)}`}>{calcMargin}%</p>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'recipe' && (
            <div className="space-y-4">
              <p className="text-slate-400 text-sm">Link ingredients from inventory to auto-calculate food cost.</p>

              {/* Existing ingredients */}
              {recipe.length > 0 && (
                <div className="border border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-800">
                      <th className="text-left py-2 px-3 text-slate-400 font-medium text-xs">Ingredient</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium text-xs">Qty</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium text-xs">Unit</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium text-xs">Cost/unit</th>
                      <th className="py-2 px-3"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-800">
                      {recipe.map((r, i) => (
                        <tr key={r.id || i} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 text-slate-300">{r.ingredient_name}</td>
                          <td className="py-2 px-3 text-slate-400">{r.quantity}</td>
                          <td className="py-2 px-3 text-slate-400">{r.unit}</td>
                          <td className="py-2 px-3 text-slate-400">{fmt(r.cost || 0)}</td>
                          <td className="py-2 px-3">
                            <button onClick={() => removeIngredient(i)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add ingredient */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
                <p className="text-slate-300 text-sm font-medium">Add Ingredient</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-500 text-xs mb-1 block">From Inventory</label>
                    <select value={newIng.inventory_item_id} onChange={e => handleInventorySelect(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500">
                      <option value="">— select —</option>
                      {inventory.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs mb-1 block">Ingredient Name *</label>
                    <input value={newIng.ingredient_name} onChange={e => setNewIng(n => ({ ...n, ingredient_name: e.target.value }))}
                      placeholder="e.g. Chicken"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs mb-1 block">Quantity</label>
                    <input type="number" step="0.001" min="0" value={newIng.quantity} onChange={e => setNewIng(n => ({ ...n, quantity: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs mb-1 block">Unit</label>
                    <input value={newIng.unit} onChange={e => setNewIng(n => ({ ...n, unit: e.target.value }))}
                      placeholder="kg, pcs, L…"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs mb-1 block">Cost per unit ({symbol})</label>
                    <input type="number" step="0.01" min="0" value={newIng.cost} onChange={e => setNewIng(n => ({ ...n, cost: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={addIngredient} className="w-full py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors">
                      + Add
                    </button>
                  </div>
                </div>
              </div>

              {recipe.length > 0 && (
                <div className="text-right text-slate-400 text-sm">
                  Total food cost: <span className="text-orange-400 font-bold">
                    {fmt(recipe.reduce((s, r) => s + parseFloat(r.cost || 0) * parseFloat(r.quantity || 1), 0))}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {error && <p className="text-red-400 text-sm px-5 pb-2">{error}</p>}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
            {saving && <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modifiers Modal ───────────────────────────────────────────────────────────
function ModifiersModal({ item, onClose }) {
  const { symbol } = useCurrency()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newGroup, setNewGroup] = useState({ name: '', required: false, max_selections: 1 })
  const [addingMod, setAddingMod] = useState({})
  const [error, setError] = useState('')

  const loadGroups = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/menu/${item.id}/modifier-groups`)
      const data = await res.json()
      setGroups(Array.isArray(data) ? data : [])
    } catch {}
    setLoading(false)
  }, [item.id])

  useEffect(() => { loadGroups() }, [loadGroups])

  const addGroup = async () => {
    if (!newGroup.name.trim()) return
    setSaving(true); setError('')
    try {
      const res = await apiFetch(`/api/menu/${item.id}/modifier-groups`, {
        method: 'POST', body: JSON.stringify(newGroup)
      })
      const data = await res.json()
      if (res.ok) { setGroups(prev => [...prev, data]); setNewGroup({ name: '', required: false, max_selections: 1 }) }
      else setError(data.error)
    } catch {}
    setSaving(false)
  }

  const deleteGroup = async (gid) => {
    await apiFetch(`/api/menu/modifier-groups/${gid}`, { method: 'DELETE' })
    setGroups(prev => prev.filter(g => g.id !== gid))
  }

  const addMod = async (gid) => {
    const mod = addingMod[gid] || {}
    if (!mod.name?.trim()) return
    setSaving(true)
    try {
      const res = await apiFetch(`/api/menu/modifier-groups/${gid}/modifiers`, {
        method: 'POST', body: JSON.stringify({ name: mod.name.trim(), price_delta: parseFloat(mod.price_delta || 0) })
      })
      const data = await res.json()
      if (res.ok) {
        setGroups(prev => prev.map(g => g.id === gid ? { ...g, modifiers: [...g.modifiers, data] } : g))
        setAddingMod(prev => ({ ...prev, [gid]: { name: '', price_delta: '' } }))
      }
    } catch {}
    setSaving(false)
  }

  const deleteMod = async (gid, mid) => {
    await apiFetch(`/api/menu/modifiers/${mid}`, { method: 'DELETE' })
    setGroups(prev => prev.map(g => g.id === gid ? { ...g, modifiers: g.modifiers.filter(m => m.id !== mid) } : g))
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Modifiers</h2>
            <p className="text-slate-400 text-sm mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No modifier groups yet — add one below.</div>
          ) : groups.map(g => (
            <div key={g.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-semibold text-sm">{g.name}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${g.required ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-700 text-slate-400'}`}>
                    {g.required ? 'Required' : 'Optional'}
                  </span>
                  <span className="text-xs text-slate-500">· max {g.max_selections}</span>
                </div>
                <button onClick={() => deleteGroup(g.id)} className="text-slate-600 hover:text-red-400 text-sm transition-colors" title="Delete group">🗑️</button>
              </div>

              {g.modifiers.length > 0 ? (
                <div className="space-y-1.5 mb-3">
                  {g.modifiers.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                      <span className="text-slate-300 text-sm">{m.name}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium ${parseFloat(m.price_delta) > 0 ? 'text-green-400' : parseFloat(m.price_delta) < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          {parseFloat(m.price_delta) === 0 ? 'Free' : `${parseFloat(m.price_delta) > 0 ? '+' : ''}${symbol} ${parseFloat(m.price_delta).toFixed(3)}`}
                        </span>
                        <button onClick={() => deleteMod(g.id, m.id)} className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-600 text-xs mb-3">No options yet</p>
              )}

              <div className="flex gap-2">
                <input
                  value={(addingMod[g.id] || {}).name || ''}
                  onChange={e => setAddingMod(prev => ({ ...prev, [g.id]: { ...(prev[g.id] || {}), name: e.target.value } }))}
                  placeholder="Option name"
                  onKeyDown={e => e.key === 'Enter' && addMod(g.id)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500"
                />
                <input
                  type="number" step="0.001"
                  value={(addingMod[g.id] || {}).price_delta !== undefined ? (addingMod[g.id] || {}).price_delta : ''}
                  onChange={e => setAddingMod(prev => ({ ...prev, [g.id]: { ...(prev[g.id] || {}), price_delta: e.target.value } }))}
                  placeholder="+0.000"
                  className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500"
                />
                <button onClick={() => addMod(g.id)} disabled={saving}
                  className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors font-medium">
                  + Add
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-slate-800 space-y-3 flex-shrink-0">
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">New Modifier Group</p>
          <div className="flex gap-2">
            <input
              value={newGroup.name}
              onChange={e => setNewGroup(n => ({ ...n, name: e.target.value }))}
              placeholder="Group name (e.g. Size, Extras, Sauce)"
              onKeyDown={e => e.key === 'Enter' && addGroup()}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
            />
            <select
              value={newGroup.max_selections}
              onChange={e => setNewGroup(n => ({ ...n, max_selections: parseInt(e.target.value) }))}
              className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
            >
              {[1,2,3,4,5].map(n => <option key={n} value={n}>Max {n}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer" onClick={() => setNewGroup(n => ({ ...n, required: !n.required }))}>
              <div className={`w-8 h-4 rounded-full relative transition-colors ${newGroup.required ? 'bg-orange-500' : 'bg-slate-700'}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${newGroup.required ? 'left-4' : 'left-0.5'}`} />
              </div>
              <span className="text-slate-400 text-sm">Required selection</span>
            </label>
            <button onClick={addGroup} disabled={saving || !newGroup.name.trim()}
              className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
              {saving ? 'Adding…' : 'Add Group'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({ item, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full">
        <p className="text-white font-bold mb-2">Delete "{item.name}"?</p>
        <p className="text-slate-400 text-sm mb-5">This will permanently remove the item and its recipe. It won't affect existing orders.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors">Cancel</button>
          <button onClick={async () => { setLoading(true); await onConfirm(); setLoading(false) }} disabled={loading}
            className="flex-1 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Menu() {
  const { fmt } = useCurrency()
  const [items, setItems] = useState([])
  const [inventory, setInventory] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [availFilter, setAvailFilter] = useState('all')
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [modifiersItem, setModifiersItem] = useState(null)

  const load = useCallback(async () => {
    try {
      const [itemsRes, invRes, statsRes] = await Promise.all([
        apiFetch('/api/menu/all'),
        apiFetch('/api/inventory'),
        apiFetch('/api/menu/stats'),
      ])
      const [itemsData, invData, statsData] = await Promise.all([
        itemsRes.json(), invRes.json(), statsRes.json()
      ])
      setItems(Array.isArray(itemsData) ? itemsData : [])
      setInventory(Array.isArray(invData) ? invData : [])
      setStats(statsData)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (item) => {
    await apiFetch(`/api/menu/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ available: !item.available })
    })
    load()
  }

  const handleDelete = async () => {
    await apiFetch(`/api/menu/${deleteItem.id}/hard`, { method: 'DELETE' })
    setDeleteItem(null)
    load()
  }

  const handleEdit = async (item) => {
    try {
      const res = await apiFetch(`/api/menu/${item.id}`)
      const full = await res.json()
      setEditItem(full)
    } catch { setEditItem(item) }
  }

  // Filter
  const filtered = items.filter(item => {
    if (catFilter !== 'all' && item.category !== catFilter) return false
    if (availFilter === 'available' && !item.available) return false
    if (availFilter === 'unavailable' && item.available) return false
    if (search) {
      const q = search.toLowerCase()
      return item.name.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        (item.tags || '').toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    }
    return true
  })

  const catCounts = items.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-bold">Menu & Recipes</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage your Lebanese restaurant menu, pricing, and recipes</p>
        </div>
        {canManage(useRole()) && (
          <button
            onClick={() => setEditItem({})}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-orange-500/20"
          >
            + Add Item
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Total Items" value={stats.total} />
          <StatCard label="Available" value={stats.available} sub={`${stats.total - stats.available} hidden`} />
          <StatCard label="Categories" value={stats.categories} />
          <StatCard label="Avg Price" value={fmt(stats.avg_price || 0)} />
          <StatCard label="Avg Food Cost" value={fmt(stats.avg_cost || 0)} />
          <StatCard label="Avg Margin" value={`${stats.avg_margin || 0}%`} sub="profit margin" />
        </div>
      )}

      {/* Category Pills */}
      <div className="flex gap-2 flex-wrap mb-4">
        {CATEGORIES.map(cat => (
          <button key={cat.id}
            onClick={() => setCatFilter(cat.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              catFilter === cat.id
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}>
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
            {cat.id !== 'all' && catCounts[cat.id] !== undefined && (
              <span className={`text-xs ${catFilter === cat.id ? 'text-orange-200' : 'text-slate-600'}`}>
                {catCounts[cat.id] || 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items, tags, descriptions…"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {AVAILABILITY_FILTERS.map(f => (
            <button key={f.id} onClick={() => setAvailFilter(f.id)}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${availFilter === f.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          <button onClick={() => setView('grid')} className={`px-2.5 py-1 rounded-md text-sm transition-colors ${view === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>⊞</button>
          <button onClick={() => setView('list')} className={`px-2.5 py-1 rounded-md text-sm transition-colors ${view === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>☰</button>
        </div>

        <span className="text-slate-500 text-sm">{filtered.length} items</span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Loading menu…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="text-slate-400 text-sm">No items found</p>
          {(search || catFilter !== 'all') && (
            <button onClick={() => { setSearch(''); setCatFilter('all') }} className="mt-2 text-orange-400 text-sm hover:underline">Clear filters</button>
          )}
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(item => (
            <MenuCard key={item.id} item={item} onEdit={handleEdit} onToggle={handleToggle} onDelete={setDeleteItem} onModifiers={setModifiersItem} />
          ))}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/50">
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Item</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Category</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Price</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Food Cost</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Margin</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Prep</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Tags</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <MenuRow key={item.id} item={item} onEdit={handleEdit} onToggle={handleToggle} onDelete={setDeleteItem} onModifiers={setModifiersItem} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {editItem !== null && (
        <ItemModal item={editItem} inventory={inventory} onClose={() => setEditItem(null)} onSave={load} />
      )}
      {deleteItem && (
        <DeleteModal item={deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} />
      )}
      {modifiersItem && (
        <ModifiersModal item={modifiersItem} onClose={() => setModifiersItem(null)} />
      )}
    </div>
  )
}
