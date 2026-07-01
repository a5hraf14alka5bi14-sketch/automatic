import { WebSocketServer } from 'ws'

let wss = null
const clients = new Set()

export function initWebSocketServer(server) {
  wss = new WebSocketServer({ server, path: '/ws' })

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
