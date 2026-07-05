import React, { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../utils/api.js'
import { enqueueOfflineOrder } from '../components/OfflineBanner.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useSettings } from '../context/SettingsContext.jsx'
import ReceiptModal from '../components/ReceiptModal.jsx'
import { CATS } from '../components/pos/constants.js'
import ModifierSelectModal from '../components/pos/ModifierSelectModal.jsx'
import PaymentModal from '../components/pos/PaymentModal.jsx'
import SplitBillModal from '../components/pos/SplitBillModal.jsx'
import MenuPanel from '../components/pos/MenuPanel.jsx'
import CartPanel from '../components/pos/CartPanel.jsx'
import TablesView from '../components/pos/TablesView.jsx'
import { useCart } from '../hooks/useCart.js'

// ── Main POS ──────────────────────────────────────────────────────────────────
export default function POS() {
  const showToast = useToast()
  const { refreshLowStock } = useSettings()

  // Core data
  const [menu, setMenu] = useState([])
  const [stockAvail, setStockAvail] = useState({}) // { menu_item_id: maxSellable | null(unlimited) }
  const [customers, setCustomers] = useState([])
  const [settings, setSettings] = useState({ tax_rate: '5', currency_symbol: 'OMR', tables_count: '10', loyalty_points_per_omr: '1' })
  const [loading, setLoading] = useState(true)

  // View: 'pos' | 'tables'
  const [view, setView] = useState('pos')
  const [openOrders, setOpenOrders] = useState([])
  const [tablesLoading, setTablesLoading] = useState(false)
  const [selectedTableOrders, setSelectedTableOrders] = useState(null) // { tableNum, orders }

  // Order context (the cart itself lives in the useCart hook below)
  const [orderType, setOrderType] = useState('dine-in')
  const [tableNum, setTableNum] = useState(1)
  const [customerId, setCustomerId] = useState('')
  const [note, setNote] = useState('')
  const [rush, setRush] = useState(false)

  // UI state
  const [placing, setPlacing] = useState(false)
  const [payModal, setPayModal] = useState(null)
  const [receiptData, setReceiptData] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [modifierModal, setModifierModal] = useState(null)
  const [modifierLoading, setModifierLoading] = useState(false)
  const [splitModal, setSplitModal] = useState(false)
  const [showCart, setShowCart] = useState(false) // mobile: cart overlay toggle

  const modifierCache = useRef({})
  const searchRef = useRef(null)

  // Cart state, line-item mutations, and money math live in the useCart hook.
  const taxRate = parseFloat(settings.tax_rate || '5') / 100
  const {
    cart, setCart, itemNotes, setItemNotes, expandedCartItem, setExpandedCartItem,
    discount, setDiscount, addToCart, updateQty, removeItem, clearCart: cartClear,
    subtotal, discountVal, discountedSub, tax, total, cartCount, hasDiscount,
  } = useCart({ taxRate, stockAvail, showToast })

  // ── Load initial data ──────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [menuRes, custRes, settingsRes, availRes] = await Promise.all([
        apiFetch('/api/menu/all'),
        apiFetch('/api/customers'),
        apiFetch('/api/settings'),
        apiFetch('/api/menu/stock-availability'),
      ])
      const [menuData, custData, settingsData, availData] = await Promise.all([menuRes.json(), custRes.json(), settingsRes.json(), availRes.json()])
      setMenu(Array.isArray(menuData) ? menuData.filter(m => m.available) : [])
      setCustomers(Array.isArray(custData) ? custData : [])
      if (settingsData && !settingsData.error) setSettings(s => ({ ...s, ...settingsData }))
      setStockAvail(availData && !availData.error ? availData : {})
    } catch (e) { showToast('Failed to load POS data', 'error') }
    setLoading(false)
  }, [showToast])

  useEffect(() => { loadData() }, [loadData])

  // ── Barcode scanner support (HID keyboard-wedge) ──────────────────────────
  // Accumulates rapid key presses (< 80 ms apart); on Enter or pause, looks up
  // by barcode and adds to cart. Ignores when focus is on an input/textarea.
  useEffect(() => {
    let buffer = ''
    let lastAt = 0

    const onKey = async (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      // Don't intercept when user is typing in an input / textarea / select
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      const now = Date.now()
      if (now - lastAt > 80) buffer = '' // reset on slow typing
      lastAt = now

      if (e.key === 'Enter') {
        const code = buffer.trim()
        buffer = ''
        if (code.length >= 3) {
          try {
            const res = await apiFetch(`/api/menu/barcode/${encodeURIComponent(code)}`)
            if (res.ok) {
              const item = await res.json()
              if (item?.available) {
                // Reuse existing addToCart logic via synthetic click is complex;
                // directly push to cart state using the same shape
                setCart(prev => {
                  const existing = prev.find(c => c.id === item.id && !c.modifiers?.length)
                  if (existing) {
                    return prev.map(c => c.id === item.id && !c.modifiers?.length
                      ? { ...c, qty: c.qty + 1 } : c)
                  }
                  return [...prev, {
                    id: item.id,
                    cartId: `${item.id}-${Date.now()}`,
                    name: item.name,
                    price: parseFloat(item.price),
                    qty: 1,
                    modifiers: [],
                  }]
                })
                showToast(`📦 ${item.name} added via barcode`, 'success')
              } else {
                showToast('Item not available', 'error')
              }
            } else {
              showToast(`Barcode not found: ${code}`, 'error')
            }
          } catch {
            showToast(`Barcode scan failed: ${code} — network error`, 'error')
          }
        }
        return
      }

      if (e.key.length === 1) buffer += e.key
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showToast])

  // ── Load open orders for Tables view ──────────────────────────────────────
  const fetchOpenOrders = useCallback(async () => {
    setTablesLoading(true)
    try {
      const res = await apiFetch('/api/orders?status=pending,preparing,ready')
      const data = await res.json()
      setOpenOrders(Array.isArray(data) ? data : [])
    } catch (e) { showToast('Failed to load open orders', 'error') }
    setTablesLoading(false)
  }, [showToast])

  useEffect(() => {
    if (view === 'tables') fetchOpenOrders()
  }, [view, fetchOpenOrders])

  // ── Computed values ────────────────────────────────────────────────────────
  const tablesCount = parseInt(settings.tables_count || '10')
  const currency = settings.currency_symbol || 'OMR'
  const fmtC = (amount) => `${currency} ${parseFloat(amount || 0).toFixed(3)}`

  // ── Menu filtering ─────────────────────────────────────────────────────────
  const filtered = menu.filter(item => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false
    if (search) return item.name.toLowerCase().includes(search.toLowerCase()) || (item.tags || '').toLowerCase().includes(search.toLowerCase())
    return true
  })

  // ── Cart operations ────────────────────────────────────────────────────────
  // cart state + addToCart/updateQty/removeItem live in the useCart hook.
  const handleItemClick = async (item) => {
    if (modifierLoading) return
    const cached = modifierCache.current[item.id]
    if (cached !== undefined) {
      if (cached.length === 0) addToCart(item, [])
      else setModifierModal({ item, groups: cached })
      return
    }
    setModifierLoading(true)
    try {
      const res = await apiFetch(`/api/menu/${item.id}/modifier-groups`)
      const groups = await res.json()
      const validGroups = Array.isArray(groups) ? groups.filter(g => g.modifiers && g.modifiers.length > 0) : []
      modifierCache.current[item.id] = validGroups
      if (validGroups.length === 0) addToCart(item, [])
      else setModifierModal({ item, groups: validGroups })
    } catch {
      modifierCache.current[item.id] = []
      addToCart(item, [])
    }
    setModifierLoading(false)
  }

  // Clears the cart (via the hook) plus the order-level context fields.
  const clearCart = () => {
    cartClear()
    setNote(''); setCustomerId(''); setRush(false)
  }

  // ── Place order ────────────────────────────────────────────────────────────
  const placeOrder = async () => {
    if (cart.length === 0) return
    setPlacing(true); setError('')

    const payload = {
      type: orderType,
      table_number: orderType === 'dine-in' ? tableNum : null,
      customer_id: customerId ? parseInt(customerId) : null,
      notes: note.trim() || null,
      rush,
      discount: parseFloat(discountVal.toFixed(3)),
      discount_type: discount.type,
      items: cart.map(c => ({
        menu_item_id: c.id,
        quantity: c.qty,
        price: parseFloat(c.price),
        name: c.name,
        modifiers: c.modifiers || [],
        item_notes: itemNotes[c.cartId] || null,
      })),
      subtotal: parseFloat(discountedSub.toFixed(3)),
      tax: parseFloat(tax.toFixed(3)),
      total: parseFloat(total.toFixed(3)),
    }

    // If offline, queue locally and bail out with a friendly notice
    if (!navigator.onLine) {
      try {
        await enqueueOfflineOrder(payload)
        clearCart()
        setShowCart(false)
        showToast('Offline — order saved locally and will sync when connection returns', 'info')
      } catch {
        showToast('Could not save order offline', 'error')
      }
      setPlacing(false)
      return
    }

    try {
      const res = await apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(payload) })
      const order = await res.json()
      if (!res.ok) throw new Error(order.error || 'Failed to place order')

      const selectedCustomer = customerId ? customers.find(c => c.id === parseInt(customerId)) : null
      const cartSnapshot = cart.map(c => ({
        name: c.name, quantity: c.qty, price: parseFloat(c.price),
        modifiers: c.modifiers || [], notes: itemNotes[c.cartId] || null
      }))

      clearCart()
      setShowCart(false)
      showToast(`Order #${order.id} placed — awaiting payment`, 'info')
      setPayModal({
        ...order,
        total: parseFloat(total.toFixed(3)),
        subtotal: parseFloat(discountedSub.toFixed(3)),
        tax: parseFloat(tax.toFixed(3)),
        type: orderType,
        items: cartSnapshot,
        customer_name: selectedCustomer?.name || null,
        loyalty_points: parseInt(selectedCustomer?.loyalty_points || 0),
        loyalty_per_omr: parseInt(settings.loyalty_points_per_omr || '1'),
      })
    } catch (err) {
      // Network failure while navigator.onLine may be stale — offer offline queue
      if (!navigator.onLine || err.name === 'TypeError') {
        try {
          await enqueueOfflineOrder(payload)
          clearCart()
          setShowCart(false)
          showToast('Network lost — order queued offline and will sync on reconnect', 'info')
        } catch {
          setError(err.message)
          showToast(err.message, 'error')
        }
      } else {
        setError(err.message)
        showToast(err.message, 'error')
      }
    }
    setPlacing(false)
  }

  // ── Handle payment ─────────────────────────────────────────────────────────
  const handlePayment = async (orderId, method, loyaltyRedemptionPoints = 0) => {
    try {
      const res = await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', payment_method: method, loyalty_redemption_points: loyaltyRedemptionPoints || 0 })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Payment failed') }
      const receipt = { ...payModal, payment_method: method, paid_at: new Date().toISOString() }
      setPayModal(null)
      showToast('Payment confirmed! 🎉', 'success')
      setReceiptData(receipt)
      refreshLowStock()
    } catch (err) { showToast(err.message, 'error') }
  }

  // ── Tables view handlers ───────────────────────────────────────────────────
  const tableUpdateStatus = async (orderId, status) => {
    try {
      await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH', body: JSON.stringify({ status })
      })
      fetchOpenOrders()
      setSelectedTableOrders(null)
    } catch (e) { showToast(e?.message || 'Failed to update order status', 'error') }
  }

  const tableToggleRush = async (orderId, rushVal) => {
    try {
      await apiFetch(`/api/orders/${orderId}/rush`, { method: 'PATCH', body: JSON.stringify({ rush: rushVal }) })
      fetchOpenOrders()
    } catch (e) { showToast(e?.message || 'Failed to toggle rush status', 'error') }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  const placeOrderRef = useRef(placeOrder)
  placeOrderRef.current = placeOrder
  const addFirstMatchRef = useRef(null)
  addFirstMatchRef.current = () => { if (filtered.length > 0) handleItemClick(filtered[0]) }

  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (e.key === 'Escape') {
        if (modifierModal) return setModifierModal(null)
        if (payModal) return setPayModal(null)
        if (search) return setSearch('')
        if (typing) return el.blur()
        return
      }
      if (modifierModal || payModal) return
      if (e.key === 'Enter' && el === searchRef.current) { e.preventDefault(); addFirstMatchRef.current(); return }
      if (typing) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return }
      if (e.key === 'Enter') { if (cart.length > 0 && !placing) { e.preventDefault(); placeOrderRef.current() }; return }
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1
        if (CATS[idx]) { e.preventDefault(); setSelectedCategory(CATS[idx].id) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [payModal, modifierModal, cart.length, placing, search])

  // ── Tables view ────────────────────────────────────────────────────────────
  const tableMap = {}
  for (const o of openOrders) {
    if (o.type === 'dine-in' && o.table_number) {
      if (!tableMap[o.table_number]) tableMap[o.table_number] = []
      tableMap[o.table_number].push(o)
    }
  }
  const nonTableOrders = openOrders.filter(o => o.type !== 'dine-in' || !o.table_number)
  const activeTableCount = Object.keys(tableMap).length
  const rushCount = openOrders.filter(o => o.rush).length

  if (view === 'tables') {
    return (
      <TablesView
        rushCount={rushCount}
        activeTableCount={activeTableCount}
        tablesCount={tablesCount}
        fetchOpenOrders={fetchOpenOrders}
        setView={setView}
        tablesLoading={tablesLoading}
        tableMap={tableMap}
        nonTableOrders={nonTableOrders}
        openOrders={openOrders}
        setSelectedTableOrders={setSelectedTableOrders}
        selectedTableOrders={selectedTableOrders}
        fmtC={fmtC}
        currency={currency}
        tableUpdateStatus={tableUpdateStatus}
        tableToggleRush={tableToggleRush}
      />
    )
  }

  // ── POS view ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full relative">
      {/* ── Left: Menu panel ──────────────────────────────────────────── */}
      <MenuPanel
        menu={menu}
        cartCount={cartCount}
        setView={setView}
        searchRef={searchRef}
        search={search}
        setSearch={setSearch}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        loading={loading}
        filtered={filtered}
        cart={cart}
        handleItemClick={handleItemClick}
        modifierLoading={modifierLoading}
        fmtC={fmtC}
        stockAvail={stockAvail}
      />

      {/* ── Right: Cart + Order ────────────────────────────────────────── */}
      <CartPanel
        orderType={orderType}
        setOrderType={setOrderType}
        tableNum={tableNum}
        setTableNum={setTableNum}
        tablesCount={tablesCount}
        customerId={customerId}
        setCustomerId={setCustomerId}
        customers={customers}
        cart={cart}
        fmtC={fmtC}
        updateQty={updateQty}
        removeItem={removeItem}
        expandedCartItem={expandedCartItem}
        setExpandedCartItem={setExpandedCartItem}
        itemNotes={itemNotes}
        setItemNotes={setItemNotes}
        discount={discount}
        setDiscount={setDiscount}
        hasDiscount={hasDiscount}
        discountVal={discountVal}
        subtotal={subtotal}
        discountedSub={discountedSub}
        tax={tax}
        total={total}
        settings={settings}
        note={note}
        setNote={setNote}
        rush={rush}
        setRush={setRush}
        setSplitModal={setSplitModal}
        error={error}
        placeOrder={placeOrder}
        placing={placing}
        clearCart={clearCart}
        showCart={showCart}
        setShowCart={setShowCart}
      />

      {/* Mobile: floating button to open the cart overlay */}
      {!showCart && (
        <button
          onClick={() => setShowCart(true)}
          className="md:hidden fixed bottom-4 inset-x-4 z-30 py-3.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2"
        >
          🛒 السلة{cartCount > 0 ? ` · ${cartCount}` : ''}{cart.length > 0 ? ` · ${fmtC(total)}` : ''}
        </button>
      )}

      {/* Modals */}
      {modifierModal && (
        <ModifierSelectModal
          item={modifierModal.item}
          groups={modifierModal.groups}
          currency={currency}
          onConfirm={(mods) => { addToCart(modifierModal.item, mods); setModifierModal(null) }}
          onClose={() => setModifierModal(null)}
        />
      )}

      {payModal && (
        <PaymentModal
          order={payModal}
          currency={currency}
          onConfirm={handlePayment}
          onClose={() => setPayModal(null)}
        />
      )}

      {splitModal && (
        <SplitBillModal
          cart={cart}
          subtotal={discountedSub}
          tax={tax}
          total={total}
          currency={currency}
          onClose={() => setSplitModal(false)}
          onAllPaid={() => setSplitModal(false)}
        />
      )}

      {receiptData && (
        <ReceiptModal
          order={receiptData}
          settings={settings}
          onClose={() => setReceiptData(null)}
        />
      )}
    </div>
  )
}
