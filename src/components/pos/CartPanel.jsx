import React from 'react'

export default function CartPanel({
  orderType, setOrderType, tableNum, setTableNum, tablesCount,
  customerId, setCustomerId, customers,
  cart, fmtC, updateQty, removeItem,
  expandedCartItem, setExpandedCartItem, itemNotes, setItemNotes,
  discount, setDiscount, hasDiscount, discountVal,
  subtotal, discountedSub, tax, total, settings,
  note, setNote, rush, setRush, setSplitModal,
  error, placeOrder, placing, clearCart,
  showCart, setShowCart,
}) {
  return (
    <div className={`${showCart ? 'flex' : 'hidden'} md:flex fixed md:static inset-0 z-50 md:z-auto w-full md:w-80 xl:w-96 border-l border-slate-800 flex-col bg-slate-950 md:bg-slate-950/30 flex-shrink-0`}>
      {/* Mobile: cart header with close button */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0">
        <span className="text-white font-bold">🛒 السلة / Cart</span>
        <button onClick={() => setShowCart(false)} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white text-xl">✕</button>
      </div>
      {/* Order type + table */}
      <div className="p-4 border-b border-slate-800 flex-shrink-0">
        <div className="flex gap-1 bg-slate-900 rounded-xl p-1 mb-3">
          {[['dine-in','🍽️','Dine-in'],['takeaway','🛍️','Takeaway'],['delivery','🚚','Delivery']].map(([v,e,l]) => (
            <button key={v} onClick={() => setOrderType(v)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                orderType === v ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
              }`}>
              {e} {l}
            </button>
          ))}
        </div>

        {orderType === 'dine-in' && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs">Table</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setTableNum(t => Math.max(1, t - 1))} className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold">−</button>
              <span className="text-white font-bold w-8 text-center">{tableNum}</span>
              <button onClick={() => setTableNum(t => Math.min(tablesCount, t + 1))} className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold">+</button>
            </div>
            <span className="text-slate-600 text-xs">/ {tablesCount}</span>
          </div>
        )}
      </div>

      {/* Customer */}
      <div className="px-4 py-2 border-b border-slate-800 flex-shrink-0">
        <select value={customerId} onChange={e => setCustomerId(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
          <option value="">No customer linked</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name} {c.loyalty_points > 0 ? `(${c.loyalty_points} pts)` : ''}</option>
          ))}
        </select>
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-4xl mb-2">🛒</p>
              <p className="text-slate-600 text-sm">Cart is empty</p>
              <p className="text-slate-700 text-xs mt-1">Click items to add them</p>
            </div>
          </div>
        ) : cart.map(item => (
          <div key={item.cartId} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-start gap-2 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium leading-tight truncate">{item.name}</p>
                {item.modifiers.length > 0 && (
                  <p className="text-slate-500 text-xs mt-0.5 truncate">{item.modifiers.map(m => m.name).join(', ')}</p>
                )}
                <p className="text-orange-400 text-xs font-semibold mt-1">{fmtC(item.price)} each</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => updateQty(item.cartId, -1)} className="w-6 h-6 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 rounded-md text-sm font-bold transition-colors">−</button>
                <span className="text-white font-bold w-5 text-center text-sm">{item.qty}</span>
                <button onClick={() => updateQty(item.cartId, 1)} className="w-6 h-6 bg-slate-800 hover:bg-green-500/20 hover:text-green-400 text-slate-400 rounded-md text-sm font-bold transition-colors">+</button>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <p className="text-white font-semibold text-sm">{fmtC(parseFloat(item.price) * item.qty)}</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setExpandedCartItem(expandedCartItem === item.cartId ? null : item.cartId)}
                    className="text-slate-600 hover:text-slate-400 text-xs transition-colors px-1"
                    title="Add note"
                  >📝</button>
                  <button onClick={() => removeItem(item.cartId)} className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
                </div>
              </div>
            </div>
            {/* Item note inline */}
            {expandedCartItem === item.cartId && (
              <div className="px-3 pb-3">
                <input
                  type="text"
                  value={itemNotes[item.cartId] || ''}
                  onChange={e => setItemNotes(prev => ({ ...prev, [item.cartId]: e.target.value }))}
                  placeholder="Add note for kitchen…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-orange-500"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Discount section */}
      {cart.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs">Discount</span>
            <div className="flex bg-slate-900 rounded-lg p-0.5 gap-0.5">
              {[['percent','%'],['fixed','OMR']].map(([v,l]) => (
                <button key={v} onClick={() => setDiscount(d => ({ ...d, type: v, amount: '' }))}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    discount.type === v ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}>{l}</button>
              ))}
            </div>
            <div className="flex-1 relative">
              <input
                type="number"
                min="0"
                max={discount.type === 'percent' ? '100' : undefined}
                step={discount.type === 'percent' ? '1' : '0.001'}
                value={discount.amount}
                onChange={e => setDiscount(d => ({ ...d, amount: e.target.value }))}
                placeholder={discount.type === 'percent' ? '0%' : '0.000'}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-orange-500"
              />
            </div>
            {hasDiscount && (
              <button onClick={() => setDiscount({ amount: '', type: 'percent' })} className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
            )}
          </div>
          {hasDiscount && (
            <p className="text-green-400 text-xs mt-1">Discount: −{fmtC(discountVal)}</p>
          )}
        </div>
      )}

      {/* Totals */}
      <div className="p-4 border-t border-slate-800 flex-shrink-0 space-y-1.5">
        {cart.length > 0 && (
          <>
            <div className="flex justify-between text-sm text-slate-400">
              <span>Subtotal</span>
              <span className={hasDiscount ? 'line-through' : ''}>{fmtC(subtotal)}</span>
            </div>
            {hasDiscount && (
              <>
                <div className="flex justify-between text-sm text-green-400">
                  <span>Discount ({discount.type === 'percent' ? `${discount.amount}%` : 'fixed'})</span>
                  <span>−{fmtC(discountVal)}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-400">
                  <span>After discount</span>
                  <span>{fmtC(discountedSub)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm text-slate-400">
              <span>Tax ({settings.tax_rate || 5}%)</span>
              <span>{fmtC(tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-white text-base pt-1 border-t border-slate-800">
              <span>Total</span>
              <span className="text-orange-400">{fmtC(total)}</span>
            </div>
          </>
        )}

        {/* Order options */}
        {cart.length > 0 && (
          <div className="pt-2 space-y-2">
            {/* Note input */}
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Order note…"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
            />

            {/* Rush + Split row */}
            <div className="flex gap-2">
              <button
                onClick={() => setRush(v => !v)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                  rush ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700'
                }`}>
                {rush ? '🔴 RUSH' : '🚨 Rush'}
              </button>
              <button
                onClick={() => setSplitModal(true)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors">
                ÷ Split
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        {/* Place order button */}
        <button
          onClick={placeOrder}
          disabled={cart.length === 0 || placing}
          className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors mt-1 flex items-center justify-center gap-2">
          {placing ? (
            <><span className="animate-spin">⏳</span> Placing…</>
          ) : (
            <>Place Order {cart.length > 0 && `· ${fmtC(total)}`}</>
          )}
        </button>

        {cart.length > 0 && (
          <button onClick={clearCart} className="w-full py-2 text-slate-600 hover:text-red-400 text-xs transition-colors">
            Clear cart
          </button>
        )}
      </div>
    </div>
  )
}
