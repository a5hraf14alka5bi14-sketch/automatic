import React, { useState, useEffect } from 'react'

export default function Inventory() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', category: '', quantity: '', unit: '', min_quantity: '', cost: '' })

  const fetchItems = () => {
    fetch('/api/inventory')
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchItems() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error('Failed')
      setForm({ name: '', category: '', quantity: '', unit: '', min_quantity: '', cost: '' })
      setShowForm(false)
      fetchItems()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const lowStock = items.filter(i => parseFloat(i.quantity) <= parseFloat(i.min_quantity))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-slate-400 text-sm mt-1">{items.length} items tracked • {lowStock.length} low stock</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          + Add Item
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
          <p className="text-red-400 font-medium text-sm mb-2">Low Stock Alert</p>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(item => (
              <span key={item.id} className="bg-red-500/20 text-red-300 text-xs px-2 py-1 rounded-full">
                {item.name} ({item.quantity} {item.unit})
              </span>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <h2 className="text-white font-semibold mb-4">Add Inventory Item</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'category', label: 'Category', type: 'text', required: true },
              { key: 'quantity', label: 'Quantity', type: 'number', required: true },
              { key: 'unit', label: 'Unit (kg, L, pcs)', type: 'text', required: true },
              { key: 'min_quantity', label: 'Min Quantity', type: 'number', required: true },
              { key: 'cost', label: 'Cost per Unit ($)', type: 'number', required: false }
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
                <input
                  type={f.type}
                  step="any"
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
              Save Item
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-4xl mb-3">📦</p>
          <p>No inventory items yet</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Item</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Category</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Quantity</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Min Stock</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Cost</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const isLow = parseFloat(item.quantity) <= parseFloat(item.min_quantity)
                return (
                  <tr key={item.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-white text-sm font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-slate-400 text-sm capitalize">{item.category}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      <span className={isLow ? 'text-red-400 font-semibold' : 'text-white'}>{item.quantity} {item.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400 text-sm">{item.min_quantity} {item.unit}</td>
                    <td className="px-4 py-3 text-right text-slate-400 text-sm">{item.cost ? `$${parseFloat(item.cost).toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${isLow ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-green-500/10 text-green-400 border-green-500/30'}`}>
                        {isLow ? 'Low' : 'OK'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
