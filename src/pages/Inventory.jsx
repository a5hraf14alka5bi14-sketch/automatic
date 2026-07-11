import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'
import { useSettings } from '../context/SettingsContext.jsx'
import { useRole, canManage } from '../utils/auth.js'
import { useToast } from '../context/ToastContext.jsx'
import { useLiveEvents, useDebouncedCallback } from '../utils/useLiveEvents.js'
import { printCountSheet } from '../utils/countSheet.js'

const CATEGORIES = ['proteins', 'vegetables', 'grains', 'legumes', 'bread', 'dairy', 'fruits', 'pantry', 'spices', 'beverages', 'general']

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

function ItemModal({ item, onClose, onSave }) {
  const isEdit = !!item?.id
  const { symbol } = useCurrency()
  const [form, setForm] = useState({
    name: item?.name || '',
    category: item?.category || 'general',
    quantity: item?.quantity || '',
    unit: item?.unit || 'kg',
    min_quantity: item?.min_quantity || '',
    cost: item?.cost || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name.trim() || form.quantity === '') { setError('Name and quantity are required'); return }
    setSaving(true); setError('')
    try {
      const url = isEdit ? `/api/inventory/${item.id}` : '/api/inventory'
      const res = await apiFetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...form,
          quantity: parseFloat(form.quantity),
          min_quantity: parseFloat(form.min_quantity || 0),
          cost: form.cost !== '' ? parseFloat(form.cost) : null
        })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onSave(); onClose()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-white font-bold">{isEdit ? 'Edit Item' : 'Add Inventory Item'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl transition-colors">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Chicken"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Unit</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                {['kg', 'g', 'L', 'mL', 'pcs', 'pack', 'box', 'bag', 'bottle', 'can'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Current Quantity *</label>
              <input type="number" step="any" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Minimum Stock</label>
              <input type="number" step="any" min="0" value={form.min_quantity} onChange={e => set('min_quantity', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">Cost per Unit ({symbol})</label>
              <input type="number" step="0.001" min="0" value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="e.g. 4.500"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
            {saving && <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AdjustModal({ item, onClose, onSave }) {
  const [mode, setMode] = useState('set')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!value) return
    setSaving(true); setError('')
    try {
      const body = mode === 'set'
        ? { quantity: parseFloat(value) }
        : { adjust: mode === 'add' ? parseFloat(value) : -parseFloat(value) }
      const res = await apiFetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onSave(); onClose()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const resultQty = () => {
    const cur = parseFloat(item.quantity)
    const v = parseFloat(value || 0)
    if (mode === 'set') return v
    if (mode === 'add') return cur + v
    return Math.max(0, cur - v)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-white font-bold">Adjust Stock — {item.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl transition-colors">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-800 rounded-xl p-3 flex items-center justify-between">
            <span className="text-slate-400 text-sm">Current stock</span>
            <span className="text-white font-bold">{item.quantity} {item.unit}</span>
          </div>
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {[['set', 'Set to'], ['add', 'Add'], ['subtract', 'Remove']].map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === m ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">
              {mode === 'set' ? 'New quantity' : mode === 'add' ? 'Amount to add' : 'Amount to remove'} ({item.unit})
            </label>
            <input type="number" step="any" min="0" value={value} onChange={e => setValue(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
              placeholder={`Enter amount in ${item.unit}`} autoFocus />
          </div>
          {value && (
            <div className="bg-slate-800 rounded-xl p-3 flex items-center justify-between">
              <span className="text-slate-400 text-sm">Result</span>
              <span className={`font-bold ${resultQty() <= parseFloat(item.min_quantity) ? 'text-red-400' : 'text-green-400'}`}>
                {resultQty().toFixed(3)} {item.unit}
              </span>
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !value}
            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? 'Saving…' : 'Update Stock'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteModal({ item, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full">
        <p className="text-white font-bold mb-2">Delete "{item.name}"?</p>
        <p className="text-slate-400 text-sm mb-4">This cannot be undone. Items used in recipes cannot be deleted.</p>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors">Cancel</button>
          <button onClick={async () => { setLoading(true); const err = await onConfirm(); if (err) { setError(err); setLoading(false) } }}
            disabled={loading}
            className="flex-1 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

const MOVEMENT_META = {
  sale:         { label: 'Sale',        icon: '🧾', tone: 'text-red-400' },
  cancellation: { label: 'Cancel restock', icon: '↩️', tone: 'text-green-400' },
  restock:      { label: 'Restock',     icon: '📥', tone: 'text-green-400' },
  adjustment:   { label: 'Adjustment',  icon: '⚖️', tone: 'text-blue-400' },
  manual_edit:  { label: 'Manual edit', icon: '✏️', tone: 'text-blue-400' },
  initial:      { label: 'Initial',     icon: '🆕', tone: 'text-slate-400' },
}

function fmtWhen(ts) {
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StockMovementsView() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    apiFetch('/api/inventory/movements?limit=200')
      .then(r => { if (!r.ok) throw new Error('Failed to load stock movements'); return r.json() })
      .then(d => { if (alive) setRows(d) })
      .catch(e => { if (alive) setErr(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (loading) return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-12" />)}
    </div>
  )
  if (err) return <div className="text-sm px-4 py-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">{err}</div>
  if (rows.length === 0) return (
    <div className="text-center py-20">
      <p className="text-4xl mb-3">📋</p>
      <p className="text-slate-400 text-sm">No stock movements yet</p>
      <p className="text-slate-500 text-xs mt-1">Movements are logged automatically on sales, adjustments and edits.</p>
    </div>
  )

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-800/50">
            <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">When</th>
            <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Item</th>
            <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Type</th>
            <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Change</th>
            <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Stock After</th>
            <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Reference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(m => {
            const meta = MOVEMENT_META[m.movement_type] || { label: m.movement_type, icon: '•', tone: 'text-slate-400' }
            const change = parseFloat(m.change)
            const positive = change > 0
            return (
              <tr key={m.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 text-slate-400 text-sm whitespace-nowrap">{fmtWhen(m.created_at)}</td>
                <td className="px-4 py-3 text-white text-sm font-medium">{m.item_name || '—'}</td>
                <td className="px-4 py-3 text-sm"><span className={meta.tone}>{meta.icon} {meta.label}</span></td>
                <td className={`px-4 py-3 text-right text-sm font-semibold ${positive ? 'text-green-400' : 'text-red-400'}`}>
                  {positive ? '+' : ''}{change} {m.unit || ''}
                </td>
                <td className="px-4 py-3 text-right text-slate-300 text-sm">{m.quantity_after != null ? `${parseFloat(m.quantity_after)} ${m.unit || ''}` : '—'}</td>
                <td className="px-4 py-3 text-slate-500 text-sm">
                  {m.reference_type === 'order' && m.reference_id ? `Order #${m.reference_id}` : (m.note || m.reference_type || '—')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StocktakeView() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [counts, setCounts] = useState({})
  const [minEdits, setMinEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [uncountedOnly, setUncountedOnly] = useState(false)

  useEffect(() => {
    apiFetch('/api/inventory')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { toast('Failed to load inventory', 'error'); setLoading(false) })
  }, [toast])

  const categories = [...new Set(items.map(i => i.category))].sort()
  const uncountedTotal = items.filter(i => !i.last_counted_at).length

  const visible = items.filter(item => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
    if (uncountedOnly && item.last_counted_at) return false
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // A row is a "change" when a count was entered that differs from system
  // stock, when a never-counted item's placeholder is confirmed as correct,
  // or when the low-stock threshold was edited.
  const rowChange = (item) => {
    const v = counts[item.id]
    const m = minEdits[item.id]
    const qtyEntered = v !== undefined && v !== '' && !isNaN(parseFloat(v))
    const qtyChanged = qtyEntered && (parseFloat(v) !== parseFloat(item.quantity) || !item.last_counted_at)
    const minChanged = m !== undefined && m !== '' && !isNaN(parseFloat(m)) && parseFloat(m) !== parseFloat(item.min_quantity)
    return { qtyChanged, minChanged, any: qtyChanged || minChanged }
  }
  const changes = items.filter(item => rowChange(item).any)

  const handleApply = async () => {
    if (changes.length === 0) return
    setApplying(true)
    try {
      const payload = changes.map(item => {
        const { qtyChanged, minChanged } = rowChange(item)
        const entry = { id: item.id }
        if (qtyChanged) entry.quantity = parseFloat(counts[item.id])
        if (minChanged) entry.min_quantity = parseFloat(minEdits[item.id])
        return entry
      })
      const res = await apiFetch('/api/inventory/bulk-stocktake', {
        method: 'PATCH',
        body: JSON.stringify({ items: payload })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      toast(`Stocktake applied — ${d.updated} item(s) updated`, 'success')
      const fresh = await apiFetch('/api/inventory').then(r => r.json())
      setItems(Array.isArray(fresh) ? fresh : [])
      setCounts({})
      setMinEdits({})
    } catch (err) {
      toast(err.message || 'Stocktake failed', 'error')
    }
    setApplying(false)
  }

  if (loading) return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-14 animate-pulse" />)}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <p className="text-white font-semibold">Physical Stock Count</p>
          <p className="text-slate-400 text-sm">Enter actual counted quantities and low-stock thresholds — only changed items will be updated.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const ok = printCountSheet(visible)
              if (!ok) toast('Pop-up blocked — allow pop-ups to print the count sheet', 'error')
            }}
            disabled={visible.length === 0}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-200 text-sm font-medium rounded-xl transition-colors"
            title="Print a branded count sheet for the currently filtered items">
            🖨 Print count sheet
          </button>
          {changes.length > 0 && (
            <button onClick={handleApply} disabled={applying}
              className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
              {applying && <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
              Apply {changes.length} Change{changes.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {uncountedTotal > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-2 text-sm" role="status">
          <span className="text-amber-400 font-medium">
            {uncountedTotal} item{uncountedTotal !== 1 ? 's have' : ' has'} never been counted — the stock shown is an estimate, not a real count.
          </span>
          <span className="text-slate-400">
            Count them and enter the true quantity (re-enter the same number if it happens to be correct).
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search items…" aria-label="Search items"
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500 w-44"
        />
        <select
          value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500 capitalize">
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
        </select>
        <button
          onClick={() => setUncountedOnly(v => !v)}
          aria-pressed={uncountedOnly}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${uncountedOnly
            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`}>
          Never counted{uncountedTotal > 0 ? ` (${uncountedTotal})` : ''}
        </button>
        <span className="text-slate-500 text-xs ml-auto">{visible.length} of {items.length} items</span>
      </div>

      {changes.length > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
          <span className="text-orange-400 text-sm font-medium">Changes to apply:</span>
          {changes.map(item => {
            const { qtyChanged, minChanged } = rowChange(item)
            return (
              <span key={item.id} className="bg-orange-500/20 text-orange-300 text-xs px-2.5 py-1 rounded-full">
                {item.name}:{' '}
                {qtyChanged && `${parseFloat(item.quantity)} → ${parseFloat(counts[item.id])} ${item.unit}`}
                {qtyChanged && minChanged && ' · '}
                {minChanged && `min ${parseFloat(item.min_quantity)} → ${parseFloat(minEdits[item.id])}`}
              </span>
            )
          })}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/50">
              <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Item</th>
              <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Category</th>
              <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Last Counted</th>
              <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">System Stock</th>
              <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Actual Count</th>
              <th className="text-center py-3 px-4 text-slate-400 text-xs font-medium">Difference</th>
              <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Low-Stock Threshold</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(item => {
              const sysQty = parseFloat(item.quantity)
              const counted = counts[item.id] !== undefined ? counts[item.id] : ''
              const countedNum = counted !== '' ? parseFloat(counted) : null
              const diff = countedNum !== null ? countedNum - sysQty : null
              const minVal = minEdits[item.id] !== undefined ? minEdits[item.id] : ''
              const { any: changed } = rowChange(item)
              return (
                <tr key={item.id} className={`border-b border-slate-800/50 last:border-0 transition-colors ${changed ? 'bg-orange-500/5' : 'hover:bg-slate-800/20'}`}>
                  <td className="px-4 py-3 text-white text-sm font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm capitalize">{item.category}</td>
                  <td className="px-4 py-3 text-sm">
                    {item.last_counted_at ? (
                      <span className="text-slate-400">{new Date(item.last_counted_at).toLocaleDateString()}</span>
                    ) : (
                      <span className="bg-amber-500/15 text-amber-400 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap">Never counted</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300 text-sm">{sysQty} {item.unit}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <input
                        type="number" step="any" min="0"
                        value={counted}
                        onChange={e => setCounts(c => ({ ...c, [item.id]: e.target.value }))}
                        placeholder={String(sysQty)}
                        aria-label={`Actual count for ${item.name}`}
                        className={`w-24 bg-slate-800 border rounded-lg px-2 py-1 text-white text-sm text-right focus:outline-none transition-colors ${changed ? 'border-orange-500' : 'border-slate-700 focus:border-orange-500'}`}
                      />
                      <span className="text-slate-500 text-xs">{item.unit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {diff !== null && diff !== 0 ? (
                      <span className={`text-sm font-semibold ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(3)}
                      </span>
                    ) : diff === 0 ? (
                      <span className="text-slate-500 text-xs">{item.last_counted_at ? '—' : 'confirm'}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <input
                        type="number" step="any" min="0"
                        value={minVal}
                        onChange={e => setMinEdits(m => ({ ...m, [item.id]: e.target.value }))}
                        placeholder={String(parseFloat(item.min_quantity))}
                        aria-label={`Low-stock threshold for ${item.name}`}
                        className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-orange-500 transition-colors"
                      />
                      <span className="text-slate-500 text-xs">{item.unit}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">No items match the current filters.</p>
        )}
      </div>
    </div>
  )
}

function ImpactView() {
  const toast = useToast()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    apiFetch('/api/inventory/impact')
      .then(r => {
        if (r.status === 403) { setDenied(true); setLoading(false); return null }
        return r.ok ? r.json() : Promise.reject()
      })
      .then(d => { if (d !== null) { setData(Array.isArray(d) ? d : []); setLoading(false) } })
      .catch(() => { toast('Failed to load impact data', 'error'); setLoading(false) })
  }, [toast])

  if (loading) return (
    <div className="space-y-2">
      {[...Array(4)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-20 animate-pulse" />)}
    </div>
  )

  if (denied) return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6" role="alert">
      <p className="text-5xl mb-4">🔒</p>
      <h3 className="text-white font-bold text-lg mb-2">Access restricted</h3>
      <p className="text-slate-400 text-sm max-w-sm">
        Menu impact data is only available to admins and managers.
        Ask a manager if you need this information.
      </p>
    </div>
  )

  if (data.length === 0) return (
    <div className="text-center py-20">
      <p className="text-4xl mb-3">✅</p>
      <p className="text-white font-semibold text-lg mb-1">No Impact Alerts</p>
      <p className="text-slate-400 text-sm">All low-stock items are not linked to any active menu dishes.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-3 mb-4">
        <span className="text-xl">⚠️</span>
        <div>
          <p className="text-red-400 font-semibold text-sm">{data.length} low-stock ingredient{data.length !== 1 ? 's' : ''} affecting active menu dishes</p>
          <p className="text-slate-400 text-xs">Restock these items to avoid menu disruption</p>
        </div>
      </div>
      {data.map(inv => (
        <div key={inv.id} className="bg-slate-900 border border-red-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-white font-semibold">{inv.item_name}</p>
              <p className="text-red-400 text-sm">
                {parseFloat(inv.quantity)} {inv.unit} in stock
                <span className="text-slate-500 ml-2">(min: {parseFloat(inv.min_quantity)} {inv.unit})</span>
              </p>
            </div>
            <span className="bg-red-500/10 text-red-400 text-xs border border-red-500/30 px-2.5 py-1 rounded-full">
              {parseFloat(inv.quantity) === 0 ? '🚫 Empty' : '⚠️ Low Stock'}
            </span>
          </div>
          <p className="text-slate-400 text-xs mb-2 font-medium uppercase tracking-wide">Affects {inv.affected_dishes.length} dish{inv.affected_dishes.length !== 1 ? 'es' : ''}:</p>
          <div className="flex flex-wrap gap-2">
            {inv.affected_dishes.map(dish => (
              <span key={dish.menu_item_id} className="bg-slate-800 border border-slate-700 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                <span>🍽️</span>
                <span>{dish.menu_item_name}{dish.menu_item_name_ar ? <span className="text-slate-500" dir="rtl"> · {dish.menu_item_name_ar}</span> : null}</span>
                <span className="text-slate-500">({dish.required_qty} {dish.required_unit})</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Inventory() {
  const { fmt } = useCurrency()
  const toast = useToast()
  const isManager = canManage(useRole())
  const { refreshLowStock } = useSettings()
  const [view, setView] = useState('items')
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [editItem, setEditItem] = useState(null)
  const [adjustItem, setAdjustItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)

  const load = useCallback(async () => {
    try {
      const [itemsRes, statsRes] = await Promise.all([
        apiFetch('/api/inventory'),
        apiFetch('/api/inventory/stats'),
      ])
      if (!itemsRes.ok) throw new Error('Failed to load inventory')
      const itemsData = await itemsRes.json()
      setItems(Array.isArray(itemsData) ? itemsData : [])
      // Stats are admin/manager-only (403 for cashier) — hide cards instead of failing the page.
      if (statsRes.ok) {
        setStats(await statsRes.json())
      } else {
        setStats(null)
        if (statsRes.status !== 403) toast('Failed to load inventory stats.', 'error')
      }
      refreshLowStock()
    } catch (e) { toast('Failed to load inventory data. Please refresh.', 'error') }
    setLoading(false)
  }, [refreshLowStock, toast])

  useEffect(() => { load() }, [load])

  // Live refresh: stock deductions from completed orders, stocktakes and
  // manual edits made elsewhere appear here instantly.
  const liveRefresh = useDebouncedCallback(load, 800)
  useLiveEvents(liveRefresh, ['inventory_updated', 'order_updated', 'low_stock'])

  const handleDelete = async () => {
    const res = await apiFetch(`/api/inventory/${deleteItem.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      return data.error
    }
    setDeleteItem(null); load(); return null
  }

  const lowStock = items.filter(i => parseFloat(i.quantity) <= parseFloat(i.min_quantity))
  const categories = ['all', ...new Set(items.map(i => i.category).filter(Boolean))]

  const filtered = items.filter(item => {
    if (catFilter !== 'all' && item.category !== catFilter) return false
    if (search) return item.name.toLowerCase().includes(search.toLowerCase()) || (item.category || '').toLowerCase().includes(search.toLowerCase())
    return true
  })

  return (
    <div className="p-4 sm:p-6 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-slate-400 text-sm mt-0.5">Track ingredients and stock levels</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-0.5 overflow-x-auto">
            {[['items','Items'],['movements','Movements'],['stocktake','Stocktake'],['impact','Impact']].map(([id,label]) => (
              <button key={id} onClick={() => setView(id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === id ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          {view === 'items' && isManager && (
            <button onClick={() => setEditItem({})}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-orange-500/20">
              + Add Item
            </button>
          )}
        </div>
      </div>

      {view === 'movements' ? <StockMovementsView /> :
       view === 'stocktake' ? <StocktakeView /> :
       view === 'impact' ? <ImpactView /> : (
      <>
      {/* items view */}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Items" value={stats.total} />
          <StatCard label="Low Stock" value={stats.low_stock} color={parseInt(stats.low_stock) > 0 ? 'text-red-400' : 'text-green-400'} sub={parseInt(stats.low_stock) > 0 ? 'Need attention' : 'All healthy'} />
          <StatCard label="Categories" value={stats.categories} />
          <StatCard label="Total Value" value={fmt(stats.total_value)} color="text-orange-400" />
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-5 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-red-400 font-semibold text-sm mb-2">Low Stock — {lowStock.length} item{lowStock.length > 1 ? 's' : ''} need restocking</p>
            <div className="flex flex-wrap gap-2">
              {lowStock.map(item => (
                isManager ? (
                  <button key={item.id} onClick={() => setAdjustItem(item)}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs px-2.5 py-1 rounded-full transition-colors">
                    {item.name} — {item.quantity} {item.unit}
                  </button>
                ) : (
                  <span key={item.id} className="bg-red-500/20 text-red-300 text-xs px-2.5 py-1 rounded-full">
                    {item.name} — {item.quantity} {item.unit}
                  </span>
                )
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {categories.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${catFilter === cat ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              {cat}
            </button>
          ))}
        </div>
        <span className="text-slate-500 text-sm ml-auto">{filtered.length} items</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-14" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-slate-400 text-sm">No items found</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/50">
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Item</th>
                <th className="text-left py-3 px-4 text-slate-400 text-xs font-medium">Category</th>
                <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">In Stock</th>
                <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Minimum</th>
                {isManager && <>
                  <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Cost/unit</th>
                  <th className="text-right py-3 px-4 text-slate-400 text-xs font-medium">Total Value</th>
                </>}
                <th className="text-center py-3 px-4 text-slate-400 text-xs font-medium">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const qty = parseFloat(item.quantity)
                const min = parseFloat(item.min_quantity)
                const cost = parseFloat(item.cost || 0)
                const isLow = qty <= min
                const isEmpty = qty === 0
                const totalVal = qty * cost
                const pct = min > 0 ? Math.min(100, Math.round((qty / min) * 100)) : 100

                return (
                  <tr key={item.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors group">
                    <td className="px-4 py-3">
                      <p className="text-white text-sm font-medium">{item.name}</p>
                      <div className="w-20 bg-slate-800 rounded-full h-1 mt-1">
                        <div className={`h-1 rounded-full ${isEmpty ? 'bg-red-500' : isLow ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm capitalize">{item.category}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold text-sm ${isEmpty ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-white'}`}>
                        {qty} {item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 text-sm">{item.min_quantity} {item.unit}</td>
                    {isManager && <>
                      <td className="px-4 py-3 text-right text-slate-400 text-sm">{cost > 0 ? fmt(cost) : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-400 text-sm">{totalVal > 0 ? fmt(totalVal) : '—'}</td>
                    </>}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${isEmpty ? 'bg-red-500/10 text-red-400 border-red-500/30' : isLow ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-green-500/10 text-green-400 border-green-500/30'}`}>
                        {isEmpty ? '🚫 Empty' : isLow ? '⚠️ Low' : '✓ OK'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        {isManager && <>
                          <button onClick={() => setAdjustItem(item)} className="text-slate-400 hover:text-blue-400 transition-colors text-sm" title="Adjust stock">⚖️</button>
                          <button onClick={() => setEditItem(item)} className="text-slate-400 hover:text-orange-400 transition-colors text-sm" title="Edit">✏️</button>
                          <button onClick={() => setDeleteItem(item)} className="text-slate-400 hover:text-red-400 transition-colors text-sm" title="Delete">🗑️</button>
                        </>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {editItem !== null && <ItemModal item={editItem} onClose={() => setEditItem(null)} onSave={load} />}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSave={load} />}
      {deleteItem && <DeleteModal item={deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} />}
    </div>
  )
}
