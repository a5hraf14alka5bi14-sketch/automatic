import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import { SECRET, ACCESS_COOKIE } from './config/secret.js'

let wss = null
const clients = new Set()

function parseCookies(header = '') {
  const out = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

function verifyClient(info, done) {
  try {
    const cookies = parseCookies(info.req.headers.cookie)
    const token = cookies[ACCESS_COOKIE]
    if (!token) return done(false, 401, 'Unauthorized')
    jwt.verify(token, SECRET)
    return done(true)
  } catch {
    return done(false, 401, 'Unauthorized')
  }
}

export function initWebSocketServer(server) {
  wss = new WebSocketServer({ server, path: '/ws', verifyClient })

  wss.on('connection', (ws, req) => {
    clients.add(ws)
    ws.isAlive = true

    ws.on('pong', () => { ws.isAlive = true })
    ws.on('close', () => clients.delete(ws))
    ws.on('error', () => clients.delete(ws))

    try {
      ws.send(JSON.stringify({ type: 'connected', ts: Date.now() }))
    } catch {}

    console.log(`[ws] Client connected. Active: ${clients.size}`)
  })

  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (!ws.isAlive) { ws.terminate(); clients.delete(ws); continue }
      ws.isAlive = false
      ws.ping()
    }
  }, 30000)

  if (heartbeat.unref) heartbeat.unref()
  console.log('[ws] WebSocket server ready on /ws')
}

export function broadcast(type, data = {}) {
  if (!clients.size) return
  const msg = JSON.stringify({ type, data, ts: Date.now() })
  for (const ws of clients) {
    if (ws.readyState === 1) {
      try { ws.send(msg) } catch { clients.delete(ws) }
    }
  }
}
