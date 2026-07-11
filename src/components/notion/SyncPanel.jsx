import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../utils/api.js'
import { useToast } from '../../context/ToastContext.jsx'
import { INT_API, fmt } from './notionShared.jsx'

export default function SyncPanel({ syncStatus, autoSync, onSyncNow, syncing, onAutoSyncChange, cooldown }) {
  const showToast = useToast()
  const cooling = cooldown?.cooling
  const remaining = cooldown?.remaining
  const [intervalMin, setIntervalMin] = useState(autoSync?.interval_minutes ?? autoSync?.interval_min ?? 60)
  // Draft string backing the free numeric input, kept separate from the committed
  // interval so admins can clear/retype without the value snapping mid-edit.
  const [intervalDraft, setIntervalDraft] = useState(String(intervalMin))
  const [savingAuto, setSavingAuto] = useState(false)

  // autoSync arrives asynchronously (null on first render), so sync the input
  // from the persisted value once it loads. Prefer interval_minutes (saved
  // setting); fall back to interval_min (live engine) for PUT-response shapes.
  useEffect(() => {
    const saved = autoSync?.interval_minutes ?? autoSync?.interval_min
    if (saved != null) {
      setIntervalMin(saved)
      setIntervalDraft(String(saved))
    }
  }, [autoSync?.interval_minutes, autoSync?.interval_min])

  const lastSuccess = syncStatus?.last_success
  const logs = syncStatus?.logs || []

  // Intervals at or below this threshold are frequent enough to risk burning
  // Notion API quota / hitting rate limits, so we surface a subtle hint.
  const FREQUENT_THRESHOLD = 10
  const isFrequent = intervalMin <= FREQUENT_THRESHOLD

  const toggleAutoSync = async (enable) => {
    setSavingAuto(true)
    try {
      const r = await apiFetch(`${INT_API}/notion/auto-sync`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: enable, interval_minutes: intervalMin })
      })
      if (!r.ok) throw new Error('Request failed')
      const d = await r.json()
      // The server clamps the interval to a 5–1440 min range; silently reflect
      // whatever it actually saved so the dropdown matches reality.
      if (enable && d.interval_minutes != null && d.interval_minutes !== intervalMin) {
        setIntervalMin(d.interval_minutes)
      }
      if (onAutoSyncChange) onAutoSyncChange(d)
    } catch {
      showToast(`Couldn\u2019t ${enable ? 'enable' : 'stop'} auto-sync. Check your connection and try again.`, 'error')
    }
    setSavingAuto(false)
  }

  const PRESETS = [5, 15, 30, 60, 120, 360, 720, 1440]

  const handleIntervalChange = async (mins) => {
    const prev = intervalMin
    setIntervalMin(mins)
    setIntervalDraft(String(mins))
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
      // Reflect the value the server actually saved (it may clamp our request).
      const saved = d.interval_minutes ?? mins
      if (saved !== mins) {
        setIntervalMin(saved)
        setIntervalDraft(String(saved))
      }
    } catch {
      setIntervalMin(prev)
      setIntervalDraft(String(prev))
      showToast('Couldn\u2019t update the auto-sync interval. Check your connection and try again.', 'error')
    }
    setSavingAuto(false)
  }

  // Commit the free-text number input (on blur / Enter). Empty or non-numeric
  // input reverts to the last committed value; otherwise we save the parsed
  // minutes and let the server clamp reflection snap it into the 5–1440 range.
  const commitIntervalDraft = () => {
    const parsed = parseInt(intervalDraft, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setIntervalDraft(String(intervalMin))
      return
    }
    if (parsed === intervalMin) {
      setIntervalDraft(String(intervalMin))
      return
    }
    handleIntervalChange(parsed)
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

      <div className="pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white text-xs font-medium">Auto-Sync</p>
            <p className="text-slate-500 text-xs mt-0.5">
              {autoSync?.running ? `Running — every ${autoSync.interval_min} min` : 'Disabled'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={5}
                max={1440}
                step={1}
                value={intervalDraft}
                disabled={savingAuto}
                onChange={e => setIntervalDraft(e.target.value)}
                onBlur={commitIntervalDraft}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                aria-label="Auto-sync interval in minutes"
                className="w-16 bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-500 disabled:opacity-40" />
              <span className="text-slate-500 text-xs">min</span>
            </div>
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
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="text-slate-600 text-xs mr-1">Quick picks:</span>
          {PRESETS.map(m => (
            <button key={m} onClick={() => handleIntervalChange(m)} disabled={savingAuto}
              className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${
                intervalMin === m
                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
              }`}>
              {m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
        </div>
        {isFrequent && (
          <p className="text-slate-500 text-xs mt-2">
            Frequent syncs may hit Notion rate limits. Consider 15 min or longer.
          </p>
        )}
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
