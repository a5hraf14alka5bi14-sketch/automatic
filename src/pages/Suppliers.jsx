import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { useToast } from '../context/ToastContext.jsx'
import { useRole, canManage } from '../utils/auth.js'

const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'box', 'bag']
const STATUS_COLORS = {
  draft: 'bg-slate-700 text-slate-300',
  ordered: 'bg-blue-500/20 text-blue-300',
  partially_received: 'bg-amber-500/20 text-amber-300',
  received: 'bg-green-500/20 text-green-300',
  cancelled: 'bg-red-500/20 text-red-400',
}
const STATUS_LABELS = {
  draft: 'Draft',
  ordered: 'Ordered',
  partially_received: 'Partial',
  received: 'Received',
  cancelled: 'Cancelled',
}

function ReceivePOModal({ po, onReceived, onClose }) {
  const showToast = useToast()
  const [saving, setSaving] = useState(false)

  // Build per-item state: qty to receive in this transaction (defaults to remaining)
  const [qtys, setQtys] = useState(() => {
    const map = {}
    for (const item of po.items || []) {
      const received = parseFloat(item.received_qty || 0)
      const remaining = Math.max(parseFloat(item.quantity) - received, 0)
      map[item.id] = remaining > 0 ? String(remaining) : '0'
    }
    return map
  })

  const setAll = (full) => {
    const map = {}
    for (const item of po.items || []) {
      const received = parseFloat(item.received_qty || 0)
      const remaining = Math.max(parseFloat(item.quantity) - received, 0)
      map[item.id] = full ? String(remaining) : '0'
    }
    setQtys(map)
  }

  const submit = async () => {
    setSaving(true)
    try {
      const quantities = {}
      for (const [id, val] of Object.entries(qtys)) {
        quantities[Number(id)] = Math.max(parseFloat(val) || 0, 0)
      }
      const res = await apiFetch(`/api/suppliers/purchase-orders/${po.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({ quantities }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')

      const msgs = []
      if (d.items_restocked > 0) msgs.push(`${d.items_restocked} item(s) restocked`)
      if (d.items_skipped?.length > 0) msgs.push(`⚠️ ${d.items_skipped.length} skipped (no inventory link): ${d.items_skipped.join(', ')}`)
      if (d.items_deferred?.length > 0) msgs.push(`${d.items_deferred.length} deferred to later`)

      const isPartial = d.status === 'partially_received'
      showToast(
        msgs.join(' · ') || (isPartial ? 'Partially received' : 'Fully received'),
        d.items_skipped?.length > 0 ? 'warning' : 'success',
        d.items_skipped?.length > 0 ? 10000 : 4000
      )
      onReceived(po.id, d.status)
      onClose()
    } catch (err) { showToast(err.message, 'error') }
    setSaving(false)
  }

  const items = (po.items || []).map(item => ({
    ...item,
    _received: parseFloat(item.received_qty || 0),
    _remaining: Math.max(parseFloat(item.quantity) - parseFloat(item.received_qty || 0), 0),
  }))

  const anyRemaining = items.some(i => i._remaining > 0)

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold">Receive PO #{po.id}</h2>
            <p className="text-slate-400 text-xs mt-0.5">Enter quantities actually delivered</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex gap-2 px-5 pt-3 flex-shrink-0">
          <button onClick={() => setAll(true)}
            className="text-xs px-3 py-1.5 bg-green-500/15 text-green-300 hover:bg-green-500/25 rounded-lg transition-colors">
            Receive All Remaining
          </button>
          <button onClick={() => setAll(false)}
            className="text-xs px-3 py-1.5 bg-slate-800 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors">
            Clear All
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {items.map(item => (
            <div key={item.id} className={`rounded-xl border p-3 space-y-2 ${item._remaining <= 0 ? 'border-slate-800 opacity-50' : 'border-slate-700'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{item.item_name}</p>
                  {!item.inventory_id && (
                    <p className="text-amber-400 text-xs">⚠ No inventory link — won't update stock</p>
                  )}
                </div>
                <div className="text-right text-xs text-slate-400 flex-shrink-0">
                  <div>Ordered: <span className="text-slate-300">{parseFloat(item.quantity)} {item.unit}</span></div>
                  {item._received > 0 && (
                    <div>Already received: <span className="text-green-400">{item._received} {item.unit}</span></div>
                  )}
                  <div>Remaining: <span className={item._remaining > 0 ? 'text-amber-300' : 'text-green-400'}>
                    {item._remaining} {item.unit}
                  </span></div>
                </div>
              </div>
              {item._remaining > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-slate-400 text-xs w-28 flex-shrink-0">Receiving now ({item.unit}):</label>
                    <input
                      type="number" min="0" max={item._remaining} step="0.001"
                      value={qtys[item.id] ?? ''}
                      onChange={e => setQtys(q => ({ ...q, [item.id]: e.target.value }))}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  {item.entered_in_purchase_unit && item.inventory_id && parseFloat(qtys[item.id]) > 0 && item.conversion_factor > 0 && (
                    <p className="text-green-400 text-xs" style={{paddingLeft:'7.5rem'}}>
                      📦 {parseFloat(qtys[item.id]).toFixed(3)} {item.unit} × {parseFloat(item.conversion_factor)} = <strong>{(parseFloat(qtys[item.id]) * parseFloat(item.conversion_factor)).toFixed(3)}</strong> base units added to stock
                    </p>
                  )}
                  {item.entered_in_purchase_unit && item.inventory_id && parseFloat(qtys[item.id]) > 0 && !(item.conversion_factor > 0) && (
                    <p className="text-amber-400 text-xs" style={{paddingLeft:'7.5rem'}}>
                      ⚠ Purchase-unit flag set but no conversion factor found — receiving raw qty
                    </p>
                  )}
                </div>
              )}
              {item._remaining <= 0 && (
                <p className="text-green-400 text-xs">✓ Fully received</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-800 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving || !anyRemaining}
            className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {saving ? 'Saving…' : 'Confirm Receipt'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SupplierModal({ supplier, onSave, onClose }) {
  const [form, setForm] = useState({
    name: supplier?.name || '',
    contact_name: supplier?.contact_name || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || '',
    notes: supplier?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const showToast = useToast()
  const F = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.name.trim()) return showToast('Name is required', 'error')
    setSaving(true)
    try {
      const method = supplier ? 'PATCH' : 'POST'
      const url = supplier ? `/api/suppliers/${supplier.id}` : '/api/suppliers'
      const res = await apiFetch(url, { method, body: JSON.stringify(form) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      showToast(supplier ? 'Supplier updated' : 'Supplier created', 'success')
      onSave(d)
    } catch (err) { showToast(err.message, 'error') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-white font-bold">{supplier ? 'Edit Supplier' : 'New Supplier'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {[
            { k: 'name', label: 'Company Name *', placeholder: 'e.g. Fresh Farms Co.' },
            { k: 'contact_name', label: 'Contact Name', placeholder: 'Mohammed Al-Rashidi' },
            { k: 'phone', label: 'Phone', placeholder: '+968 9XXX XXXX' },
            { k: 'email', label: 'Email', placeholder: 'contact@supplier.com' },
            { k: 'address', label: 'Address', placeholder: 'Muscat, Oman' },
            { k: 'notes', label: 'Notes', placeholder: 'Payment terms, delivery schedule…' },
          ].map(({ k, label, placeholder }) => (
            <div key={k}>
              <label className="block text-slate-400 text-xs mb-1">{label}</label>
              {k === 'notes' ? (
                <textarea value={form[k]} onChange={F(k)} placeholder={placeholder} rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-orange-500" />
              ) : (
                <input value={form[k]} onChange={F(k)} placeholder={placeholder}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

const BLANK_ITEM = { inventory_id: '', item_name: '', quantity: '', unit: 'kg', unit_cost: '', vat_inclusive: false, vat_rate: '5', entered_in_purchase_unit: false }

function lineNetCost(item) {
  const qty = parseFloat(item.quantity) || 0
  const cost = parseFloat(item.unit_cost) || 0
  const rate = parseFloat(item.vat_rate) || 0
  if (item.vat_inclusive) return qty * cost / (1 + rate / 100)
  return qty * cost
}
function lineVat(item) {
  const qty = parseFloat(item.quantity) || 0
  const cost = parseFloat(item.unit_cost) || 0
  const rate = parseFloat(item.vat_rate) || 0
  if (item.vat_inclusive) return qty * cost - lineNetCost(item)
  return qty * cost * rate / 100
}
function lineGross(item) { return lineNetCost(item) + lineVat(item) }

function POModal({ suppliers, inventory, onSave, onClose }) {
  const showToast = useToast()
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ ...BLANK_ITEM }])
  const [saving, setSaving] = useState(false)

  const addItem = () => setItems(i => [...i, { ...BLANK_ITEM }])
  const removeItem = (idx) => setItems(i => i.filter((_, ii) => ii !== idx))
  const updateItem = (idx, k, v) => setItems(i => i.map((it, ii) => ii === idx ? { ...it, [k]: v } : it))

  const pickInventory = (idx, invId) => {
    const inv = inventory.find(i => i.id === parseInt(invId))
    setItems(prev => prev.map((it, ii) => {
      if (ii !== idx) return it
      const updates = { ...it, inventory_id: invId }
      if (inv) {
        updates.item_name = inv.name
        // If item has a purchase unit, auto-switch to it
        if (inv.purchase_unit) {
          updates.unit = inv.purchase_unit
          updates.entered_in_purchase_unit = true
        } else {
          updates.unit = inv.unit || it.unit
          updates.entered_in_purchase_unit = false
        }
      }
      return updates
    }))
  }

  const totals = items.reduce((s, i) => ({
    net: s.net + lineNetCost(i),
    vat: s.vat + lineVat(i),
    gross: s.gross + lineGross(i),
  }), { net: 0, vat: 0, gross: 0 })

  const save = async () => {
    const validItems = items.filter(i => i.item_name.trim() && parseFloat(i.quantity) > 0)
    if (!validItems.length) return showToast('Add at least one item', 'error')
    setSaving(true)
    try {
      const payload = validItems.map(i => ({
        inventory_id: i.inventory_id || null,
        item_name: i.item_name,
        quantity: parseFloat(i.quantity),
        unit: i.unit || 'kg',
        unit_cost: parseFloat(i.unit_cost) || 0,
        vat_inclusive: i.vat_inclusive,
        vat_rate: parseFloat(i.vat_rate) || 5,
        entered_in_purchase_unit: i.entered_in_purchase_unit,
      }))
      const res = await apiFetch('/api/suppliers/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({ supplier_id: supplierId || null, notes, items: payload })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      showToast('Purchase order created', 'success')
      onSave(d)
    } catch (err) { showToast(err.message, 'error') }
    setSaving(false)
  }

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500'

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-white font-bold">New Purchase Order</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1">Supplier</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                <option value="">— No supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Delivery instructions…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-300 text-sm font-medium">Items</h3>
              <button onClick={addItem} className="text-orange-400 hover:text-orange-300 text-xs">+ Add Row</button>
            </div>

            {items.map((item, idx) => {
              const inv = inventory.find(i => i.id === parseInt(item.inventory_id))
              const hasPack = inv?.purchase_unit && inv?.units_per_purchase_unit
              const vat = lineVat(item)
              const net = lineNetCost(item)
              return (
                <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 space-y-2">
                  {/* Row 1: item selector + name + remove */}
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <select value={item.inventory_id} onChange={e => pickInventory(idx, e.target.value)}
                        className={inputCls}>
                        <option value="">— Inventory item —</option>
                        {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-6">
                      <input value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)}
                        placeholder="Item name" className={inputCls} />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {items.length > 1 && (
                        <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 text-sm">✕</button>
                      )}
                    </div>
                  </div>

                  {/* Row 2: qty + unit + cost/unit + VAT toggle */}
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-2">
                      <label className="text-slate-500 text-xs block mb-0.5">Qty</label>
                      <input type="number" min="0" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        placeholder="0" className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-slate-500 text-xs block mb-0.5">Unit</label>
                      <input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                        placeholder="kg" className={inputCls} />
                    </div>
                    <div className="col-span-3">
                      <label className="text-slate-500 text-xs block mb-0.5">Cost / {item.unit || 'unit'}</label>
                      <input type="number" min="0" step="0.001" value={item.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value)}
                        placeholder="0.000" className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-slate-500 text-xs block mb-0.5">VAT %</label>
                      <input type="number" min="0" max="100" step="0.5" value={item.vat_rate} onChange={e => updateItem(idx, 'vat_rate', e.target.value)}
                        className={inputCls} />
                    </div>
                    <div className="col-span-3 flex flex-col gap-1">
                      <label className="text-slate-500 text-xs">VAT type</label>
                      <button
                        onClick={() => updateItem(idx, 'vat_inclusive', !item.vat_inclusive)}
                        className={`text-xs px-2 py-1 rounded-md border transition-colors ${item.vat_inclusive ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
                        {item.vat_inclusive ? 'Inc. VAT' : 'Exc. VAT'}
                      </button>
                    </div>
                  </div>

                  {/* Pack size hint */}
                  {hasPack && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateItem(idx, 'entered_in_purchase_unit', !item.entered_in_purchase_unit)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${item.entered_in_purchase_unit ? 'bg-green-500/20 border-green-500/40 text-green-300' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
                        {item.entered_in_purchase_unit ? `📦 Qty in ${inv.purchase_unit}s` : `📦 Qty in ${inv.unit}s`}
                      </button>
                      {item.entered_in_purchase_unit && parseFloat(item.quantity) > 0 && (
                        <span className="text-green-400 text-xs">
                          → {(parseFloat(item.quantity) * parseFloat(inv.units_per_purchase_unit)).toFixed(3)} {inv.unit} added to stock
                        </span>
                      )}
                      {!item.entered_in_purchase_unit && (
                        <span className="text-slate-500 text-xs">1 {inv.purchase_unit} = {inv.units_per_purchase_unit} {inv.unit}</span>
                      )}
                    </div>
                  )}

                  {/* Line totals */}
                  {parseFloat(item.quantity) > 0 && parseFloat(item.unit_cost) >= 0 && (
                    <div className="flex items-center gap-4 text-xs pt-1 border-t border-slate-700">
                      <span className="text-slate-400">Net: <span className="text-slate-300">{net.toFixed(3)} OMR</span></span>
                      <span className="text-slate-400">VAT: <span className="text-blue-300">{vat.toFixed(3)} OMR</span></span>
                      <span className="text-slate-400">Gross: <span className="text-white font-medium">{lineGross(item).toFixed(3)} OMR</span></span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* PO Totals */}
          <div className="bg-slate-800 rounded-xl p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Net Total (ex-VAT)</span>
              <span className="text-slate-300">{totals.net.toFixed(3)} OMR</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Input VAT</span>
              <span className="text-blue-300">{totals.vat.toFixed(3)} OMR</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-slate-700 pt-1.5">
              <span className="text-slate-300">Gross Total</span>
              <span className="text-white">{totals.gross.toFixed(3)} OMR</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {saving ? 'Creating…' : 'Create PO'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Suppliers() {
  const role = useRole()
  const showToast = useToast()
  const [tab, setTab] = useState('suppliers')
  const [suppliers, setSuppliers] = useState([])
  const [pos, setPos] = useState([])
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [supplierModal, setSupplierModal] = useState(null) // null | {} | supplier obj
  const [poModal, setPoModal] = useState(false)
  const [receiveModal, setReceiveModal] = useState(null)  // null | po object

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, poRes, invRes] = await Promise.all([
        apiFetch('/api/suppliers'),
        apiFetch('/api/suppliers/purchase-orders'),
        apiFetch('/api/inventory'),
      ])
      const [s, p, inv] = await Promise.all([sRes.json(), poRes.json(), invRes.json()])
      setSuppliers(Array.isArray(s) ? s : [])
      setPos(Array.isArray(p) ? p : [])
      setInventory(Array.isArray(inv) ? inv : [])
    } catch { showToast('Failed to load suppliers', 'error') }
    setLoading(false)
  }, [showToast])

  useEffect(() => { load() }, [load])

  const updatePOStatus = async (id, status) => {
    try {
      const res = await apiFetch(`/api/suppliers/purchase-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setPos(p => p.map(po => po.id === id ? { ...po, status } : po))
      showToast(`PO marked as ${status}`, 'success')
    } catch (err) { showToast(err.message, 'error') }
  }

  // Open the partial-receive modal for a PO (works for both 'ordered' and 'partially_received')
  const openReceiveModal = (po) => setReceiveModal(po)

  // Called by ReceivePOModal after a successful receive call
  const handleReceived = (id, newStatus) => {
    setPos(p => p.map(po => po.id === id ? { ...po, status: newStatus } : po))
    load() // reload to get updated received_qty on items
  }

  const deleteSupplier = async (id) => {
    if (!confirm('Deactivate this supplier?')) return
    try {
      await apiFetch(`/api/suppliers/${id}`, { method: 'DELETE' })
      setSuppliers(s => s.filter(x => x.id !== id))
      showToast('Supplier deactivated', 'success')
    } catch { showToast('Failed', 'error') }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Suppliers & Purchase Orders</h1>
          <p className="text-slate-400 text-sm mt-0.5">الموردون وأوامر الشراء</p>
        </div>
        <div className="flex gap-2">
          {canManage(role) && (
            <>
              <button onClick={() => setSupplierModal({})}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded-xl border border-slate-700 transition-colors">
                + Supplier
              </button>
              <button onClick={() => setPoModal(true)}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-xl font-medium transition-colors">
                + Purchase Order
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl w-fit border border-slate-800">
        {[{ id: 'suppliers', label: `Suppliers (${suppliers.length})` }, { id: 'pos', label: `Purchase Orders (${pos.length})` }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading…</div>
      ) : tab === 'suppliers' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.length === 0 ? (
            <div className="col-span-3 text-center py-16 text-slate-500">No suppliers yet — add one to get started</div>
          ) : suppliers.map(s => (
            <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between">
                <h3 className="text-white font-semibold">{s.name}</h3>
                {canManage(role) && (
                  <div className="flex gap-1">
                    <button onClick={() => setSupplierModal(s)}
                      className="text-slate-500 hover:text-orange-400 transition-colors p-1 text-xs">✏</button>
                    {role === 'admin' && (
                      <button onClick={() => deleteSupplier(s.id)}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1 text-xs">🗑</button>
                    )}
                  </div>
                )}
              </div>
              {s.contact_name && <p className="text-slate-400 text-sm">👤 {s.contact_name}</p>}
              {s.phone && <p className="text-slate-400 text-sm">📞 {s.phone}</p>}
              {s.email && <p className="text-slate-400 text-sm">✉ {s.email}</p>}
              {s.address && <p className="text-slate-500 text-xs">{s.address}</p>}
              {s.notes && <p className="text-slate-500 text-xs italic">{s.notes}</p>}
              <p className="text-slate-600 text-xs">Since {new Date(s.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {pos.length === 0 ? (
            <div className="text-center py-16 text-slate-500">No purchase orders yet</div>
          ) : pos.map(po => (
            <div key={po.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-white font-semibold">PO #{po.id}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[po.status] || 'bg-slate-700 text-slate-300'}`}>
                    {STATUS_LABELS[po.status] || po.status}
                  </span>
                  {po.supplier_name && <span className="text-slate-400 text-sm">{po.supplier_name}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-orange-400 font-bold">{parseFloat(po.total || 0).toFixed(3)} OMR</span>
                  {canManage(role) && po.status === 'draft' && (
                    <button onClick={() => updatePOStatus(po.id, 'ordered')}
                      className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 rounded-lg transition-colors">
                      Mark Ordered
                    </button>
                  )}
                  {canManage(role) && (po.status === 'ordered' || po.status === 'partially_received') && (
                    <button onClick={() => openReceiveModal(po)}
                      className={`text-xs px-2 py-1 rounded-lg transition-colors ${po.status === 'partially_received' ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'}`}>
                      {po.status === 'partially_received' ? '↓ Receive More' : '✓ Receive'}
                    </button>
                  )}
                  {canManage(role) && ['draft','ordered'].includes(po.status) && (
                    <button onClick={() => updatePOStatus(po.id, 'cancelled')}
                      className="text-xs px-2 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-500">
                <span>Created: {new Date(po.created_at).toLocaleDateString()}</span>
                {po.ordered_at && <span>Ordered: {new Date(po.ordered_at).toLocaleDateString()}</span>}
                {po.received_at && <span>Received: {new Date(po.received_at).toLocaleDateString()}</span>}
                <span>{Array.isArray(po.items) ? po.items.length : 0} item(s)</span>
              </div>
              {Array.isArray(po.items) && po.items.length > 0 && (
                <details className="mt-3">
                  <summary className="text-slate-400 text-xs cursor-pointer hover:text-slate-300">View items</summary>
                  <div className="mt-2 space-y-1">
                    {po.items.map(item => {
                      const rcvd = parseFloat(item.received_qty || 0)
                      const ordered = parseFloat(item.quantity)
                      const pct = ordered > 0 ? Math.min(rcvd / ordered, 1) : 0
                      return (
                        <div key={item.id} className="text-xs text-slate-500 space-y-0.5">
                          <div className="flex justify-between">
                            <span>{item.item_name} — {ordered} {item.unit}</span>
                            <span>{parseFloat(item.total_cost || 0).toFixed(3)} OMR</span>
                          </div>
                          {rcvd > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct * 100}%` }} />
                              </div>
                              <span className={pct >= 1 ? 'text-green-400' : 'text-amber-400'}>
                                {rcvd}/{ordered} received
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {supplierModal !== null && (
        <SupplierModal
          supplier={supplierModal?.id ? supplierModal : null}
          onSave={(s) => {
            setSuppliers(prev => {
              const idx = prev.findIndex(x => x.id === s.id)
              return idx >= 0 ? prev.map(x => x.id === s.id ? s : x) : [...prev, s]
            })
            setSupplierModal(null)
          }}
          onClose={() => setSupplierModal(null)}
        />
      )}
      {poModal && (
        <POModal
          suppliers={suppliers}
          inventory={inventory}
          onSave={(po) => { setPos(p => [po, ...p]); setPoModal(false) }}
          onClose={() => setPoModal(false)}
        />
      )}
      {receiveModal && (
        <ReceivePOModal
          po={receiveModal}
          onReceived={handleReceived}
          onClose={() => setReceiveModal(null)}
        />
      )}
    </div>
  )
}
