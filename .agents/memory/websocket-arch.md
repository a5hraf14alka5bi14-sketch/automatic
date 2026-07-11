---
name: WebSocket architecture
description: How real-time WebSocket updates are implemented — server setup, Vite proxy, and client fallback pattern.
---

## Rule
Use `ws` npm package attached to `http.createServer(app)` — NOT directly to `app`. Vite must proxy `/ws` with `ws: true`.

## Setup
- `server/events.js`: `initWebSocketServer(server)` + `broadcast(type, data)`
- `server/index.js`: `const server = http.createServer(app)` then `server.listen(...)` and call `initWebSocketServer(server)` inside listen callback
- `vite.config.js`: add `'/ws': { target: 'ws://localhost:3001', ws: true, changeOrigin: true }` proxy entry
- Browser URL: `` `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws` ``

## Client pattern (Kitchen.jsx)
Connect on mount → on close: start 10s polling + schedule reconnect in 5s → on open: stop polling. `ws.onclose = null` before `ws.close()` in cleanup to prevent spurious reconnect.

## Events broadcast from orders.js
- `order_created` → after POST /api/orders COMMIT
- `order_updated` → after PATCH /api/orders/:id/status COMMIT

**Why:** Port 3001 is not directly browser-accessible in Replit's proxied environment; the Vite proxy `/ws` path is the only way to reach the WS server from the browser.

**How to apply:** Any new real-time feature follows the same broadcast pattern — import `broadcast` from `../events.js` in the relevant route.
