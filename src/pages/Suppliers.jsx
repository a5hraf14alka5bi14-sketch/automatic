import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { useToast } from '../context/ToastContext.jsx'
import { useRole, canManage } from '../utils/auth.js'

const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'box', 'bag']
const STATUS_COLORS = {
  draft: 'bg-slate-700 text-slate-300',
  ordered: 'bg-blue-500/20 text-blue-300',
  received: 'bg-green-500/20 text-green-300',
  cancelled: 'bg-red-500/20 text-red-400',
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

function POModal({ suppliers, inventory, onSave, onClose }) {
  const showToast = useToast()
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ inventory_id: '', item_name: '', quantity: '', unit: 'kg', unit_cost: '' }])
  const [saving, setSaving] = useState(false)

  const addItem = () => setItems(i => [...i, { inventory_id: '', item_name: '', quantity: '', unit: 'kg', unit_cost: '' }])
  const removeItem = (idx) => setItems(i => i.filter((_, ii) => ii !== idx))
  const updateItem = (idx, k, v) => setItems(i => i.map((item, ii) => ii === idx ? { ...item, [k]: v } : item))

  const pickInventory = (idx, invId) => {
    const inv = inventory.find(i => i.id === parseInt(invId))
    updateItem(idx, 'inventory_id', invId)
    if (inv) updateItem(idx, 'item_name', inv.name)
  }

  const total = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_cost) || 0), 0)

  const save = async () => {
    const validItems = items.filter(i => i.item_name.trim() && parseFloat(i.quantity) > 0)
    if (!validItems.length) return showToast('Add at least one item', 'error')
    setSaving(true)
    try {
      const res = await apiFetch('/api/suppliers/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({ supplier_id: supplierId || null, notes, items: validItems })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      showToast('Purchase order created', 'success')
      onSave(d)
    } catch (err) { showToast(err.message, 'error') }
    setSaving(false)
  }

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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-300 text-sm font-medium">Items</h3>
              <button onClick={addItem} className="text-orange-400 hover:text-orange-300 text-xs">+ Add Row</button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4">
                  <select value={item.inventory_id} onChange={e => pickInventory(idx, e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500">
                    <option value="">— Inventory item —</option>
                    {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <input value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)}
                    placeholder="Item name"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500" />
                </div>
                <div className="col-span-1">
                  <input type="number" min="0" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                    placeholder="Qty"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500" />
                </div>
                <div className="col-span-1">
                  <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-1 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <input type="number" min="0" step="0.001" value={item.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value)}
                    placeholder="Cost/unit"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500" />
                </div>
                <div className="col-span-1 flex justify-end">
                  {items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end text-slate-300 text-sm font-semibold">
            Total: {total.toFixed(3)} OMR
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

  const receivePO = async (id) => {
    if (!confirm('Mark this PO as received? This will add the quantities to inventory.')) return
    try {
      const res = await apiFetch(`/api/suppliers/purchase-orders/${id}/receive`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      showToast(`Received — ${d.items_restocked} inventory item(s) restocked`, 'success')
      await load()
    } catch (err) { showToast(err.message, 'error') }
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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
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
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[po.status]}`}>
                    {po.status}
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
                  {canManage(role) && po.status === 'ordered' && (
                    <button onClick={() => receivePO(po.id)}
                      className="text-xs px-2 py-1 bg-green-500/20 text-green-300 hover:bg-green-500/30 rounded-lg transition-colors">
                      ✓ Receive
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
                    {po.items.map(item => (
                      <div key={item.id} className="flex justify-between text-xs text-slate-500">
                        <span>{item.item_name} — {item.quantity} {item.unit}</span>
                        <span>{parseFloat(item.total_cost || 0).toFixed(3)} OMR</span>
                      </div>
                    ))}
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
    </div>
  )
}
