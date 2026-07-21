/**
 * QRMenu — public customer-facing menu + self-ordering page (no auth required).
 * Served at /qr-menu?table=N
 *
 * Customers scan a QR code, browse the bilingual menu, add items to a local
 * cart, then tap "Pay & Order" to pay online via Tap Payments (mandatory —
 * pay-at-till is not available for QR self-orders).
 *
 * Payment supports Visa, Mastercard, and Apple Pay automatically through
 * Tap's hosted checkout page (source.id = "src_all").
 *
 * All pricing is re-verified server-side; client-submitted prices are ignored.
 *
 * URL param conventions:
 *   ?table=N                          → pre-fills table number
 *   ?payment=success&order=ID&table=N&tap_id=chg_... → Tap redirects here after any outcome
 *     tap_id is the Tap charge ID — used for direct backend verification (not trust the param alone)
 */

import React, { useEffect, useState, useCallback } from 'react'

const API_BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL
  : ''

async function fetchJson(path) {
  const r = await fetch(`${API_BASE}${path}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

async function postJson(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: r.status, data })
  return data
}

function getUrlParam(key) {
  try {
    const p = new URLSearchParams(window.location.search)
    return p.get(key) || ''
  } catch { return '' }
}

function getTableFromUrl() {
  const n = parseInt(getUrlParam('table') || '', 10)
  return n > 0 ? String(n) : ''
}

// ── Payment confirmation view ─────────────────────────────────────────────────
// Shown after Tap redirects the customer back to /qr-menu?payment=success&…
// Polls /api/public/payment-status/:orderId until confirmed or timed out.
// Passes tap_id (Tap appends it to the redirect URL) so the backend can verify
// the charge directly even if the webhook hasn't arrived yet or the order was
// briefly cancelled by the stale-cleanup job.
function PaymentConfirmation({ orderId, tableNumber, currency }) {
  const [status,  setStatus]  = useState('checking') // 'checking'|'paid'|'failed'|'timeout'
  const [attempt, setAttempt] = useState(0)
  const MAX_ATTEMPTS = 20  // 20 × 2 s = 40 s max polling window (webhook can lag a few seconds)

  // tap_id is appended to the redirect URL by Tap: ?tap_id=chg_...
  const tapId = getUrlParam('tap_id')

  const poll = useCallback(async () => {
    try {
      const qs  = tapId ? `?tap_id=${encodeURIComponent(tapId)}` : ''
      const data = await fetchJson(`/api/public/payment-status/${orderId}${qs}`)
      if (data.confirmed || data.payment_status === 'paid') {
        setStatus('paid')
      } else if (data.payment_status === 'failed' || data.order_status === 'cancelled') {
        // Only fail immediately if no tap_id — if we have tap_id and got cancelled,
        // it means the charge was genuinely declined/cancelled on Tap's side.
        if (tapId || data.order_status === 'cancelled') {
          setStatus('failed')
        } else {
          setAttempt(a => a + 1)
        }
      } else {
        setAttempt(a => a + 1)
      }
    } catch {
      setAttempt(a => a + 1)
    }
  }, [orderId, tapId])

  useEffect(() => {
    if (status !== 'checking') return
    if (attempt >= MAX_ATTEMPTS) { setStatus('timeout'); return }
    const t = setTimeout(poll, attempt === 0 ? 600 : 2000)
    return () => clearTimeout(t)
  }, [attempt, status, poll])

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-sm w-full">
          <div className="w-14 h-14 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
          <h1 className="text-white text-xl font-bold mb-2">Confirming payment…</h1>
          <p className="text-slate-400 text-sm" dir="rtl">جاري التحقق من الدفع</p>
          <p className="text-slate-600 text-xs mt-4">Order #{orderId}{tableNumber ? ` · Table ${tableNumber}` : ''}</p>
        </div>
      </div>
    )
  }

  if (status === 'paid') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-sm w-full">
          <div className="text-6xl mb-5">✅</div>
          <h1 className="text-white text-2xl font-bold mb-2">Payment Confirmed!</h1>
          <p className="text-green-400 text-sm mb-1">تم تأكيد الدفع بنجاح</p>
          <div className="bg-slate-900 border border-green-500/20 rounded-2xl p-5 mt-5 space-y-2">
            <p className="text-slate-400 text-xs">Order number · رقم الطلب</p>
            <p className="text-orange-400 text-3xl font-bold">#{orderId}</p>
            {tableNumber && (
              <p className="text-slate-300 text-sm">Table {tableNumber} · طاولة {tableNumber}</p>
            )}
            <div className="pt-2 border-t border-slate-800">
              <p className="text-green-400 text-xs font-medium">💳 Paid online · دفع إلكتروني</p>
            </div>
            <p className="text-slate-500 text-xs mt-2">Your food is being prepared. Enjoy!</p>
            <p className="text-slate-600 text-xs" dir="rtl">طعامك قيد التحضير. بالعافية!</p>
          </div>
          <a
            href={`/qr-menu${tableNumber ? `?table=${tableNumber}` : ''}`}
            className="mt-6 block w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-sm transition-colors text-center"
          >
            Order more · طلب المزيد
          </a>
        </div>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-sm w-full">
          <div className="text-5xl mb-5">❌</div>
          <h1 className="text-white text-xl font-bold mb-2">Payment not completed</h1>
          <p className="text-red-400 text-sm mb-1">لم يتم إتمام الدفع</p>
          <p className="text-slate-400 text-sm mt-4">Your order was not placed. Please try again.</p>
          <p className="text-slate-600 text-xs mt-1" dir="rtl">لم يتم تسجيل طلبك. يرجى المحاولة مرة أخرى.</p>
          <a
            href={`/qr-menu${tableNumber ? `?table=${tableNumber}` : ''}`}
            className="mt-6 block w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl text-sm font-semibold transition-colors text-center"
          >
            Try again · حاول مجدداً
          </a>
        </div>
      </div>
    )
  }

  // timeout — payment may still confirm via webhook; show a neutral "pending" view
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-sm w-full">
        <div className="text-5xl mb-5">⏳</div>
        <h1 className="text-white text-xl font-bold mb-2">Payment is being processed</h1>
        <p className="text-slate-400 text-sm">الدفع قيد المعالجة — سيتم تأكيد طلبك قريباً</p>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mt-5">
          <p className="text-slate-300 text-sm">Order #{orderId}{tableNumber ? ` · Table ${tableNumber}` : ''}</p>
          <p className="text-slate-500 text-xs mt-3">
            Payment confirmation may take a moment. A staff member will confirm with you shortly.
          </p>
        </div>
        <a
          href={`/qr-menu${tableNumber ? `?table=${tableNumber}` : ''}`}
          className="mt-6 block w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-sm transition-colors text-center"
        >
          Back to Menu · العودة للقائمة
        </a>
      </div>
    </div>
  )
}

// ── Main QRMenu component ─────────────────────────────────────────────────────
export default function QRMenu() {
  // Detect URL params set by Tap on redirect-back
  const paymentReturn = getUrlParam('payment') === 'success'
  const returnOrderId = parseInt(getUrlParam('order') || '', 10) || null
  const wasCancel     = getUrlParam('cancelled') === '1'

  const [categories,     setCategories] = useState([])
  const [restaurantName, setName]       = useState('Restaurant')
  const [currency,       setCurrency]   = useState('OMR')
  const [tapEnabled,     setTapEnabled] = useState(false)
  const [loading,        setLoading]    = useState(true)
  const [error,          setError]      = useState(null)
  const [search,         setSearch]     = useState('')
  const [activeCategory, setActiveCategory] = useState(null)

  const [cart,        setCart]       = useState({})
  const [view,        setView]       = useState('menu') // 'menu' | 'cart'
  const [tableNumber, setTableNumber]= useState(getTableFromUrl)
  const [orderNotes,  setOrderNotes] = useState('')
  const [submitting,  setSubmitting] = useState(false)
  const [orderError,  setOrderError] = useState('')
  const [cancelMsg,   setCancelMsg]  = useState(
    wasCancel ? 'Payment was cancelled — please try again.' : ''
  )

  const fmt = n => `${currency} ${parseFloat(n).toFixed(3)}`

  useEffect(() => {
    ;(async () => {
      try {
        const [menu, settings] = await Promise.all([
          fetchJson('/api/public/menu'),
          fetchJson('/api/public/settings'),
        ])
        setCategories(menu.categories || [])
        setName(settings.restaurant_name || 'Restaurant')
        setCurrency(settings.currency_symbol || 'OMR')
        setTapEnabled(!!settings.tap_enabled)
        if (menu.categories?.length) setActiveCategory(menu.categories[0].category)
      } catch {
        setError('Failed to load menu. Please try again.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const cartItems = Object.values(cart)
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0)
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0)

  const addToCart = item => setCart(prev => {
    const existing = prev[item.id]
    return {
      ...prev,
      [item.id]: existing
        ? { ...existing, qty: existing.qty + 1 }
        : { id: item.id, name: item.name, name_ar: item.name_ar, price: item.price, qty: 1 },
    }
  })

  const setQty = (id, qty) => {
    if (qty <= 0) {
      setCart(prev => { const n = { ...prev }; delete n[id]; return n })
    } else {
      setCart(prev => ({ ...prev, [id]: { ...prev[id], qty } }))
    }
  }

  const getQty = id => cart[id]?.qty || 0

  const validateCart = () => {
    const tableNum = parseInt(tableNumber, 10)
    if (!tableNum || tableNum < 1) { setOrderError('Please enter a valid table number · أدخل رقم الطاولة'); return null }
    if (cartItems.length === 0)    { setOrderError('Your cart is empty · سلة الطلبات فارغة');                return null }
    setOrderError('')
    return tableNum
  }

  // Pay & Order — creates order + Tap charge, redirects browser to Tap hosted checkout
  const handlePayAndOrder = async () => {
    const tableNum = validateCart()
    if (!tableNum) return
    setSubmitting(true)
    setCancelMsg('')
    try {
      const result = await postJson('/api/public/orders/pay', {
        table_number: tableNum,
        items: cartItems.map(i => ({ menu_item_id: i.id, quantity: i.qty })),
        notes: orderNotes || null,
      })

      if (result.payment_url) {
        // Redirect browser to Tap hosted checkout (card + Apple Pay).
        // Tap's checkout refuses to render inside an iframe (X-Frame-Options),
        // so when embedded (e.g. Replit preview) navigate the TOP window.
        try {
          if (window.top && window.top !== window.self) {
            window.top.location.href = result.payment_url
            return
          }
        } catch {
          // Sandboxed iframe blocks top navigation — open a new tab instead
          window.open(result.payment_url, '_blank')
          return
        }
        window.location.href = result.payment_url
        return
      }

      throw new Error('Unexpected response from server')
    } catch (err) {
      setOrderError(err.message || 'Failed to start payment. Please try again.')
      setSubmitting(false)
    }
  }

  // Filtered items
  const filteredCategories = categories.map(cat => ({
    ...cat,
    items: cat.items.filter(item => {
      if (!search) return true
      const q = search.toLowerCase()
      return item.name?.toLowerCase().includes(q) || (item.name_ar && item.name_ar.includes(search))
    }),
  })).filter(cat => cat.items.length > 0)

  // ── Payment return from Tap ────────────────────────────────────────────────
  if (paymentReturn && returnOrderId) {
    return (
      <PaymentConfirmation
        orderId={returnOrderId}
        tableNumber={tableNumber || getTableFromUrl()}
        currency={currency || 'OMR'}
      />
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading menu…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-white font-semibold mb-2">Could not load menu</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm">
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Cart view ──────────────────────────────────────────────────────────────
  if (view === 'cart') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setView('menu')} className="text-orange-400 hover:text-orange-300 text-sm transition-colors flex-shrink-0">
            ← Back
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-base">Your Cart · سلة الطلبات</h1>
            <p className="text-slate-400 text-xs">{cartCount} item{cartCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-3 max-w-lg mx-auto">
            {/* Cart items */}
            {cartItems.map(item => (
              <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{item.name}</p>
                  {item.name_ar && <p className="text-slate-500 text-xs" dir="rtl">{item.name_ar}</p>}
                  <p className="text-orange-400 text-sm font-semibold mt-1">{fmt(item.price * item.qty)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setQty(item.id, item.qty - 1)}
                    className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center text-base transition-colors">−</button>
                  <span className="text-white font-bold w-5 text-center text-sm">{item.qty}</span>
                  <button onClick={() => setQty(item.id, item.qty + 1)}
                    className="w-8 h-8 bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center justify-center text-base transition-colors">+</button>
                </div>
              </div>
            ))}

            {/* Table number */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <label className="block text-white text-sm font-medium mb-2">
                Table Number <span className="text-red-400">*</span>
                <span className="text-slate-500 mr-2"> · رقم الطاولة</span>
              </label>
              <input
                type="number" min={1} max={9999}
                value={tableNumber}
                onChange={e => setTableNumber(e.target.value)}
                placeholder="Enter your table number"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white text-base focus:outline-none focus:border-orange-500 text-center font-bold"
              />
            </div>

            {/* Order notes */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <label className="block text-white text-sm font-medium mb-2">
                Special Requests · ملاحظات
                <span className="text-slate-500 mr-2"> (optional)</span>
              </label>
              <textarea
                value={orderNotes}
                onChange={e => setOrderNotes(e.target.value)}
                placeholder="Allergies, special preferences…"
                maxLength={500} rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 resize-none"
              />
            </div>

            {/* Order total */}
            <div className="bg-slate-900 border border-orange-500/20 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="text-slate-400 text-xs">Subtotal · المجموع</p>
                <p className="text-white text-xs mt-0.5 opacity-60">(+Tax calculated at checkout)</p>
              </div>
              <p className="text-orange-400 text-xl font-bold">{fmt(cartTotal)}</p>
            </div>

            {/* Payment info */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
              <p className="text-slate-300 text-xs font-medium mb-1">
                💳 Secure online payment · دفع إلكتروني آمن
              </p>
              <p className="text-slate-500 text-xs">
                Visa · Mastercard · Apple Pay — powered by Tap Payments
              </p>
            </div>

            {/* Cancellation notice */}
            {cancelMsg && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                <p className="text-amber-400 text-sm">{cancelMsg}</p>
                <p className="text-amber-500/70 text-xs mt-1" dir="rtl">تم إلغاء الدفع — يرجى المحاولة مرة أخرى.</p>
              </div>
            )}

            {orderError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">{orderError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Pay & Order button */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <button
            onClick={handlePayAndOrder}
            disabled={submitting || cartItems.length === 0 || !tableNumber || !tapEnabled}
            className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-base font-bold rounded-2xl transition-colors shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Redirecting to payment…
              </span>
            ) : (
              <>
                <span>💳</span>
                <span>Pay &amp; Order</span>
                <span className="text-orange-200 text-sm font-normal"> · ادفع وأكمل الطلب</span>
              </>
            )}
          </button>
          {!tapEnabled && (
            <p className="text-center text-slate-500 text-xs mt-2">Online payment is currently unavailable. Please ask staff for assistance.</p>
          )}
        </div>
      </div>
    )
  }

  // ── Menu view ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 pt-4 pb-0 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">{restaurantName}</h1>
            {tableNumber && (
              <p className="text-orange-400 text-xs font-medium">Table {tableNumber} · طاولة {tableNumber}</p>
            )}
          </div>
          <div className="text-2xl select-none">🍽️</div>
        </div>

        {/* Cancellation notice on menu view */}
        {cancelMsg && (
          <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
            <p className="text-amber-400 text-xs">{cancelMsg}</p>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search menu · ابحث في القائمة"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">✕</button>
          )}
        </div>

        {/* Category tabs */}
        {!search && (
          <div className="flex gap-1 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
            {categories.map(cat => (
              <button
                key={cat.category}
                onClick={() => {
                  setActiveCategory(cat.category)
                  document.getElementById(`cat-${cat.category}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                  activeCategory === cat.category
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {cat.category}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Menu items */}
      <div className="flex-1 overflow-y-auto pb-28">
        {filteredCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm">
            <p>No items found · لا توجد نتائج</p>
          </div>
        ) : (
          filteredCategories.map(cat => (
            <div key={cat.category} id={`cat-${cat.category}`} className="px-4 pt-5 pb-1">
              <h2 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-3">{cat.category}</h2>
              <div className="space-y-2">
                {cat.items.map(item => {
                  const qty = getQty(item.id)
                  return (
                    <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium leading-tight">{item.name}</p>
                        {item.name_ar && (
                          <p className="text-slate-500 text-xs mt-0.5" dir="rtl">{item.name_ar}</p>
                        )}
                        {item.description && (
                          <p className="text-slate-600 text-xs mt-1 line-clamp-1">{item.description}</p>
                        )}
                        <p className="text-orange-400 text-sm font-semibold mt-1">{fmt(item.price)}</p>
                      </div>
                      {qty === 0 ? (
                        <button
                          onClick={() => addToCart(item)}
                          className="w-8 h-8 bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center justify-center text-base transition-colors flex-shrink-0"
                        >+</button>
                      ) : (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => setQty(item.id, qty - 1)}
                            className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center text-sm transition-colors">−</button>
                          <span className="text-white font-bold w-4 text-center text-sm">{qty}</span>
                          <button onClick={() => setQty(item.id, qty + 1)}
                            className="w-7 h-7 bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center justify-center text-sm transition-colors">+</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating cart button */}
      {cartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-30 max-w-lg mx-auto">
          <button
            onClick={() => { setView('cart'); setCancelMsg('') }}
            className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl shadow-xl shadow-orange-500/30 flex items-center justify-between px-5 transition-colors"
          >
            <span className="bg-orange-700 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center">
              {cartCount}
            </span>
            <span className="text-base">View Cart · اعرض السلة</span>
            <span className="text-orange-200 font-semibold text-sm">{fmt(cartTotal)}</span>
          </button>
        </div>
      )}
    </div>
  )
}
