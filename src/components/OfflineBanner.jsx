import React, { useState, useEffect } from 'react'

export default function OfflineBanner() {
  const [offline, setOffline]       = useState(!navigator.onLine)
  const [syncing, setSyncing]       = useState(false)
  const [pendingCount, setPending]  = useState(0)

  useEffect(() => {
    const go  = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online',  go)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', go); window.removeEventListener('offline', off) }
  }, [])

  // Check for queued orders in IndexedDB
  useEffect(() => {
    let interval
    const check = async () => {
      try {
        const db = await openQueue()
        const tx = db.transaction('offlineOrders', 'readonly')
        const count = await idbCount(tx.objectStore('offlineOrders'))
        setPending(count)
        db.close()
      } catch { /* ignore */ }
    }
    check()
    interval = setInterval(check, 3000)
    return () => clearInterval(interval)
  }, [])

  // Auto-sync when back online
  useEffect(() => {
    if (!offline && pendingCount > 0) {
      setSyncing(true)
      syncQueue().then(synced => {
        setSyncing(false)
        if (synced > 0) setPending(0)
      }).catch(() => setSyncing(false))
    }
  }, [offline, pendingCount])

  if (!offline && pendingCount === 0 && !syncing) return null

  return (
    <div className={`fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all ${
      offline ? 'bg-red-600 text-white' : 'bg-amber-500 text-slate-900'
    }`}>
      {offline ? (
        <>
          <span>📡</span>
          <span>لا يوجد اتصال بالإنترنت — لن تُحفظ الطلبات الجديدة</span>
          {pendingCount > 0 && (
            <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs">
              {pendingCount} طلب في الانتظار
            </span>
          )}
        </>
      ) : syncing ? (
        <>
          <span className="animate-spin">⟳</span>
          <span>جاري مزامنة {pendingCount} طلب معلّق…</span>
        </>
      ) : null}
    </div>
  )
}

// ── Lightweight IndexedDB helpers ──────────────────────────────────────────────
function openQueue() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('offline-queue', 1)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('offlineOrders')) {
        db.createObjectStore('offlineOrders', { keyPath: 'localId', autoIncrement: true })
      }
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

function idbCount(store) {
  return new Promise((resolve, reject) => {
    const r = store.count()
    r.onsuccess = () => resolve(r.result)
    r.onerror   = () => reject(r.error)
  })
}

export async function enqueueOfflineOrder(payload) {
  const db = await openQueue()
  const tx = db.transaction('offlineOrders', 'readwrite')
  const r  = tx.objectStore('offlineOrders').add({ ...payload, queued_at: Date.now() })
  return new Promise((res, rej) => {
    r.onsuccess = () => { db.close(); res(r.result) }
    r.onerror   = () => { db.close(); rej(r.error)  }
  })
}

async function getAllQueued(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineOrders', 'readonly')
    const r  = tx.objectStore('offlineOrders').getAll()
    r.onsuccess = () => resolve(r.result)
    r.onerror   = () => reject(r.error)
  })
}

async function deleteQueued(db, localId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineOrders', 'readwrite')
    const r  = tx.objectStore('offlineOrders').delete(localId)
    r.onsuccess = () => resolve()
    r.onerror   = () => reject(r.error)
  })
}

export async function syncQueue() {
  if (!navigator.onLine) return 0
  const db   = await openQueue()
  const rows = await getAllQueued(db)
  let synced = 0
  const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}')
  const authHeader = authUser.token ? { 'Authorization': `Bearer ${authUser.token}` } : {}
  for (const row of rows) {
    try {
      const { localId, queued_at, ...body } = row
      const res = await fetch('/api/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body:    JSON.stringify(body),
      })
      if (res.ok) {
        await deleteQueued(db, localId)
        synced++
      }
    } catch { /* still offline — leave in queue */ }
  }
  db.close()
  return synced
}
