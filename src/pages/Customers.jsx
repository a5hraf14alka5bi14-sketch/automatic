import React, { useState, useEffect } from 'react'

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '' })

  const fetchCustomers = () => {
    fetch('/api/customers')
      .then(r => r.json())
      .then(data => { setCustomers(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchCustomers() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error('Failed to add customer')
      setForm({ name: '', email: '', phone: '' })
      setShowForm(false)
      fetchCustomers()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase())) ||
    (c.phone && c.phone.includes(search))
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="text-slate-400 text-sm mt-1">{customers.length} registered customers</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          + Add Customer
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <h2 className="text-white font-semibold mb-4">New Customer</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'name', label: 'Full Name', type: 'text', required: true },
              { key: 'email', label: 'Email', type: 'email', required: false },
              { key: 'phone', label: 'Phone', type: 'tel', required: false }
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
                <input
                  type={f.type}
                  required={f.required}
                  value={form[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
              Save Customer
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-slate-500"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-4xl mb-3">👥</p>
          <p>{search ? 'No customers match your search' : 'No customers yet'}</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Name</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Email</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Phone</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Total Orders</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Points</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Member Since</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                        {c.name[0].toUpperCase()}
                      </div>
                      <span className="text-white text-sm font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-right text-white text-sm">{c.total_orders || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-orange-400 text-sm font-medium">{c.loyalty_points || 0} pts</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
