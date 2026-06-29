import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

function CustomerModal({ customer, onClose, onSave }) {
  const isEdit = !!customer?.id
  const [form, setForm] = useState({
    name: customer?.name || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    address: customer?.address || '',
    notes: customer?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const url = isEdit ? `/api/customers/${customer.id}` : '/api/customers'
    const r = await apiFetch(url, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(form) })
    if (r.ok) { onSave(); onClose() }
    else { const d = await r.json(); setError(d.error || 'Save failed') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-white font-bold">{isEdit ? 'Edit Customer' : 'New Customer'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Full Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ahmad Khalil"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+961 70 000 000"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
            </div>
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Address</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Hamra, Beirut"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="VIP, allergies, preferences…" rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 resize-none" />
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Customer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OrderHistoryDrawer({ customer, onClose }) {
  const { fmt } = useCurrency()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(`/api/orders/customer/${customer.id}`)
      .then(r => r.json())
      .then(d => { setOrders(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [customer.id])

  const STATUS_COLOR = {
    completed: 'text-green-400 bg-green-500/10 border-green-500/20',
    cancelled: 'text-red-400 bg-red-500/10 border-red-500/20',
    pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    preparing: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    ready: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-end" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold">{customer.name}</h2>
            <p className="text-slate-400 text-sm">{orders.length} order{orders.length !== 1 ? 's' : ''} · {customer.loyalty_points || 0} pts</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            [...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-800 rounded-xl animate-pulse" />)
          ) : orders.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-slate-500 text-sm">No orders yet</p>
            </div>
          ) : orders.map(o => (
            <div key={o.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-semibold">#{o.id}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[o.status] || 'text-slate-400 bg-slate-800 border-slate-700'}`}>
                    {o.status}
                  </span>
                </div>
                <span className="text-orange-400 font-bold text-sm">{fmt(o.total)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="capitalize">{o.type}{o.table_number ? ` · Table ${o.table_number}` : ''}</span>
                <span>{new Date(o.created_at).toLocaleDateString()}</span>
              </div>
              {o.items && o.items.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-700/50 text-xs text-slate-400 space-y-0.5">
                  {o.items.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{item.quantity}× {item.name}</span>
                      <span>{fmt(parseFloat(item.price) * item.quantity)}</span>
                    </div>
                  ))}
                  {o.items.length > 3 && <p className="text-slate-600">+{o.items.length - 3} more</p>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-800">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-slate-400 text-xs">Total Spent</p>
              <p className="text-white font-bold text-sm">{fmt(customer.total_spent || 0)}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Avg Order</p>
              <p className="text-white font-bold text-sm">
                {fmt(orders.length > 0 ? orders.reduce((s, o) => s + parseFloat(o.total), 0) / orders.length : 0)}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Loyalty Pts</p>
              <p className="text-orange-400 font-bold text-sm">{customer.loyalty_points || 0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Customers() {
  const { fmt } = useCurrency()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editCustomer, setEditCustomer] = useState(null)
  const [historyCustomer, setHistoryCustomer] = useState(null)
  const [deleteCustomer, setDeleteCustomer] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/customers')
      const d = await r.json()
      setCustomers(Array.isArray(d) ? d : [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async () => {
    if (!deleteCustomer) return
    setDeleting(true)
    await apiFetch(`/api/customers/${deleteCustomer.id}`, { method: 'DELETE' })
    setDeleteCustomer(null)
    setDeleting(false)
    load()
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase())) ||
    (c.phone && c.phone.includes(search))
  )

  const totalSpent = customers.reduce((s, c) => s + parseFloat(c.total_spent || 0), 0)
  const totalOrders = customers.reduce((s, c) => s + parseInt(c.total_orders || 0), 0)
  const avgSpend = customers.length > 0 ? totalSpent / customers.length : 0

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="text-slate-400 text-sm mt-0.5">{customers.length} registered customer{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setEditCustomer({})}
          className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-orange-500/20">
          + Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Customers" value={customers.length} />
        <StatCard label="Total Orders" value={totalOrders} sub="All time" />
        <StatCard label="Total Revenue" value={fmt(totalSpent)} color="text-orange-400" sub="From loyalty customers" />
        <StatCard label="Avg. Spend/Customer" value={fmt(avgSpend)} color="text-green-400" />
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
        <input type="text" placeholder="Search by name, email, or phone…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-slate-500" />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-16" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-4xl mb-3">👥</p>
          <p>{search ? 'No customers match your search' : 'No customers yet'}</p>
          {!search && (
            <button onClick={() => setEditCustomer({})} className="mt-3 text-orange-400 text-sm hover:underline">Add your first customer</button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/50">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Customer</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Contact</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Orders</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Total Spent</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Points</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Since</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors group cursor-pointer"
                  onClick={() => setHistoryCustomer(c)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-700 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {c.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{c.name}</p>
                        {c.address && <p className="text-slate-500 text-xs truncate max-w-[140px]">{c.address}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-400 text-sm">{c.email || '—'}</p>
                    <p className="text-slate-500 text-xs">{c.phone || ''}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-white text-sm font-medium">{c.total_orders || 0}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-orange-400">{fmt(c.total_spent || 0)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium ${c.loyalty_points > 0 ? 'text-orange-400' : 'text-slate-600'}`}>
                      {c.loyalty_points || 0} pts
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button onClick={() => setEditCustomer(c)} className="text-slate-400 hover:text-orange-400 transition-colors text-sm" title="Edit">✏️</button>
                      <button onClick={() => setDeleteCustomer(c)} className="text-slate-400 hover:text-red-400 transition-colors text-sm" title="Delete">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editCustomer !== null && (
        <CustomerModal customer={editCustomer} onClose={() => setEditCustomer(null)} onSave={load} />
      )}

      {historyCustomer && (
        <OrderHistoryDrawer customer={historyCustomer} onClose={() => setHistoryCustomer(null)} />
      )}

      {deleteCustomer && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-bold mb-2">Remove {deleteCustomer.name}?</h3>
            <p className="text-slate-400 text-sm mb-5">Their order history will remain, but the customer profile will be deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteCustomer(null)} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
