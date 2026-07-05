import React, { useState } from 'react'
import { apiFetch } from '../../utils/api.js'
import { useToast } from '../../context/ToastContext.jsx'
import { INT_API, fmt } from './notionShared.jsx'

export default function SyncPanel({ syncStatus, autoSync, onSyncNow, syncing, onAutoSyncChange, cooldown }) {
  const showToast = useToast()
  const cooling = cooldown?.cooling
  const remaining = cooldown?.remaining
  const [intervalMin, setIntervalMin] = useState(autoSync?.interval_minutes || 15)
  const [savingAuto, setSavingAuto] = useState(false)

  const lastSuccess = syncStatus?.last_success
  const logs = syncStatus?.logs || []

  const toggleAutoSync = async (enable) => {
    setSavingAuto(true)
    try {
      const r = await apiFetch(`${INT_API}/notion/auto-sync`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: enable, interval_minutes: intervalMin })
      })
      if (!r.ok) throw new Error('Request failed')
      const d = await r.json()
      if (onAutoSyncChange) onAutoSyncChange(d)
    } catch {
      showToast(`Couldn\u2019t ${enable ? 'enable' : 'stop'} auto-sync. Check your connection and try again.`, 'error')
    }
    setSavingAuto(false)
  }

  const handleIntervalChange = async (mins) => {
    const prev = intervalMin
    setIntervalMin(mins)
    // Only auto-sync-while-running needs an explicit save path; when disabled the
    // interval is persisted later as part of enabling auto-sync.
    if (!autoSync?.running) return
    setSavingAuto(true)
    try {
      const r = await apiFetch(`${INT_API}/notion/auto-sync`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: true, interval_minutes: mins })
      })
      if (!r.ok) throw new Error('Request failed')
      const d = await r.json()
      if (onAutoSyncChange) onAutoSyncChange(d)
      showToast(`Auto-sync interval updated to ${mins < 60 ? `${mins} min` : `${mins / 60}h`}.`, 'success')
    } catch {
      setIntervalMin(prev)
      showToast('Couldn\u2019t update the auto-sync interval. Check your connection and try again.', 'error')
    }
    setSavingAuto(false)
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${syncing ? 'bg-orange-400 animate-pulse' : lastSuccess ? 'bg-green-500' : 'bg-slate-600'}`} />
            Notion ↔ Database Sync
          </h3>
          {lastSuccess ? (
            <p className="text-slate-500 text-xs mt-0.5">
              Last sync: <span className="text-slate-300">{fmt(lastSuccess.created_at)}</span>
              <span className="ml-2 text-green-500/70">· {lastSuccess.items_synced} items</span>
            </p>
          ) : (
            <p className="text-slate-600 text-xs mt-0.5">Never synced</p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onSyncNow('projects')} disabled={syncing || cooling}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-medium transition-colors">
            {cooling ? `Wait ${remaining}s` : <>{syncing === 'projects' ? <span className="animate-spin inline-block">↻</span> : '↻'} Projects</>}
          </button>
          <button onClick={() => onSyncNow('tasks')} disabled={syncing || cooling}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-medium transition-colors">
            {cooling ? `Wait ${remaining}s` : <>{syncing === 'tasks' ? <span className="animate-spin inline-block">↻</span> : '↻'} Tasks</>}
          </button>
          <button onClick={() => onSyncNow('all')} disabled={syncing || cooling}
            className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5">
            {cooling ? `Wait ${remaining}s` : <><span className={syncing === 'all' ? 'animate-spin inline-block' : ''}>⟳</span>Sync All</>}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-800">
        <div>
          <p className="text-white text-xs font-medium">Auto-Sync</p>
          <p className="text-slate-500 text-xs mt-0.5">
            {autoSync?.running ? `Running — every ${autoSync.interval_min} min` : 'Disabled'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={intervalMin} onChange={e => handleIntervalChange(parseInt(e.target.value))}
            disabled={savingAuto}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-500 disabled:opacity-40">
            {[5, 10, 15, 30, 60, 120, 360, 720, 1440].map(m => (
              <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60}h`}</option>
            ))}
          </select>
          <button onClick={() => toggleAutoSync(!autoSync?.running)} disabled={savingAuto}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              autoSync?.running
                ? 'bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25'
                : 'bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-green-500/25'
            }`}>
            {savingAuto ? '…' : autoSync?.running ? 'Stop' : 'Enable'}
          </button>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="pt-4 border-t border-slate-800">
          <p className="text-slate-500 text-xs font-medium mb-2">Recent sync history</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {logs.slice(0, 8).map(log => (
              <div key={log.id} className="flex items-center gap-3 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-slate-500 w-32 flex-shrink-0">{fmt(log.created_at)}</span>
                <span className="text-slate-400">
                  {log.status === 'success'
                    ? `${log.items_synced}/${log.items_total} items`
                    : <span className="text-red-400 truncate">{log.error_message}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
