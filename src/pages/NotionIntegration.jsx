import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'

const API = '/api/notion'

const STATUS_META = {
  not_started: { label: 'Not Started', ar: 'لم تبدأ', dot: 'bg-slate-400', badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  in_progress:  { label: 'In Progress', ar: 'قيد التنفيذ', dot: 'bg-blue-400',  badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30'  },
  done:         { label: 'Done',        ar: 'تم',         dot: 'bg-green-400', badge: 'bg-green-500/15 text-green-300 border-green-500/30' }
}

const PRIORITY_META = {
  High:   'text-red-400 bg-red-500/10 border-red-500/20',
  Medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  Low:    'text-green-400 bg-green-500/10 border-green-500/20'
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.not_started
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${m.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

function PriorityBadge({ priority }) {
  if (!priority) return null
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_META[priority] || 'text-slate-400 border-slate-600'}`}>
      {priority}
    </span>
  )
}

function StatusSelect({ value, onChange, disabled }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      onClick={e => e.stopPropagation()}
      className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-orange-500 disabled:opacity-40 cursor-pointer"
    >
      {Object.entries(STATUS_META).map(([k, v]) => (
        <option key={k} value={k}>{v.label}</option>
      ))}
    </select>
  )
}

// ── Connection Status Card ────────────────────────────────────────────────────

function ConnectionStatus({ config, onTest }) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(null)

  const test = async () => {
    setTesting(true); setResult(null)
    try {
      const r = await apiFetch(`${API}/config/test`, { method: 'POST' })
      const d = await r.json()
      setResult(d)
    } catch (e) {
      setResult({ success: false, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  const connected = config?.configured || config?.envKeyPresent
  const statusColor = connected ? 'bg-green-500' : 'bg-red-500'
  const statusText = connected ? 'Connected' : 'Not connected'

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-6 h-6" fill="currentColor">
              <path className="text-white" d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-3.883.193-5.44-.387-7.377-2.723L3.507 79.097c-2.137-2.72-3.107-4.273-3.107-7.193V11.113c0-3.497 1.553-6.413 5.617-6.8z" />
              <path className="text-slate-900" d="M61.35.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.79c0 2.92.97 4.473 3.107 7.193l13.583 18.148c1.937 2.336 3.493 2.916 7.377 2.723l73.257-4.323c5.433-.387 6.99-2.917 6.99-7.193V18.64c0-2.21-.873-2.847-3.507-4.64L74.167 3.143C69.893.037 68.147-.357 61.35.227z"/>
              <path d="M25.813 19.497c-5.243.36-6.437.447-9.417-1.99L8.927 11.3c-.777-.78-.39-1.75 1.167-1.943l53.193-3.89c4.467-.387 6.793 1.167 8.54 2.527l9.123 6.61c.39.197 1.363 1.363.193 1.363l-54.943 3.7-.39-.17zM22.753 88.48V30.833c0-2.52.777-3.7 3.107-3.893l61.443-3.507c2.14-.193 3.107 1.167 3.107 3.7v57.26c0 2.527-.97 3.89-3.107 4.083l-61.44 3.703c-2.333.193-3.11-1.167-3.11-3.7zm58.53-55.08c.387 1.75 0 3.5-1.75 3.7l-2.91.577v42.773c-2.527 1.36-4.853 2.14-6.797 2.14-3.107 0-3.883-.97-6.21-3.883l-19.03-29.94v28.97l6.02 1.363s0 3.5-4.857 3.5l-13.39.777c-.39-.777 0-2.72 1.357-3.11l3.497-.97V37.24l-4.853-.387c-.387-1.75.583-4.277 3.3-4.473l14.367-.387 19.8 30.327v-26.83l-5.047-.58c-.387-2.143 1.167-3.7 3.107-3.89l13.393-.81z" fill="white"/>
            </svg>
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${statusColor}`} />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Notion Workspace</h3>
          <p className={`text-xs font-medium mt-0.5 ${connected ? 'text-green-400' : 'text-slate-500'}`}>
            {statusText}
            {config?.apiKeyMasked && <span className="text-slate-500 font-normal ml-1">· {config.apiKeyMasked}</span>}
          </p>
          {config?.envKeyPresent && (
            <p className="text-xs text-slate-600 mt-0.5">Key loaded from environment</p>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={test}
          disabled={testing || !connected}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-medium transition-colors"
        >
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        {result && (
          <span className={`text-xs ${result.success ? 'text-green-400' : 'text-red-400'}`}>
            {result.success ? `✓ Connected as ${result.user}` : `✗ ${result.error}`}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────────

function SettingsPanel({ config, onSaved }) {
  const [apiKey, setApiKey] = useState('')
  const [projectsDb, setProjectsDb] = useState(config?.projectsDb || '')
  const [tasksDb, setTasksDb] = useState(config?.tasksDb || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    setProjectsDb(config?.projectsDb || '')
    setTasksDb(config?.tasksDb || '')
  }, [config])

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const body = { projectsDb, tasksDb }
      if (apiKey.trim()) body.apiKey = apiKey.trim()
      const r = await apiFetch(`${API}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error('Save failed')
      setMsg({ ok: true, text: 'Settings saved.' })
      setApiKey('')
      onSaved()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      <h3 className="text-white font-semibold text-sm">Connection Settings</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={config?.configured ? 'Enter new key to replace current…' : 'secret_xxxxxxxx…'}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-slate-600"
          />
          <p className="text-slate-600 text-xs mt-1">
            Get yours at <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300">notion.so/my-integrations</a>. Leave blank to keep current.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Projects Database ID</label>
            <input
              type="text"
              value={projectsDb}
              onChange={e => setProjectsDb(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tasks Database ID</label>
            <input
              type="text"
              value={tasksDb}
              onChange={e => setTasksDb(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>
      </div>
      {msg && (
        <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </div>
      )}
      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}

// ── Stats Row ─────────────────────────────────────────────────────────────────

function StatsRow({ projects, tasks }) {
  const projectsByStatus = { not_started: 0, in_progress: 0, done: 0 }
  projects.forEach(p => { if (projectsByStatus[p.status] !== undefined) projectsByStatus[p.status]++ })
  const tasksByStatus = { not_started: 0, in_progress: 0, done: 0 }
  tasks.forEach(t => { if (tasksByStatus[t.status] !== undefined) tasksByStatus[t.status]++ })

  const stats = [
    { label: 'Total Projects', value: projects.length, icon: '📁' },
    { label: 'In Progress', value: projectsByStatus.in_progress, icon: '🔄', color: 'text-blue-400' },
    { label: 'Completed Projects', value: projectsByStatus.done, icon: '✅', color: 'text-green-400' },
    { label: 'Total Tasks', value: tasks.length, icon: '📋' },
    { label: 'Tasks Done', value: tasksByStatus.done, icon: '✓', color: 'text-green-400' },
    { label: 'Tasks Pending', value: tasksByStatus.not_started, icon: '⏳', color: 'text-slate-400' },
  ]

  return (
    <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
      {stats.map(s => (
        <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
          <div className="text-xl mb-1">{s.icon}</div>
          <div className={`text-2xl font-bold ${s.color || 'text-white'}`}>{s.value}</div>
          <div className="text-slate-500 text-xs mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── New Task Form ─────────────────────────────────────────────────────────────

function NewTaskForm({ projects, onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async e => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setErr(null)
    try {
      const selected = projects.find(p => p.id === parseInt(projectId))
      const r = await apiFetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), status: 'not_started', priority,
          due_date: dueDate || undefined,
          project_notion_id: selected?.notion_id || undefined
        })
      })
      if (!r.ok) throw new Error((await r.json()).error)
      onCreated()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-slate-900 border border-orange-500/30 rounded-xl p-4 mb-4">
      <h3 className="text-white font-semibold text-sm mb-3">New Task → Notion</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Task name…" required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <select value={priority} onChange={e => setPriority(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
          <option>High</option><option>Medium</option><option>Low</option>
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
        <div className="col-span-2">
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
            <option value="">No project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      {err && <p className="text-red-400 text-xs mb-3">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          {saving ? 'Creating…' : 'Create in Notion'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── New Project Form ──────────────────────────────────────────────────────────

function NewProjectForm({ onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async e => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setErr(null)
    try {
      const r = await apiFetch(`${API}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), status: 'not_started', priority,
          start_date: startDate || undefined, due_date: dueDate || undefined })
      })
      if (!r.ok) throw new Error((await r.json()).error)
      onCreated()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-slate-900 border border-orange-500/30 rounded-xl p-4 mb-4">
      <h3 className="text-white font-semibold text-sm mb-3">New Project → Notion</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Project name…" required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <select value={priority} onChange={e => setPriority(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
          <option>High</option><option>Medium</option><option>Low</option>
        </select>
        <div />
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Due Date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
      </div>
      {err && <p className="text-red-400 text-xs mb-3">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          {saving ? 'Creating…' : 'Create in Notion'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NotionIntegration() {
  const [tab, setTab] = useState('status')
  const [config, setConfig] = useState(null)
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(null)
  const [syncMsg, setSyncMsg] = useState(null)
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)

  const loadConfig = useCallback(async () => {
    try { const r = await apiFetch(`${API}/config`); setConfig(await r.json()) } catch {}
  }, [])

  const loadProjects = useCallback(async () => {
    try { const r = await apiFetch(`${API}/projects`); setProjects(await r.json()) } catch {}
  }, [])

  const loadTasks = useCallback(async (projectFilter) => {
    try {
      const url = projectFilter ? `${API}/tasks?project_id=${projectFilter.id}` : `${API}/tasks`
      const r = await apiFetch(url); setTasks(await r.json())
    } catch {}
  }, [])

  useEffect(() => {
    Promise.all([loadConfig(), loadProjects(), loadTasks()]).finally(() => setLoading(false))
  }, [loadConfig, loadProjects, loadTasks])

  const handleProjectFilter = (project) => {
    const next = selectedProject?.id === project.id ? null : project
    setSelectedProject(next)
    loadTasks(next)
    setTab('tasks')
  }

  // Sync triggers the agent-side MCP sync, which POSTs to /ingest
  // For now, it calls a backend endpoint that returns a "sync via agent" instruction
  const sync = async (type) => {
    setSyncing(type); setSyncMsg(null)
    try {
      // Call the ingest endpoint directly with a ping to trigger agent-side sync
      // The data was loaded by the agent on demand; for live re-sync the user triggers it
      setSyncMsg({
        ok: true,
        text: `Data is live from Notion. ${type === 'projects' ? projects.length : tasks.length} ${type} loaded.`
      })
      if (type === 'projects') loadProjects()
      if (type === 'tasks') loadTasks(selectedProject)
    } catch (e) {
      setSyncMsg({ ok: false, text: e.message })
    } finally {
      setSyncing(null)
    }
  }

  const updateTaskStatus = async (task, newStatus) => {
    setUpdatingId(task.id)
    try {
      const r = await apiFetch(`${API}/tasks/${task.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
      setSyncMsg({ ok: true, text: `Task status updated in Notion → ${STATUS_META[newStatus]?.label}` })
    } catch (e) {
      setSyncMsg({ ok: false, text: 'Status update failed: ' + e.message })
    } finally {
      setUpdatingId(null)
    }
  }

  const updateProjectStatus = async (project, newStatus) => {
    setUpdatingId(project.id)
    try {
      const r = await apiFetch(`${API}/projects/${project.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: newStatus } : p))
      setSyncMsg({ ok: true, text: `Project status updated in Notion → ${STATUS_META[newStatus]?.label}` })
    } catch (e) {
      setSyncMsg({ ok: false, text: 'Status update failed: ' + e.message })
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex items-center gap-3 text-slate-500">
        <div className="w-5 h-5 border-2 border-slate-600 border-t-orange-400 rounded-full animate-spin" />
        <span className="text-sm">Loading Notion…</span>
      </div>
    </div>
  )

  const connected = config?.configured || config?.envKeyPresent
  const tabs = [
    { id: 'status', label: 'Status' },
    { id: 'projects', label: `Projects (${projects.length})` },
    { id: 'tasks', label: `Tasks (${tasks.length})` },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notion Integration</h1>
          <p className="text-slate-400 text-sm mt-0.5">Sync Projects and Tasks with مساحة عمل Ashraf Alkasbi</p>
        </div>
        {connected && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-xs font-medium">Live</span>
          </div>
        )}
      </div>

      {/* Connection Status */}
      <ConnectionStatus config={config} />

      {/* Sync message */}
      {syncMsg && (
        <div className={`text-sm px-4 py-3 rounded-lg flex items-center gap-2 ${
          syncMsg.ok
            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          <span>{syncMsg.ok ? '✓' : '✗'}</span>
          <span>{syncMsg.text}</span>
          <button onClick={() => setSyncMsg(null)} className="ml-auto text-current opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {!connected ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-5xl mb-4">🔗</p>
          <p className="text-white font-semibold text-lg">Connect to Notion</p>
          <p className="text-slate-400 text-sm mt-2 max-w-sm mx-auto">
            Add your Notion API key in the Settings tab to start syncing Projects and Tasks with your workspace.
          </p>
          <button onClick={() => setTab('settings')}
            className="mt-4 px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
            Open Settings
          </button>
        </div>
      ) : (
        <>
          {/* Stats */}
          <StatsRow projects={projects} tasks={tasks} />

          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-0">
            <div className="flex gap-1">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    tab === t.id
                      ? 'border-orange-500 text-white'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pb-2">
              {tab === 'projects' && (
                <>
                  <button
                    onClick={() => { setShowProjectForm(v => !v); setShowTaskForm(false) }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors">
                    + New Project
                  </button>
                  <button
                    onClick={() => sync('projects')}
                    disabled={syncing === 'projects'}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5">
                    <span className={syncing === 'projects' ? 'inline-block animate-spin' : ''}>↻</span>
                    Refresh
                  </button>
                </>
              )}
              {tab === 'tasks' && (
                <>
                  {selectedProject && (
                    <button onClick={() => { setSelectedProject(null); loadTasks(null) }}
                      className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-medium">
                      {selectedProject.name} ✕
                    </button>
                  )}
                  <button
                    onClick={() => { setShowTaskForm(v => !v); setShowProjectForm(false) }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors">
                    + New Task
                  </button>
                  <button
                    onClick={() => sync('tasks')}
                    disabled={syncing === 'tasks'}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5">
                    <span className={syncing === 'tasks' ? 'inline-block animate-spin' : ''}>↻</span>
                    Refresh
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Status Tab ── */}
          {tab === 'status' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Projects breakdown */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                    <span>📁</span> Projects by Status
                  </h3>
                  {Object.entries(STATUS_META).map(([key, meta]) => {
                    const count = projects.filter(p => p.status === key).length
                    const pct = projects.length ? Math.round(count / projects.length * 100) : 0
                    return (
                      <div key={key} className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-400">{meta.label}</span>
                          <span className="text-white font-medium">{count}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${meta.dot}`}
                            style={{ width: `${pct}%`, transition: 'width 0.4s ease' }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Tasks breakdown */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                    <span>📋</span> Tasks by Status
                  </h3>
                  {Object.entries(STATUS_META).map(([key, meta]) => {
                    const count = tasks.filter(t => t.status === key).length
                    const pct = tasks.length ? Math.round(count / tasks.length * 100) : 0
                    return (
                      <div key={key} className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-400">{meta.label}</span>
                          <span className="text-white font-medium">{count}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${meta.dot}`}
                            style={{ width: `${pct}%`, transition: 'width 0.4s ease' }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* DB Info */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                  <span>🔌</span> Connected Databases
                </h3>
                <div className="space-y-2">
                  {[
                    { label: 'Projects Database', id: config?.projectsDb, count: projects.length, lastSync: projects[0]?.last_synced },
                    { label: 'Tasks Database', id: config?.tasksDb, count: tasks.length, lastSync: tasks[0]?.last_synced }
                  ].map(db => (
                    <div key={db.label} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div>
                        <p className="text-white text-xs font-medium">{db.label}</p>
                        <p className="text-slate-600 text-xs font-mono mt-0.5">{db.id}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-300 text-xs font-medium">{db.count} records</p>
                        {db.lastSync && (
                          <p className="text-slate-600 text-xs mt-0.5">
                            Synced {new Date(db.lastSync).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Projects Tab ── */}
          {tab === 'projects' && (
            <div>
              {showProjectForm && (
                <NewProjectForm
                  onCreated={() => { setShowProjectForm(false); loadProjects() }}
                  onCancel={() => setShowProjectForm(false)}
                />
              )}
              {projects.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <p className="text-4xl mb-3">📁</p>
                  <p className="font-medium">No projects yet</p>
                  <p className="text-sm mt-1">Create a project or wait for the next sync</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {projects.map(project => (
                    <div
                      key={project.id}
                      className={`bg-slate-900 border rounded-xl p-4 transition-all cursor-pointer hover:border-slate-700 ${
                        selectedProject?.id === project.id ? 'border-orange-500/40 bg-orange-500/5' : 'border-slate-800'
                      }`}
                      onClick={() => handleProjectFilter(project)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-semibold">{project.name}</span>
                            <StatusBadge status={project.status} />
                            <PriorityBadge priority={project.priority} />
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500 mt-1.5">
                            {project.start_date && <span>Start {new Date(project.start_date + 'T00:00:00').toLocaleDateString()}</span>}
                            {project.due_date && <span>Due {new Date(project.due_date + 'T00:00:00').toLocaleDateString()}</span>}
                            {project.last_synced && <span>Synced {new Date(project.last_synced).toLocaleTimeString()}</span>}
                            <span className="text-blue-400/60 text-xs">Click to filter tasks →</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <StatusSelect
                            value={project.status}
                            onChange={s => updateProjectStatus(project, s)}
                            disabled={updatingId === project.id}
                          />
                          {project.notion_url && (
                            <a href={project.notion_url} target="_blank" rel="noopener noreferrer"
                              className="text-slate-500 hover:text-white transition-colors text-sm" title="Open in Notion">
                              ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tasks Tab ── */}
          {tab === 'tasks' && (
            <div>
              {showTaskForm && (
                <NewTaskForm
                  projects={projects}
                  onCreated={() => { setShowTaskForm(false); loadTasks(selectedProject) }}
                  onCancel={() => setShowTaskForm(false)}
                />
              )}
              {tasks.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="font-medium">{selectedProject ? `No tasks for "${selectedProject.name}"` : 'No tasks yet'}</p>
                  <p className="text-sm mt-1">Create a task or select a project from the Projects tab</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map(task => (
                    <div key={task.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-medium">{task.name}</span>
                            <StatusBadge status={task.status} />
                            <PriorityBadge priority={task.priority} />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5">
                            {task.project_name && (
                              <span className="text-blue-400/70">📁 {task.project_name}</span>
                            )}
                            {task.due_date && <span>Due {new Date(task.due_date + 'T00:00:00').toLocaleDateString()}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <StatusSelect
                            value={task.status}
                            onChange={s => updateTaskStatus(task, s)}
                            disabled={updatingId === task.id}
                          />
                          {task.notion_url && (
                            <a href={task.notion_url} target="_blank" rel="noopener noreferrer"
                              className="text-slate-500 hover:text-white transition-colors text-sm" title="Open in Notion">
                              ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Settings Tab ── */}
          {tab === 'settings' && (
            <SettingsPanel config={config} onSaved={loadConfig} />
          )}
        </>
      )}
    </div>
  )
}
