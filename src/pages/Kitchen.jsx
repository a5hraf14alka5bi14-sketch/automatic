import React, { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'

// ── Sound alert (Web Audio API, no external files) ────────────────────────────
function playBeep(freq = 880, dur = 0.15, vol = 0.4) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'; osc.frequency.value = freq
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start(); osc.stop(ctx.currentTime + dur)
    ctx.close().catch(() => {})
  } catch {}
}
function playNewOrderAlert() {
  playBeep(880, 0.15); setTimeout(() => playBeep(1047, 0.2), 200)
}

// ── Elapsed time ──────────────────────────────────────────────────────────────
function elapsed(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 60000)
  if (diff < 1) return { label: 'just now', color: 'text-slate-400', urgent: false }
  if (diff < 10) return { label: `${diff}m`, color: 'text-slate-400', urgent: false }
  if (diff < 20) return { label: `${diff}m ⚠️`, color: 'text-yellow-400', urgent: true }
  return { label: `${diff}m 🔴`, color: 'text-red-400', urgent: true }
}

const COL_CONFIG = {
  pending: {
    title: 'New Orders', dot: 'bg-yellow-400', titleColor: 'text-yellow-400',
    actions: [
      { label: '▶ Start Preparing', to: 'preparing', style: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30' },
      { label: '✕ Cancel', to: 'cancelled', style: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' }
    ]
  },
  preparing: {
    title: 'Preparing', dot: 'bg-blue-400', titleColor: 'text-blue-400',
    actions: [
      { label: '✓ Mark Ready', to: 'ready', style: 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30' }
    ]
  },
  ready: {
    title: 'Ready to Serve', dot: 'bg-green-400', titleColor: 'text-green-400',
    actions: [
      { label: '💳 Complete', to: 'completed', style: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/30' }
    ]
  }
}

// ── Kitchen Card ──────────────────────────────────────────────────────────────
function KitchenCard({ order, actions, onAction, onToggleItemDone, onToggleRush }) {
  const time = elapsed(order.created_at)
  const items = Array.isArray(order.items) ? order.items : []
  const allDone = items.length > 0 && items.every(i => i.done)

  return (
    <div className={`bg-slate-900 border rounded-xl p-4 transition-all ${
      order.rush ? 'border-red-500 shadow-lg shadow-red-500/20' :
      time.urgent ? 'border-yellow-500/40' : 'border-slate-800'
    }`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <p className="text-white font-bold text-lg">#{order.id}</p>
          {order.rush && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
              🔴 RUSH
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${time.color}`}>{time.label}</span>
          <button
            onClick={() => onToggleRush(order.id, !order.rush)}
            title={order.rush ? 'Remove rush' : 'Mark as rush'}
            className={`w-6 h-6 rounded text-xs transition-colors ${
              order.rush ? 'bg-red-500/30 text-red-400 hover:bg-red-500/50' : 'bg-slate-800 text-slate-600 hover:text-red-400 hover:bg-red-500/20'
            }`}
          >🚨</button>
        </div>
      </div>

      <p className="text-slate-500 text-xs capitalize mb-3">
        {order.type}{order.table_number ? ` · Table ${order.table_number}` : ''}
      </p>

      {/* Items with done checkboxes */}
      {items.length > 0 ? (
        <div className="space-y-2 mb-3">
          {items.map((item, i) => (
            <div key={item.id || i} className={`transition-opacity ${item.done ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-2 text-sm">
                <button
                  onClick={() => onToggleItemDone(order.id, item.id, !item.done)}
                  className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                    item.done
                      ? 'bg-green-500 border-green-500'
                      : 'border-slate-600 hover:border-green-400'
                  }`}
                >
                  {item.done && <span className="text-white text-xs leading-none">✓</span>}
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-400 font-bold w-5 flex-shrink-0">{item.quantity}×</span>
                    <span className={`text-white ${item.done ? 'line-through' : ''}`}>{item.name}</span>
                  </div>
                  {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                    <div className="pl-7 mt-0.5 space-y-0.5">
                      {item.modifiers.map((m, mi) => (
                        <p key={mi} className="text-slate-400 text-xs">· {m.name}</p>
                      ))}
                    </div>
                  )}
                  {item.item_notes && (
                    <p className="pl-7 text-yellow-300/70 text-xs italic mt-0.5">↳ {item.item_notes}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-slate-600 text-xs mb-3">{order.items_count} item(s)</p>
      )}

      {/* Order notes */}
      {order.notes && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2.5 py-1.5 mb-3">
          <p className="text-yellow-300 text-xs italic">📝 {order.notes}</p>
        </div>
      )}

      {/* Action buttons — highlight Mark Ready when all items done */}
      <div className="flex gap-2">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={() => onAction(order.id, a.to)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${a.style} ${
              allDone && a.to === 'ready' ? 'ring-2 ring-green-400 ring-offset-1 ring-offset-slate-900' : ''
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main Kitchen Component ────────────────────────────────────────────────────
export default function Kitchen() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [wsStatus, setWsStatus] = useState('connecting')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('kds_sound') !== 'off' } catch { return true }
  })
  const [station, setStation] = useState('all')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const wsRef = useRef(null)
  const pollRef = useRef(null)
  const reconnectRef = useRef(null)
  const prevOrderIdsRef = useRef(new Set())

  const fetchOrders = useCallback(async () => {
    try {
      const url = station === 'all'
        ? '/api/orders?status=pending,preparing,ready'
        : `/api/orders?status=pending,preparing,ready&station=${station}`
      const res = await apiFetch(url)
      const data = await res.json()
      const newOrders = Array.isArray(data) ? data : []

      // Detect truly new orders for sound alert
      const newIds = new Set(newOrders.map(o => o.id))
      const added = [...newIds].filter(id => !prevOrderIdsRef.current.has(id))
      if (added.length > 0 && prevOrderIdsRef.current.size > 0 && soundEnabled) {
        playNewOrderAlert()
      }
      prevOrderIdsRef.current = newIds

      setOrders(newOrders)
      setLastUpdate(new Date())
    } catch (err) {
      console.error('[kitchen] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [station, soundEnabled])

  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(fetchOrders, 10000)
    setWsStatus('polling')
  }, [fetchOrders])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => {
    fetchOrders()
    function connect() {
      try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
        const ws = new WebSocket(`${proto}//${location.host}/ws`)
        wsRef.current = ws
        ws.onopen = () => { setWsStatus('live'); stopPolling() }
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data)
            if (msg.type === 'order_created') {
              if (soundEnabled) playNewOrderAlert()
              fetchOrders()
            } else if (msg.type === 'order_updated') {
              fetchOrders()
            }
          } catch {}
        }
        ws.onclose = () => { wsRef.current = null; startPolling(); reconnectRef.current = setTimeout(connect, 5000) }
        ws.onerror = () => ws.close()
      } catch { startPolling() }
    }
    connect()
    return () => {
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close() }
      if (pollRef.current) clearInterval(pollRef.current)
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
    }
  }, [fetchOrders, startPolling, stopPolling, soundEnabled])

  // Refetch when station filter changes
  useEffect(() => { fetchOrders() }, [station])

  const updateStatus = async (id, status) => {
    try {
      await apiFetch(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      if (wsStatus !== 'live') fetchOrders()
    } catch (err) { console.error(err) }
  }

  const toggleItemDone = async (orderId, itemId, done) => {
    try {
      await apiFetch(`/api/orders/${orderId}/items/${itemId}/done`, {
        method: 'PATCH', body: JSON.stringify({ done })
      })
      setOrders(prev => prev.map(o => o.id === orderId
        ? { ...o, items: (o.items || []).map(it => it.id === itemId ? { ...it, done } : it) }
        : o
      ))
    } catch (err) { console.error(err) }
  }

  const toggleRush = async (orderId, rush) => {
    try {
      await apiFetch(`/api/orders/${orderId}/rush`, { method: 'PATCH', body: JSON.stringify({ rush }) })
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, rush } : o))
    } catch (err) { console.error(err) }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  // Sort: rush orders first, then by created_at
  const byStatus = {
    pending:   orders.filter(o => o.status === 'pending').sort((a,b) => b.rush - a.rush),
    preparing: orders.filter(o => o.status === 'preparing').sort((a,b) => b.rush - a.rush),
    ready:     orders.filter(o => o.status === 'ready').sort((a,b) => b.rush - a.rush),
  }

  const totalActive = orders.length
  const rushCount = orders.filter(o => o.rush).length

  const StatusDot = () => (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
      wsStatus === 'live' ? 'bg-green-500/15 text-green-400' :
      wsStatus === 'polling' ? 'bg-yellow-500/15 text-yellow-400' :
      'bg-slate-700 text-slate-400'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        wsStatus === 'live' ? 'bg-green-400 animate-pulse' :
        wsStatus === 'polling' ? 'bg-yellow-400' : 'bg-slate-500'
      }`} />
      {wsStatus === 'live' ? 'Live' : wsStatus === 'polling' ? 'Polling' : 'Connecting'}
    </span>
  )

  if (loading) return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Kitchen Display</h1>
      <div className="grid grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse h-36" />
        ))}
      </div>
    </div>
  )

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-3">
            Kitchen Display
            {rushCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                {rushCount} RUSH
              </span>
            )}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-slate-400 text-sm">{totalActive} active order{totalActive !== 1 ? 's' : ''}</p>
            <StatusDot />
            {lastUpdate && <span className="text-slate-600 text-xs">· {lastUpdate.toLocaleTimeString()}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Station filter */}
          <div className="flex bg-slate-800 rounded-lg p-0.5 gap-0.5">
            {[['all','All'],['kitchen','🍳 Kitchen'],['bar','🥤 Bar']].map(([v,l]) => (
              <button key={v} onClick={() => setStation(v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  station === v ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}>
                {l}
              </button>
            ))}
          </div>

          {/* Sound toggle */}
          <button
            onClick={() => {
              const next = !soundEnabled
              setSoundEnabled(next)
              try { localStorage.setItem('kds_sound', next ? 'on' : 'off') } catch {}
            }}
            title={soundEnabled ? 'Mute alerts' : 'Enable alerts'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              soundEnabled ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-slate-800 text-slate-500 border border-slate-700'
            }`}
          >
            {soundEnabled ? '🔔' : '🔕'}
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-700"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen mode'}
          >
            {isFullscreen ? '⛶' : '⛶'}
          </button>

          <button onClick={fetchOrders} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors border border-slate-700">
            ↻
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-3 gap-4 flex-1 overflow-auto">
        {Object.entries(COL_CONFIG).map(([status, cfg]) => (
          <div key={status} className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
              <h2 className={`font-semibold text-sm ${cfg.titleColor}`}>
                {cfg.title}
                <span className="ml-1.5 text-slate-600 font-normal">({byStatus[status].length})</span>
              </h2>
            </div>
            <div className="space-y-3 overflow-auto pr-1">
              {byStatus[status].length === 0 ? (
                <div className="border-2 border-dashed border-slate-800 rounded-xl p-8 text-center">
                  <p className="text-slate-700 text-sm">Empty</p>
                </div>
              ) : byStatus[status].map(o => (
                <KitchenCard
                  key={o.id}
                  order={o}
                  actions={cfg.actions}
                  onAction={updateStatus}
                  onToggleItemDone={toggleItemDone}
                  onToggleRush={toggleRush}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
