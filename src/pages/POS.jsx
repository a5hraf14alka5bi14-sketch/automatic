import React, { useState, useEffect } from 'react'

export default function POS() {
  const [menu, setMenu] = useState([])
  const [cart, setCart] = useState([])
  const [orderType, setOrderType] = useState('dine-in')
  const [tableNum, setTableNum] = useState('')
  const [loading, setLoading] = useState(true)
  const [placing, setPlacing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')

  useEffect(() => {
    fetch('/api/menu')
      .then(r => r.json())
      .then(data => { setMenu(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const categories = ['all', ...new Set(menu.map(i => i.category))]

  const filtered = selectedCategory === 'all' ? menu : menu.filter(i => i.category === selectedCategory)

  const addToCart = (item) => {
    setCart(prev => {
      const exists = prev.find(c => c.id === item.id)
      if (exists) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...item, qty: 1 }]
    })
  }

  const updateQty = (id, delta) => {
    setCart(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c)
      return updated.filter(c => c.qty > 0)
    })
  }

  const subtotal = cart.reduce((s, c) => s + (parseFloat(c.price) * c.qty), 0)
  const tax = subtotal * 0.11
  const total = subtotal + tax

  const placeOrder = async () => {
    if (cart.length === 0) return
    setPlacing(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: orderType,
          table_number: tableNum || null,
          items: cart.map(c => ({ menu_item_id: c.id, quantity: c.qty, price: c.price })),
          subtotal,
          tax,
          total
        })
      })
      if (!res.ok) throw new Error('Failed to place order')
      setCart([])
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      alert('Error placing order: ' + err.message)
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-white">Point of Sale</h1>
          <p className="text-slate-400 text-sm mt-1">Select items to add to order</p>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
                selectedCategory === cat ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.map(item => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="bg-slate-900 border border-slate-800 hover:border-orange-500/50 rounded-xl p-4 text-left transition-all group"
              >
                <p className="text-white font-medium text-sm group-hover:text-orange-400 transition-colors">{item.name}</p>
                <p className="text-slate-500 text-xs mt-0.5 capitalize">{item.category}</p>
                <p className="text-orange-400 font-bold mt-2">${parseFloat(item.price).toFixed(2)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-white font-semibold mb-3">Current Order</h2>
          <div className="flex gap-2 mb-3">
            {['dine-in', 'takeaway', 'delivery'].map(t => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  orderType === t ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {orderType === 'dine-in' && (
            <input
              type="number"
              placeholder="Table number"
              value={tableNum}
              onChange={e => setTableNum(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
            />
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {cart.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">No items added</p>
          ) : (
            <div className="space-y-3">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.name}</p>
                    <p className="text-orange-400 text-xs">${(parseFloat(item.price) * item.qty).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-white rounded text-sm transition-colors">−</button>
                    <span className="text-white text-sm w-5 text-center">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-white rounded text-sm transition-colors">+</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="space-y-1 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Subtotal</span>
              <span className="text-white">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Tax (11%)</span>
              <span className="text-white">${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold mt-2 pt-2 border-t border-slate-800">
              <span className="text-white">Total</span>
              <span className="text-orange-400">${total.toFixed(2)}</span>
            </div>
          </div>
          {success && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg px-3 py-2 mb-3 text-center">
              Order placed successfully!
            </div>
          )}
          <button
            onClick={placeOrder}
            disabled={cart.length === 0 || placing}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {placing ? 'Placing...' : `Place Order • $${total.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
