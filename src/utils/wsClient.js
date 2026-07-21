/**
 * Shared WebSocket singleton.
 *
 * Maintains exactly ONE connection per browser session regardless of how many
 * components subscribe. Components subscribe by calling subscribeMessages() or
 * subscribeStatus() and are handed back an unsubscribe function.
 *
 * Status values: 'connecting' | 'live' | 'closed'
 * (Callers that want a 'polling' label should derive it from 'closed'.)
 */
import { wsUrl } from '../config.js'

let ws          = null
let msgSubs     = new Set()   // Set<fn(msg)>
let statusSubs  = new Set()   // Set<fn(status)>
let reconnTimer = null
let _status     = 'connecting'

function setStatus(s) {
  if (_status === s) return
  _status = s
  for (const fn of statusSubs) try { fn(s) } catch (_) {}
}

function connect() {
  if (ws && ws.readyState < 2) return   // already CONNECTING or OPEN
  if (reconnTimer) { clearTimeout(reconnTimer); reconnTimer = null }
  try {
    ws = new WebSocket(wsUrl('/ws'))
    setStatus('connecting')
    ws.onopen = () => setStatus('live')
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        for (const fn of msgSubs) try { fn(msg) } catch (_) {}
      } catch (_) {}
    }
    ws.onclose = () => {
      ws = null
      setStatus('closed')
      if (msgSubs.size > 0 || statusSubs.size > 0)
        reconnTimer = setTimeout(connect, 5000)
    }
    ws.onerror = () => { try { ws?.close() } catch (_) {} }
  } catch (_) {
    setStatus('closed')
    if (msgSubs.size > 0 || statusSubs.size > 0)
      reconnTimer = setTimeout(connect, 5000)
  }
}

/** Subscribe to all incoming WebSocket messages. Returns unsubscribe fn. */
export function subscribeMessages(fn) {
  msgSubs.add(fn)
  if (!ws || ws.readyState > 1) connect()
  return () => msgSubs.delete(fn)
}

/**
 * Subscribe to connection-status changes. The handler is called immediately
 * with the current status, then on every future change. Returns unsubscribe fn.
 */
export function subscribeStatus(fn) {
  statusSubs.add(fn)
  try { fn(_status) } catch (_) {}
  return () => statusSubs.delete(fn)
}

/** Synchronously read the current status without subscribing. */
export function getWsStatus() { return _status }
