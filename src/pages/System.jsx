import React, { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../utils/api.js'

function Stat({ label, value, sub }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="text-white text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

function fmtUptime(sec) {
  if (sec == null) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m ${sec % 60}s`
}

export default function System() {
  const [metrics, setMetrics] = useState(null)
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(true)
  const [backing, setBacking] = useState(false)
  const [msg, setMsg] = useState(null)
  const [backups, setBackups] = useState([])
  const [runningBackup, setRunningBackup] = useState(false)
  const [restoreFile, setRestoreFile] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState(null)

  const loadMetrics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/metrics')
      if (res.ok) setMetrics(await res.json())
    } catch { /* transient */ }
  }, [])

  const loadAudit = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/audit?limit=50')
      if (res.ok) setAudit(await res.json())
    } catch { /* transient */ }
  }, [])

  const loadBackups = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/backups')
      if (res.ok) setBackups(await res.json())
    } catch { /* transient */ }
  }, [])

  useEffect(() => {
    ;(async () => {
      await Promise.all([loadMetrics(), loadAudit(), loadBackups()])
      setLoading(false)
    })()
    const t = setInterval(loadMetrics, 10000)
    return () => clearInterval(t)
  }, [loadMetrics, loadAudit, loadBackups])

  const runBackupNow = async () => {
    setRunningBackup(true)
    try {
      const res = await apiFetch('/api/admin/backups/run', { method: 'POST' })
      const d = await res.json()
      if (res.ok) {
        setMsg({ ok: true, text: `Backup created: ${d.filename}` })
        await loadBackups()
      } else {
        setMsg({ ok: false, text: d.error || 'Backup failed' })
      }
    } catch { setMsg({ ok: false, text: 'Backup request failed' }) }
    setRunningBackup(false)
  }

  const downloadBackup = async () => {
    setBacking(true)
    setMsg(null)
    try {
      const res = await apiFetch('/api/admin/backup')
      if (!res.ok) throw new Error('Backup failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      a.href = url
      a.download = `backup-${ts}.sql`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setMsg({ ok: true, text: 'Backup downloaded.' })
    } catch {
      setMsg({ ok: false, text: 'Could not create the backup. Check server logs.' })
    } finally {
      setBacking(false)
    }
  }

  const restoreBackup = async () => {
    if (!restoreFile) return
    if (!confirm(`⚠️ This will overwrite the database with "${restoreFile.name}". This cannot be undone. Continue?`)) return
    setRestoring(true)
    setRestoreResult(null)
    try {
      const fd = new FormData()
      fd.append('backup', restoreFile)
      const res = await fetch('/api/admin/backups/restore', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || d.detail || 'Restore failed')
      setRestoreResult({ ok: true, text: d.message || 'Database restored successfully. Please refresh.' })
      setRestoreFile(null)
    } catch (err) {
      setRestoreResult({ ok: false, text: err.message })
    }
    setRestoring(false)
  }

  const req = metrics?.requests

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">System</h1>
          <p className="text-slate-400 text-sm">Monitoring, backups & audit trail · المراقبة والنسخ الاحتياطي</p>
        </div>
        <button
          onClick={downloadBackup}
          disabled={backing}
          className="px-4 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center gap-2"
        >
          <span>💾</span>
          {backing ? 'Creating backup…' : 'Download DB Backup'}
        </button>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm border ${msg.ok ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      {/* Scheduled Backups */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300">Scheduled Backups · النسخ الاحتياطي التلقائي</h2>
          <button onClick={runBackupNow} disabled={runningBackup}
            className="text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors">
            {runningBackup ? '⟳ Running…' : '+ Run Backup Now'}
          </button>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {backups.length === 0 ? (
            <p className="text-center py-8 text-slate-500 text-sm">No backups yet — first runs 30 s after server start.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase tracking-wide border-b border-slate-800">
                  <th className="px-4 py-2.5 font-medium">File</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 font-medium">Size</th>
                  <th className="px-4 py-2.5 font-medium">Download</th>
                </tr>
              </thead>
              <tbody>
                {backups.map(b => (
                  <tr key={b.name} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 text-slate-300 font-mono text-xs">{b.name}</td>
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{new Date(b.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-slate-400">{(b.size / 1024).toFixed(0)} KB</td>
                    <td className="px-4 py-2.5">
                      <a href={`/api/admin/backups/${b.name}`}
                        className="text-orange-400 hover:text-orange-300 text-xs font-medium transition-colors"
                        download>
                        ⬇ Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Restore Backup */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-300">Restore Database · استعادة قاعدة البيانات</h2>
            <p className="text-slate-500 text-xs mt-0.5">Upload a .sql backup file to restore. ⚠️ This will overwrite all current data.</p>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          {restoreResult && (
            <div className={`rounded-lg px-4 py-2.5 text-sm border ${restoreResult.ok ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
              {restoreResult.text}
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <label className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer border transition-colors text-sm ${
              restoreFile ? 'border-orange-500/40 bg-orange-500/10 text-orange-300' : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}>
              <span>📁</span>
              <span>{restoreFile ? restoreFile.name : 'Choose .sql file'}</span>
              <input type="file" accept=".sql" className="hidden" onChange={e => { setRestoreFile(e.target.files[0] || null); setRestoreResult(null) }} />
            </label>
            {restoreFile && (
              <>
                <span className="text-slate-500 text-xs">{(restoreFile.size / 1024).toFixed(0)} KB</span>
                <button onClick={restoreBackup} disabled={restoring}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                  {restoring ? '⟳ Restoring…' : '↩ Restore Database'}
                </button>
                <button onClick={() => { setRestoreFile(null); setRestoreResult(null) }}
                  className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
                  Cancel
                </button>
              </>
            )}
          </div>
          <p className="text-slate-600 text-xs">Only admin accounts can perform restores. All active sessions will be disrupted after a restore.</p>
        </div>
      </section>

      {/* Monitoring */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Monitoring</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Uptime" value={fmtUptime(metrics?.uptimeSeconds)} />
          <Stat label="Requests" value={req?.total ?? '—'} sub={req ? `${req.errors} errors · avg ${req.avgDurationMs}ms` : undefined} />
          <Stat label="Memory (heap)" value={metrics ? `${metrics.memory.heapUsedMb} MB` : '—'} sub={metrics ? `RSS ${metrics.memory.rssMb} MB` : undefined} />
          <Stat
            label="Responses"
            value={req ? `${req.byStatusClass['2xx']} ok` : '—'}
            sub={req ? `4xx ${req.byStatusClass['4xx']} · 5xx ${req.byStatusClass['5xx']}` : undefined}
          />
        </div>
      </section>

      {/* Audit log */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300">Audit Log · سجل التدقيق</h2>
          <button onClick={loadAudit} className="text-slate-400 hover:text-white text-xs">↻ Refresh</button>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase tracking-wide border-b border-slate-800">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Path</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
                ) : audit.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No audit entries yet.</td></tr>
                ) : (
                  audit.map((row) => (
                    <tr key={row.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-slate-300">{row.user_email || (row.user_id != null ? `#${row.user_id}` : '—')}</td>
                      <td className="px-4 py-2.5"><span className="font-mono text-xs text-orange-400">{row.method}</span></td>
                      <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{row.path}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold ${row.status >= 400 ? 'text-red-400' : 'text-green-400'}`}>{row.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
