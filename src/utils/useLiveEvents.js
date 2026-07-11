import { useEffect, useRef } from 'react'
import { wsUrl } from '../config.js'

// Shared live-events hook: subscribes to the app WebSocket (/ws) and invokes
// `onEvent(msg)` for every parsed message. Reconnects automatically (5s).
// `types` (optional array) filters which msg.type values trigger the handler.
// The handler is kept in a ref so callers can pass inline functions safely.
export function useLiveEvents(onEvent, types = null) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent
  const typesRef = useRef(types)
  typesRef.current = types

  useEffect(() => {
    let ws = null
    let reconnectTimer = null
    let closed = false

    function connect() {
      if (closed) return
      try {
        ws = new WebSocket(wsUrl('/ws'))
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data)
            const t = typesRef.current
            if (t && !t.includes(msg.type)) return
            handlerRef.current?.(msg)
          } catch { /* non-JSON frame */ }
        }
        ws.onclose = () => {
          ws = null
          if (!closed) reconnectTimer = setTimeout(connect, 5000)
        }
        ws.onerror = () => { try { ws?.close() } catch {} }
      } catch {
        if (!closed) reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()
    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      try { ws?.close() } catch {}
    }
  }, [])
}

// Debounce helper for refetch storms (several events in quick succession).
export function useDebouncedCallback(fn, delay = 800) {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timerRef = useRef(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return useRef((...args) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { timerRef.current = null; fnRef.current(...args) }, delay)
  }).current
}
