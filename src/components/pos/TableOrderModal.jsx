import React, { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../../utils/api.js'
import ReceiptModal from '../ReceiptModal.jsx'

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtCurrency(currency, n) {
  return `${currency} ${parseFloat(n || 0).toFixed(3)}`
}
function getRole() {
  try { return JSON.parse(localStorage.getItem('auth_user') || '{}').role || '' } catch { return '' }
}

// ─── QR panel ───────────────────────────────────────────────────────────────

function QRPanel({ tableNum, onClose }) {
  const url = `${window.location.origin}/qr-menu?table=${tableNum}`
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <ActionPanel title="QR Menu Link" onClose={onClose}>
      <p className="text-slate-400 text-xs mb-3">Share this link with guests for Table {tableNum}:</p>
      <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 break-all text-orange-400 text-xs mb-3 font-mono">{url}</div>
      <button onClick={copy}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors bg-orange-500 hover:bg-orange-600 text-white">
        {copied ? '✓ Copied!' : '📋 Copy Link'}
      </button>
    </ActionPanel>
  )
}

// ─── Cancel panel ───────────────────────────────────────────────────────────

function CancelPanel({ order, onClose, onDone, showToast }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/orders/${order.id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: 'cancelled', void_reason: reason.trim() || 'Cancelled by staff' })
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed') }
      showToast(`Order #${order.id} cancelled`, 'success')
      onDone()
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(false) }
  }
  return (
    <ActionPanel title="Cancel Order" onClose={onClose}>
      <p className="text-slate-400 text-xs mb-3">Order #{order.id} · {fmtCurrency('', order.total)}</p>
      <textarea
        value={reason} onChange={e => setReason(e.target.value)}
        placeholder="Reason (optional)…"
        rows={3}
        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm resize-none placeholder-slate-600 focus:outline-none focus:border-orange-500 mb-3"
      />
      <button onClick={handle} disabled={loading}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 disabled:opacity-60">
        {loading ? '…' : '✕ Confirm Cancel'}
      </button>
    </ActionPanel>
  )
}

// ─── Customer panel ─────────────────────────────────────────────────────────

function CustomerPanel({ order, onClose, onDone, showToast }) {
  const [phone, setPhone] = useState(order.customer_phone || '')
  const [name, setName]   = useState(order.customer_name || '')
  const [found, setFound] = useState(null)   // customer object or false
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)

  const search = async () => {
    if (!phone.trim()) return
    setLoading(true); setFound(null)
    try {
      const r = await apiFetch(`/api/customers?q=${encodeURIComponent(phone.trim())}`)
      const list = await r.json()
      const match = Array.isArray(list) ? list.find(c =>
        (c.phone || '').replace(/\D/g, '').endsWith(phone.replace(/\D/g, '').slice(-8))
      ) : null
      setFound(match || false)
      if (match) setName(match.name || '')
    } catch { setFound(false) }
    finally { setLoading(false) }
  }

  const save = async () => {
    setSaving(true)
    try {
      let customerId = found?.id || null
      if (!customerId && phone.trim()) {
        const cr = await apiFetch('/api/customers', {
          method: 'POST', body: JSON.stringify({ name: name.trim() || phone.trim(), phone: phone.trim() })
        })
        if (!cr.ok) { const d = await cr.json(); throw new Error(d.error || 'Failed to create') }
        customerId = (await cr.json()).id
      }
      const lr = await apiFetch(`/api/orders/${order.id}/customer-link`, {
        method: 'PATCH', body: JSON.stringify({ customer_id: customerId })
      })
      if (!lr.ok) { const d = await lr.json(); throw new Error(d.error || 'Failed to link') }
      showToast('Customer linked', 'success')
      onDone()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <ActionPanel title="Add / Edit Customer" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="Mobile number…"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500" />
          <button onClick={search} disabled={loading}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors disabled:opacity-60">
            {loading ? '…' : '🔍'}
          </button>
        </div>
        {found === false && (
          <p className="text-yellow-400 text-xs">No match — a new customer will be created.</p>
        )}
        {found && (
          <p className="text-green-400 text-xs">✓ Found: {found.name} · {found.phone}</p>
        )}
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Customer name…"
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500" />
        <button onClick={save} disabled={saving || (!phone.trim() && !found)}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60">
          {saving ? '…' : '💾 Save'}
        </button>
      </div>
    </ActionPanel>
  )
}

