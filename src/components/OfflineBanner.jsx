// OfflineBanner — shows when the browser loses network connectivity.
// Also manages the IndexedDB offline queue and syncs it when back online.
import React, { useEffect, useRef, useState } from 'react'

const DB_NAME = 'automatic_offline'
const STORE   = 'offlineOrders'

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
function openQueue() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'localId', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

function getAllQueued(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const r  = tx.objectStore(STORE).getAll()
    r.onsuccess = () => resolve(r.result)
    r.onerror   = () => reject(r.error)
  })
}

function deleteQueued(db, localId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const r  = tx.objectStore(STORE).delete(localId)
    r.onsuccess = () => resolve()
    r.onerror   = () => reject(r.error)
  })
}

export async function enqueueOfflineOrder(orderPayload) {
  const db = await openQueue()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).add({ ...orderPayload, queued_at: Date.now() })
    req.onsuccess = () => { db.close(); resolve(req.result) }
    req.onerror   = () => { db.close(); reject(req.error) }
  })
}

export async function getQueueLength() {
  const db  = await openQueue()
  const all = await getAllQueued(db)
  db.close()
  return all.length
}

export async function syncQueue() {
  if (!navigator.onLine) return 0
  const db   = await openQueue()
  const rows = await getAllQueued(db)
  let synced = 0
  for (const row of rows) {
    try {
      const { localId, queued_at, ...body } = row
      const res = await fetch('/api/orders', {
        method:      'POST',
        credentials: 'include',           // use httpOnly cookie auth — no localStorage token needed
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(body),
      })
      if (res.ok) {
        await deleteQueued(db, localId)
        synced++
      } else if (res.status >= 400 && res.status < 500) {
        // Client-side error (invalid payload, item deleted, etc.) — discard the
        // order so it doesn't block the queue forever; log for audit trail.
        const detail = await res.json().catch(() => ({}))
        console.warn('[offline-queue] Dropping invalid queued order', localId, res.status, detail.error)
        await deleteQueued(db, localId)
      }
      // On 5xx or network error, leave in queue and retry next time
    } catch { /* still offline or server error — leave in queue */ }
  }
  db.close()
  return synced
}

// ── OfflineBanner component ───────────────────────────────────────────────────
export default function OfflineBanner() {
  const [offline,  setOffline]  = useState(!navigator.onLine)
  const [queued,   setQueued]   = useState(0)
  const [syncing,  setSyncing]  = useState(false)
  const [synced,   setSynced]   = useState(null)
  const timerRef = useRef(null)

  const refreshCount = async () => {
    try { setQueued(await getQueueLength()) } catch {}
  }

  const doSync = async () => {
    setSyncing(true)
    setSynced(null)
    try {
      const n = await syncQueue()
      setSynced(n)
      await refreshCount()
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    refreshCount()
    const onOnline  = () => { setOffline(false); doSync() }
    const onOffline = () => { setOffline(true);  refreshCount() }
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    // Periodic count refresh
    timerRef.current = setInterval(refreshCount, 10000)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(timerRef.current)
    }
  }, [])

  if (!offline && queued === 0) return null

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-medium transition-all ${
      offline ? 'bg-red-900/90 border border-red-500/40 text-red-200' : 'bg-amber-900/90 border border-amber-500/40 text-amber-200'
    }`}>
      <span className="text-lg">{offline ? '📡' : '⚠️'}</span>
      <span>
        {offline
          ? `Offline — ${queued > 0 ? `${queued} order${queued > 1 ? 's' : ''} queued` : 'orders will be queued'}`
          : `${queued} queued order${queued > 1 ? 's' : ''} pending sync`}
      </span>
      {!offline && queued > 0 && (
        <button onClick={doSync} disabled={syncing}
          className="ml-2 px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs transition-colors">
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      )}
      {synced !== null && <span className="text-green-400 text-xs">✓ {synced} synced</span>}
    </div>
  )
}
