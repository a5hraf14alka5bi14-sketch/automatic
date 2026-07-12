import React, { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../utils/api.js'
import { enqueueOfflineOrder } from '../components/OfflineBanner.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useSettings } from '../context/SettingsContext.jsx'
import ReceiptModal from '../components/ReceiptModal.jsx'
import { CATS, stationForCategory } from '../components/pos/constants.js'
import ModifierSelectModal from '../components/pos/ModifierSelectModal.jsx'
import PaymentModal from '../components/pos/PaymentModal.jsx'
import SplitBillModal from '../components/pos/SplitBillModal.jsx'
import MenuPanel from '../components/pos/MenuPanel.jsx'
import CartPanel from '../components/pos/CartPanel.jsx'
import TablesView from '../components/pos/TablesView.jsx'
import { useCart } from '../hooks/useCart.js'
import { useLiveEvents, useDebouncedCallback } from '../utils/useLiveEvents.js'

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
  const [tableNum, setTableNum] = useState(null) // dine-in requires an explicit table choice
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

  // ── Branch selection — persisted in localStorage, defaults to the marked-default branch ──
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState(null)

  // ── Load initial data ──────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [menuRes, custRes, settingsRes, availRes, branchRes] = await Promise.all([
        apiFetch('/api/menu/all'),
        apiFetch('/api/customers'),
        apiFetch('/api/settings'),
        apiFetch('/api/menu/stock-availability'),
        apiFetch('/api/branches'),
      ])
      const [menuData, custData, settingsData, availData, branchData] = await Promise.all([
        menuRes.json(), custRes.json(), settingsRes.json(), availRes.json(), branchRes.json(),
      ])
      setMenu(Array.isArray(menuData) ? menuData.filter(m => m.available) : [])
      setCustomers(Array.isArray(custData) ? custData : [])
      if (settingsData && !settingsData.error) setSettings(s => ({ ...s, ...settingsData }))
      setStockAvail(availData && !availData.error ? availData : {})
      if (Array.isArray(branchData) && branchData.length) {
        setBranches(branchData)
        // Restore last-used branch from localStorage; fall back to the default branch.
        const saved = parseInt(localStorage.getItem('pos_branch_id') || '0')
        const match = saved && branchData.find(b => b.id === saved)
        setBranchId(match ? match.id : (branchData.find(b => b.is_default)?.id || branchData[0]?.id || null))
      }
    } catch (e) { showToast('Failed to load POS data', 'error') }
    setLoading(false)
  }, [showToast])

  useEffect(() => { loadData() }, [loadData])

  // Refetch max-sellable counts so POS warnings stay accurate after a sale
  // deducts stock. Silent — never surfaces an error toast on this refresh.
  const refreshStockAvail = useCallback(async () => {
    try {
      const res = await apiFetch('/api/menu/stock-availability')
      const data = await res.json()
      if (res.ok && data && !data.error) setStockAvail(data)
    } catch { /* keep last known availability on transient failure */ }
  }, [])

  // ── Barcode lookup + add-to-cart (shared by HID wedge and native camera) ───
  // Looks up an item by barcode and pushes it to the cart. Used by both the
  // keyboard-wedge scanner (web/desktop) and the native camera scanner (mobile).
  // A ref keeps the latest handleItemClick (which closes over cart/stockAvail)
  // visible without re-creating the callback (re-creating would re-register
  // the wedge listener and reset the in-progress scan buffer).
  const handleItemRef = useRef(null)

  const addByBarcode = useCallback(async (rawCode) => {
    const code = String(rawCode || '').trim()
    if (code.length < 3) return
    try {
      const res = await apiFetch(`/api/menu/barcode/${encodeURIComponent(code)}`)
      if (res.ok) {
        const item = await res.json()
        if (item?.available) {
          // Shared item path: identical to tapping the item — items with
          // modifier groups open the modifier picker; plain items go straight
          // to the cart with the same line-key merging and warn-but-never-block
          // low-stock check (useCart.addToCart).
          const outcome = await handleItemRef.current(item)
          if (outcome === 'added') showToast(`📦 ${item.name} added via barcode`, 'success')
          else if (outcome === 'modal') showToast(`📦 ${item.name} — choose add-ons`, 'success')
          else if (outcome === 'busy') showToast(`⏳ جاري تحميل الإضافات — أعد المسح · Loading add-ons, scan again`, 'error')
        } else {
          showToast('Item not available', 'error')
        }
      } else {
        showToast(`Barcode not found: ${code}`, 'error')
      }
    } catch {
      showToast(`Barcode scan failed: ${code} — network error`, 'error')
    }
  }, [showToast])

  // ── Barcode scanner support (HID keyboard-wedge) ──────────────────────────
  // Accumulates rapid key presses (< 80 ms apart); on Enter or pause, looks up
  // by barcode and adds to cart. Ignores when focus is on an input/textarea.
  useEffect(() => {
    let buffer = ''
    let lastAt = 0

    const onKey = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      // Don't intercept when user is typing in an input / textarea / select
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      const now = Date.now()
      if (now - lastAt > 80) buffer = '' // reset on slow typing
      lastAt = now

      if (e.key === 'Enter') {
        const code = buffer.trim()
        buffer = ''
        addByBarcode(code)
        return
      }

      if (e.key.length === 1) buffer += e.key
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addByBarcode])

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

  // ── Live updates ───────────────────────────────────────────────────────────
  // Menu edits refresh the menu instantly; order/inventory activity refreshes
  // max-sellable stock warnings; open-table view refreshes on order events.
  const viewRef = useRef(view)
  viewRef.current = view
  const liveMenuRefresh = useDebouncedCallback(loadData, 800)
  const liveStockRefresh = useDebouncedCallback(refreshStockAvail, 800)
  const liveTablesRefresh = useDebouncedCallback(() => {
    if (viewRef.current === 'tables') fetchOpenOrders()
  }, 800)
  useLiveEvents((msg) => {
    if (msg.type === 'menu_updated') liveMenuRefresh()
    if (msg.type === 'inventory_updated' || msg.type === 'order_updated' || msg.type === 'order_created') liveStockRefresh()
    if (msg.type === 'order_updated' || msg.type === 'order_created') liveTablesRefresh()
  }, ['menu_updated', 'inventory_updated', 'order_updated', 'order_created'])

  // ── Computed values ────────────────────────────────────────────────────────
  const tablesCount = parseInt(settings.tables_count || '10')
  const currency = settings.currency_symbol || 'OMR'
  const fmtC = (amount) => `${currency} ${parseFloat(amount || 0).toFixed(3)}`

  // ── Menu filtering ─────────────────────────────────────────────────────────
  const filtered = menu.filter(item => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false
    if (search) return item.name.toLowerCase().includes(search.toLowerCase()) || (item.name_ar || '').includes(search) || (item.tags || '').toLowerCase().includes(search.toLowerCase())
    return true
  })

  // ── Cart operations ────────────────────────────────────────────────────────
  // cart state + addToCart/updateQty/removeItem live in the useCart hook.
  // Returns 'added' (item went straight to cart) or 'modal' (modifier picker
  // opened) so the barcode path can toast accordingly.
  const handleItemClick = async (item) => {
    if (modifierLoading) return 'busy'
    const cached = modifierCache.current[item.id]
    if (cached !== undefined) {
      if (cached.length === 0) { addToCart(item, []); return 'added' }
      setModifierModal({ item, groups: cached })
      return 'modal'
    }
    setModifierLoading(true)
    let outcome
    try {
      const res = await apiFetch(`/api/menu/${item.id}/modifier-groups`)
      const groups = await res.json()
      const validGroups = Array.isArray(groups) ? groups.filter(g => g.modifiers && g.modifiers.length > 0) : []
      modifierCache.current[item.id] = validGroups
      if (validGroups.length === 0) { addToCart(item, []); outcome = 'added' }
      else { setModifierModal({ item, groups: validGroups }); outcome = 'modal' }
    } catch {
      modifierCache.current[item.id] = []
      addToCart(item, [])
      outcome = 'added'
    }
    setModifierLoading(false)
    return outcome
  }
  handleItemRef.current = handleItemClick

  // Clears the cart (via the hook) plus the order-level context fields.
  const clearCart = () => {
    cartClear()
    setNote(''); setCustomerId(''); setRush(false)
    setTableNum(null) // next dine-in order must pick its table explicitly
  }

  // ── Place order ────────────────────────────────────────────────────────────
  const placeOrder = async () => {
    if (cart.length === 0) return
    if (orderType === 'dine-in' && !tableNum) {
      setError('اختر رقم الطاولة أولاً · Choose a table first')
      return
    }
    setPlacing(true); setError('')

    const payload = {
      type: orderType,
      table_number: orderType === 'dine-in' ? tableNum : null,
      customer_id: customerId ? parseInt(customerId) : null,
      notes: note.trim() || null,
      rush,
      branch_id: branchId || null,
      discount: parseFloat(discountVal.toFixed(3)),
      discount_type: discount.type,
      items: cart.map(c => ({
        menu_item_id: c.id,
        quantity: c.qty,
        price: parseFloat(c.price),
        name: c.name,
        modifiers: c.modifiers || [],
        item_notes: itemNotes[c.cartId] || null,
        // Menu items pinned to a managed station win; otherwise route by category.
        station: c.station || stationForCategory(c.category),
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
        name: c.name, name_ar: c.name_ar || null, quantity: c.qty, price: parseFloat(c.price),
        modifiers: c.modifiers || [], notes: itemNotes[c.cartId] || null,
        station: c.station || stationForCategory(c.category),
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
      refreshStockAvail()
    } catch (err) { showToast(err.message, 'error') }
  }

  // ── Tables view handlers ───────────────────────────────────────────────────
  const tableUpdateStatus = async (orderId, status) => {
    try {
      await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH', body: JSON.stringify({ status })
      })
      fetchOpenOrders()
      // Completing/cancelling a table order changes stock — keep warnings fresh
      if (status === 'completed' || status === 'cancelled') refreshStockAvail()
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
        onScan={addByBarcode}
      />

      {/* ── Right: Cart + Order ────────────────────────────────────────── */}
      <CartPanel
        orderType={orderType}
        setOrderType={setOrderType}
        tableNum={tableNum}
        selectTable={(n) => { setTableNum(n); setError('') }}
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
        branches={branches}
        branchId={branchId}
        setBranchId={setBranchId}
      />

      {/* Mobile: floating button to open the cart overlay */}
      {!showCart && (
        <button
          onClick={() => setShowCart(true)}
          className="md:hidden fixed inset-x-4 z-30 py-3.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2"
          style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
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
          onSplit={() => { const o = payModal; setPayModal(null); setSplitModal(o) }}
        />
      )}

      {splitModal && (
        <SplitBillModal
          cart={cart}
          subtotal={typeof splitModal === 'object' ? parseFloat(splitModal.subtotal) : discountedSub}
          tax={typeof splitModal === 'object' ? parseFloat(splitModal.tax) : tax}
          total={typeof splitModal === 'object' ? parseFloat(splitModal.total) : total}
          currency={currency}
          order={typeof splitModal === 'object' ? splitModal : null}
          onClose={() => setSplitModal(false)}
          onAllPaid={(payments) => {
            const o = typeof splitModal === 'object' ? splitModal : null
            setSplitModal(false)
            if (o) {
              showToast('Payment confirmed! 🎉', 'success')
              setReceiptData({ ...o, payment_method: 'split', split_payments: payments, paid_at: new Date().toISOString() })
              refreshLowStock()
              refreshStockAvail()
            }
          }}
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