// ─── PAX panel ──────────────────────────────────────────────────────────────

function PaxPanel({ order, onClose, onDone, showToast }) {
  const [adults, setAdults] = useState(parseInt(order.adults_count || 0, 10))
  const [kids,   setKids]   = useState(parseInt(order.kids_count   || 0, 10))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const r = await apiFetch(`/api/orders/${order.id}/pax`, {
        method: 'PATCH', body: JSON.stringify({ adults_count: adults, kids_count: kids })
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed') }
      showToast('Party size updated', 'success')
      onDone()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <ActionPanel title="Update Party Size · PAX" onClose={onClose}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        {[['👨‍👩‍👧 Adults', adults, setAdults], ['🧒 Kids', kids, setKids]].map(([label, val, setter]) => (
          <div key={label}>
            <p className="text-slate-400 text-xs mb-2">{label}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setter(v => Math.max(0, v - 1))}
                className="w-9 h-9 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors">−</button>
              <span className="flex-1 text-center text-white font-bold text-xl">{val}</span>
              <button onClick={() => setter(v => v + 1)}
                className="w-9 h-9 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors">+</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={save} disabled={saving}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60">
        {saving ? '…' : '💾 Save PAX'}
      </button>
    </ActionPanel>
  )
}

// ─── Change Table panel ──────────────────────────────────────────────────────

function ChangeTablePanel({ order, tableMap, tablesCount, onClose, onDone, showToast }) {
  const [target, setTarget]   = useState(null)
  const [saving, setSaving]   = useState(false)

  const isOccupied = (n) => {
    if (n === order.table_number) return false // current table is "free" for display
    const orders = tableMap[n] || []
    return orders.some(o => !['completed', 'cancelled'].includes(o.status))
  }

  const save = async () => {
    if (!target) return
    setSaving(true)
    try {
      const r = await apiFetch(`/api/orders/${order.id}/table`, {
        method: 'PATCH', body: JSON.stringify({ table_number: target })
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed') }
      showToast(`Order moved to Table ${target}`, 'success')
      onDone()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <ActionPanel title="Change Table" onClose={onClose}>
      <p className="text-slate-400 text-xs mb-3">Select a free table to move Order #{order.id} to:</p>
      <div className="grid grid-cols-5 gap-2 mb-4 max-h-48 overflow-auto pr-1">
        {Array.from({ length: tablesCount || 20 }, (_, i) => i + 1).map(n => {
          const occupied = isOccupied(n)
          const current  = n === order.table_number
          const selected = n === target
          return (
            <button key={n} disabled={occupied || current} onClick={() => setTarget(n)}
              className={`aspect-square rounded-xl text-sm font-bold transition-colors
                ${current  ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : ''}
                ${occupied && !current ? 'bg-red-500/10 text-red-500/50 cursor-not-allowed border border-red-500/20' : ''}
                ${!occupied && !current && !selected ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700' : ''}
                ${selected ? 'bg-orange-500 text-white border border-orange-400' : ''}
              `}>
              {n}
            </button>
          )
        })}
      </div>
      <button onClick={save} disabled={saving || !target}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60">
        {saving ? '…' : `Move to Table ${target || '?'}`}
      </button>
    </ActionPanel>
  )
}

// ─── Generic action panel wrapper ────────────────────────────────────────────

function ActionPanel({ title, onClose, children }) {
  return (
    <div className="mt-3 bg-slate-800/60 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-semibold text-sm">{title}</p>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none transition-colors">✕</button>
      </div>
      {children}
    </div>
  )
}

// ─── Options menu ────────────────────────────────────────────────────────────

function OptionsMenu({ order, onSelect, onClose }) {
  const menuRef = useRef(null)
  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const items = [
    { key: 'qr',       icon: '🔗', label: 'Show QR / Menu Link' },
    { key: 'kot',      icon: '👨‍🍳', label: 'Print KOT' },
    { key: 'bill',     icon: '🧾', label: 'Generate Bill' },
    { key: 'pay',      icon: '💳', label: 'Pay & Close Order' },
    { key: 'cancel',   icon: '✕',  label: 'Cancel Order' },
    { key: 'customer', icon: '👤', label: 'Add / Edit Customer' },
    { key: 'pax',      icon: '👨‍👩‍👧', label: 'Update PAX' },
    { key: 'table',    icon: '🔀', label: 'Change Table' },
  ]

  return (
    <div ref={menuRef}
      className="absolute right-0 top-8 z-10 bg-slate-800 border border-slate-700 rounded-xl shadow-xl min-w-48 overflow-hidden">
      {items.map(({ key, icon, label }) => (
        <button key={key}
          onClick={() => { onSelect(key); onClose() }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors text-left">
          <span className="w-5 text-center">{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TableOrderModal({
  tableNum, orders, currency, onClose, onUpdateStatus, onToggleRush, onAddItems,
  settings, onPay, fetchOpenOrders, showToast, tableMap, tablesCount,
}) {
  const fmt = (n) => fmtCurrency(currency, n)
  const role = getRole()

  const [openMenuId, setOpenMenuId]     = useState(null)  // orderId whose ⋮ menu is open
  const [panelState, setPanelState]     = useState(null)  // { orderId, action }
  const [receiptOrder, setReceiptOrder] = useState(null)  // { order, tab }

  const STATUS_FLOW = {
    pending: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['completed'],
    completed: [], cancelled: []
  }
  const STATUS_COLOR = {
    pending: 'text-yellow-400', preparing: 'text-blue-400',
    ready: 'text-green-400', completed: 'text-slate-400', cancelled: 'text-red-400'
  }

  const openPanel = (orderId, action) => setPanelState({ orderId, action })
  const closePanel = () => setPanelState(null)

  const handleAction = (orderId, action) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    if (action === 'pay')  { onPay && onPay(order); return }
    if (action === 'kot')  { setReceiptOrder({ order, tab: 'kitchen' }); return }
    if (action === 'bill') { setReceiptOrder({ order, tab: 'customer' }); return }
    openPanel(orderId, action)
  }

  const afterMutation = () => {
    closePanel()
    fetchOpenOrders && fetchOpenOrders()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>

          {/* Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-white font-bold text-xl">Table {tableNum}</h2>
              <p className="text-slate-400 text-sm mt-0.5">{orders.length} active order{orders.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-2xl leading-none transition-colors">✕</button>
          </div>

          {/* Orders */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {orders.map(order => {
              const panelOpen = panelState?.orderId === order.id
              return (
                <div key={order.id}
                  className={`border rounded-xl p-4 ${order.rush ? 'border-red-500/50 bg-red-500/5' : 'border-slate-800 bg-slate-800/30'}`}>

                  {/* Order header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold">#{order.id}</span>
                      {order.rush && (
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">🔴 RUSH</span>
                      )}
                      {order.fire_together && (
                        <span className="bg-purple-500/20 text-purple-300 text-xs font-bold px-2 py-0.5 rounded-full border border-purple-500/30">🔥 All Together</span>
                      )}
                      <span className={`text-xs font-semibold capitalize ${STATUS_COLOR[order.status]}`}>{order.status}</span>
                      {(order.adults_count > 0 || order.kids_count > 0) && (
                        <span className="text-slate-500 text-xs">
                          👥 {order.adults_count}A {order.kids_count > 0 ? `/ ${order.kids_count}K` : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-orange-400 font-bold">{fmt(order.total)}</span>
                      {/* ⋮ options menu */}
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === order.id ? null : order.id)}
                          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-lg font-bold leading-none"
                          aria-label="Order options"
                        >⋮</button>
                        {openMenuId === order.id && (
                          <OptionsMenu
                            order={order}
                            onSelect={(action) => handleAction(order.id, action)}
                            onClose={() => setOpenMenuId(null)}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="space-y-1.5 mb-3">
                    {(order.items || []).map((item, i) => (
                      <div key={i} className="text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-orange-400 font-bold w-5">{item.quantity}×</span>
                          <span className="text-slate-300">{item.name}</span>
                          {item.name_ar && <span className="text-slate-500 text-xs" dir="rtl">{item.name_ar}</span>}
                          {item.done && <span className="text-green-400 text-xs ml-auto">✓</span>}
                        </div>
                        {item.item_notes && (
                          <p className="text-yellow-300/70 text-xs italic mt-0.5 pl-7">↳ {item.item_notes}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {order.notes && (
                    <p className="text-yellow-300 text-xs italic mb-3">📝 {order.notes}</p>
                  )}
                  {order.customer_name && (
                    <p className="text-slate-500 text-xs mb-3">👤 {order.customer_name}</p>
                  )}

                  {/* Status actions */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => onToggleRush(order.id, !order.rush)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        order.rush ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-700 text-slate-400 hover:text-red-400'
                      }`}>
                      {order.rush ? '🔴 Rush' : '🚨 Rush'}
                    </button>
                    {(STATUS_FLOW[order.status] || []).map(s => {
                      const isPayLaterBlock = role === 'cashier' && !order.payment_method && ['preparing', 'ready'].includes(s)
                      if (isPayLaterBlock) return null
                      return (
                        <button key={s}
                          onClick={() => onUpdateStatus(order.id, s)}
                          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                            s === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                            : s === 'cancelled' ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                            : 'bg-blue-500/15 text-blue-400 border border-blue-500/25 hover:bg-blue-500/25'
                          }`}>
                          {s === 'completed' ? '💳 Complete & Pay' : s === 'cancelled' ? '✕ Cancel' : `→ ${s}`}
                        </button>
                      )
                    })}
                    {role === 'cashier' && !order.payment_method && ['pending', 'preparing'].includes(order.status) && (
                      <p className="w-full text-xs text-slate-500 italic pt-1">
                        🍳 Kitchen staff handles preparation for pay-later orders
                      </p>
                    )}
                  </div>

                  {/* Inline action panel */}
                  {panelOpen && panelState.action === 'qr'       && <QRPanel tableNum={tableNum} onClose={closePanel} />}
                  {panelOpen && panelState.action === 'cancel'   && <CancelPanel order={order} onClose={closePanel} onDone={afterMutation} showToast={showToast || (() => {})} />}
                  {panelOpen && panelState.action === 'customer' && <CustomerPanel order={order} onClose={closePanel} onDone={afterMutation} showToast={showToast || (() => {})} />}
                  {panelOpen && panelState.action === 'pax'      && <PaxPanel order={order} onClose={closePanel} onDone={afterMutation} showToast={showToast || (() => {})} />}
                  {panelOpen && panelState.action === 'table'    && (
                    <ChangeTablePanel order={order} tableMap={tableMap || {}} tablesCount={tablesCount}
                      onClose={closePanel} onDone={afterMutation} showToast={showToast || (() => {})} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800 flex-shrink-0 flex gap-2">
            <button onClick={onAddItems}
              className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-colors">
              ➕ إضافة أصناف · Add Items
            </button>
            <button onClick={onClose}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors">
              إغلاق
            </button>
          </div>
        </div>
      </div>

      {/* ReceiptModal — KOT or Bill */}
      {receiptOrder && (
        <ReceiptModal
          order={receiptOrder.order}
          settings={settings || {}}
          initialTab={receiptOrder.tab}
          onClose={() => setReceiptOrder(null)}
        />
      )}
    </>
  )
}
