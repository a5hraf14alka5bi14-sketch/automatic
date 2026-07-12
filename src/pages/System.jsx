import React, { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../utils/api.js'
import { apiUrl } from '../config.js'

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
  const [health, setHealth]   = useState(null)
  const [audit, setAudit]     = useState([])
  const [loading, setLoading] = useState(true)
  const [backing, setBacking] = useState(false)
  const [msg, setMsg]         = useState(null)
  const [backups, setBackups] = useState([])
  const [runningBackup, setRunningBackup] = useState(false)
  const [restoreFile, setRestoreFile]     = useState(null)
  const [restoring, setRestoring]         = useState(false)
  const [restoreResult, setRestoreResult] = useState(null)
  const [releaseLog, setReleaseLog] = useState(null)
  const [resetOpen, setResetOpen]       = useState(false)
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetInvMode, setResetInvMode] = useState('keep')
  const [resetting, setResetting]       = useState(false)
  const [resetResult, setResetResult]   = useState(null)

  const loadMetrics = useCallback(async () => {
    try {
      const [mRes, hRes] = await Promise.all([
        apiFetch('/api/admin/metrics'),
        apiFetch('/api/admin/health'),
      ])
      if (mRes.ok) setMetrics(await mRes.json())
      if (hRes.ok) setHealth(await hRes.json())
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

  const loadReleaseLog = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/release-log-status')
      if (res.ok) setReleaseLog(await res.json())
    } catch { /* transient */ }
  }, [])

  useEffect(() => {
    ;(async () => {
      await Promise.all([loadMetrics(), loadAudit(), loadBackups(), loadReleaseLog()])
      setLoading(false)
    })()
    const t = setInterval(loadMetrics, 15000)
    return () => clearInterval(t)
  }, [loadMetrics, loadAudit, loadBackups, loadReleaseLog])

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
      const res = await fetch(apiUrl('/api/admin/backups/restore'), {
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

      {releaseLog?.versionMismatch && (
        <div role="alert" className="rounded-lg px-4 py-3 text-sm border bg-amber-500/10 border-amber-500/40 text-amber-200 flex items-start gap-3">
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <div>
            <p className="font-semibold text-amber-100">Release Log sync skipped — CHANGELOG is out of date</p>
            <p className="mt-1 text-amber-200/90">
              The app shipped <span className="font-mono font-semibold">{releaseLog.packageVersion}</span>, but the newest{' '}
              CHANGELOG.md entry is <span className="font-mono font-semibold">{releaseLog.changelogVersion}</span>. The Notion
              Release Log wasn’t updated. Add a CHANGELOG entry for{' '}
              <span className="font-mono font-semibold">{releaseLog.packageVersion}</span> — this banner clears automatically
              once the next sync succeeds.
            </p>
            {releaseLog.detectedAt && (
              <p className="mt-1 text-amber-300/70 text-xs">Detected {new Date(releaseLog.detectedAt).toLocaleString()}</p>
            )}
          </div>
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

      {/* Health & Monitoring */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300">Health &amp; Monitoring · صحة النظام</h2>
          <button onClick={loadMetrics} className="text-slate-400 hover:text-white text-xs">↻ Refresh</button>
        </div>

        {/* DB + pool health */}
        {health && (() => {
          const db   = health.checks?.database ?? {}
          const pool = health.checks?.pool ?? {}
          const mem  = health.checks?.memory ?? {}
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">DB Status</p>
                <p className={`text-lg font-bold mt-1 ${db.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {db.ok ? '● Online' : '● Error'}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {db.latencyMs != null ? `${db.latencyMs} ms ping` : db.error || '—'}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">DB Pool</p>
                <p className="text-white text-lg font-bold mt-1">{pool.total ?? '—'} conns</p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {pool.total != null ? `${pool.idle} idle · ${pool.waiting} waiting` : '—'}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Heap Memory</p>
                <p className={`text-lg font-bold mt-1 ${mem.ok === false ? 'text-red-400' : 'text-white'}`}>
                  {mem.heapUsedMb != null ? `${mem.heapUsedMb} MB` : '—'}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {mem.heapPct != null ? `${mem.heapPct}% of ${mem.heapTotalMb} MB` : '—'}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Server</p>
                <p className="text-white text-lg font-bold mt-1">{fmtUptime(health.uptimeSeconds)}</p>
                <p className={`text-xs mt-0.5 ${health.ok ? 'text-green-500' : 'text-red-400'}`}>
                  {health.ok ? '● All systems OK' : '● Degraded'}
                </p>
              </div>
            </div>
          )
        })()}

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

      {/* Danger zone — Factory Reset */}
      <section>
        <h2 className="text-sm font-semibold text-red-400 mb-3">Danger Zone · منطقة الخطر</h2>
        <div className="bg-slate-900 border border-red-900/60 rounded-xl p-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="text-sm">
              <p className="text-white font-semibold mb-1">Factory Reset · تصفير التشغيل</p>
              <p className="text-slate-400 mb-2">
                يحذف <span className="text-red-400">جميع البيانات التشغيلية</span>: الطلبات، المدفوعات، الورديات،
                حركات المخزون، أوامر الشراء، سجل التدقيق والمزامنة، ويعيد عدادات العملاء (نقاط الولاء / الإنفاق) إلى الصفر.
              </p>
              <p className="text-slate-400">
                يحتفظ بالكامل بـ: القائمة، الوصفات، أصناف المخزون، الموردين، المستخدمين، والإعدادات.
                يتم إنشاء <span className="text-green-400">نسخة احتياطية تلقائية</span> قبل التنفيذ.
              </p>
            </div>
            {!resetOpen && (
              <button onClick={() => { setResetOpen(true); setResetResult(null) }}
                className="shrink-0 px-4 py-2 rounded-lg bg-red-600/20 border border-red-700 text-red-400 hover:bg-red-600/30 text-sm font-semibold">
                Factory Reset…
              </button>
            )}
          </div>

          {resetOpen && (
            <div className="mt-4 border-t border-red-900/40 pt-4 space-y-3">
              <div className="text-sm text-slate-300 font-medium">المخزون · Inventory:</div>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input type="radio" name="inv-mode" checked={resetInvMode === 'keep'} onChange={() => setResetInvMode('keep')} className="accent-orange-500" />
                  الإبقاء على الكميات الحالية كرصيد افتتاحي · Keep current quantities as opening stock
                </label>
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input type="radio" name="inv-mode" checked={resetInvMode === 'zero'} onChange={() => setResetInvMode('zero')} className="accent-orange-500" />
                  تصفير جميع الكميات · Zero all quantities
                </label>
              </div>
              <div className="text-sm text-slate-400">
                هذه العملية <span className="text-red-400 font-semibold">غير قابلة للتراجع</span> إلا عبر النسخة الاحتياطية.
                اكتب <span className="font-mono text-white">RESET</span> للتأكيد:
              </div>
              <div className="flex items-center gap-3">
                <input value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} placeholder="RESET"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono w-36 focus:border-red-500 outline-none" />
                <button disabled={resetConfirm !== 'RESET' || resetting}
                  onClick={async () => {
                    setResetting(true)
                    setResetResult(null)
                    try {
                      const res = await apiFetch('/api/admin/factory-reset', {
                        method: 'POST',
                        body: JSON.stringify({ confirm: 'RESET', inventoryMode: resetInvMode }),
                      })
                      const d = await res.json()
                      if (!res.ok) throw new Error(d.error || 'Factory reset failed')
                      setResetResult({ ok: true, data: d })
                      setResetOpen(false)
                      setResetConfirm('')
                      await Promise.all([loadMetrics(), loadAudit(), loadBackups()])
                    } catch (err) {
                      setResetResult({ ok: false, text: err.message })
                    }
                    setResetting(false)
                  }}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-500">
                  {resetting ? 'جارٍ التنفيذ…' : 'تنفيذ التصفير · Execute Reset'}
                </button>
                <button onClick={() => { setResetOpen(false); setResetConfirm('') }} disabled={resetting}
                  className="text-slate-400 hover:text-white text-sm">إلغاء</button>
              </div>
            </div>
          )}

          {resetResult && !resetResult.ok && (
            <div className="mt-3 text-sm text-red-400">{resetResult.text}</div>
          )}
          {resetResult?.ok && (
            <div className="mt-4 border-t border-slate-800 pt-4 text-sm">
              <p className="text-green-400 font-semibold mb-2">✓ تم التصفير بنجاح · Factory reset completed</p>
              <p className="text-slate-400 mb-2">النسخة الاحتياطية · Backup: <span className="font-mono text-slate-300">{resetResult.data.backup}</span></p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-slate-400">
                {Object.entries(resetResult.data.deleted || {}).map(([t, n]) => (
                  <div key={t} className="flex justify-between gap-2"><span className="font-mono text-xs">{t}</span><span className="text-slate-200">{n}</span></div>
                ))}
                <div className="flex justify-between gap-2"><span className="font-mono text-xs">customers reset</span><span className="text-slate-200">{resetResult.data.customers_reset}</span></div>
                <div className="flex justify-between gap-2"><span className="font-mono text-xs">opening stock rows</span><span className="text-slate-200">{resetResult.data.opening_stock_entries}</span></div>
              </div>
            </div>
          )}
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
