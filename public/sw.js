/* Automatic Restaurant OS — service worker (installability + offline app shell) */
const CACHE = 'auto-os-v2'
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/favicon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Only treat genuine static asset requests as cacheable.
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font'])
const isHtml = (res) => (res.headers.get('content-type') || '').includes('text/html')

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Never touch the API, auth, WebSocket, or cross-origin requests — always live.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return

  // App navigations: network-first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Only cache a real, successful HTML document as the app shell.
          if (res.ok && isHtml(res)) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(request)))
    )
    return
  }

  // Static assets only (hashed JS/CSS/images/fonts): cache-first, then network.
  // Anything else (e.g. an unknown path that the SPA fallback would answer with
  // HTML) is left to the network so we never poison the cache with HTML.
  if (!STATIC_DESTINATIONS.has(request.destination)) return

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((res) => {
        // Guard against caching an HTML fallback under an asset URL.
        if (res.ok && res.type === 'basic' && !isHtml(res)) {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return res
      })
    })
  )
})
