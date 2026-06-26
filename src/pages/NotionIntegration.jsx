import React, { useState, useEffect, useCallback } from 'react'

const STATUS_LABELS = {
  not_started: { label: 'Not Started', ar: 'لم تبدأ', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
  in_progress:  { label: 'In Progress', ar: 'قيد التنفيذ', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  done:         { label: 'Done',        ar: 'تم',         cls: 'bg-green-500/10 text-green-400 border-green-500/30' }
}

const PRIORITY_CLS = {
  High:   'text-red-400 bg-red-500/10 border-red-500/20',
  Medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  Low:    'text-green-400 bg-green-500/10 border-green-500/20'
}

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.not_started
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s.cls}`}>{s.label}</span>
  )
}

function PriorityBadge({ priority }) {
  if (!priority) return null
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_CLS[priority] || 'text-slate-400'}`}>
      {priority}
    </span>
  )
}

// ──────────────────────────────────────────────────────
// Settings Panel
// ──────────────────────────────────────────────────────
function SettingsPanel({ config, onSaved }) {
  const [apiKey, setApiKey] = useState('')
  const [projectsDb, setProjectsDb] = useState(config?.projectsDb || '')
  const [tasksDb, setTasksDb] = useState(config?.tasksDb || '')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [msg, setMsg] = useState(null)

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/notion/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey || undefined, projectsDb, tasksDb })
      })
      if (!res.ok) throw new Error('Save failed')
      setMsg({ type: 'ok', text: 'Settings saved.' })
      setApiKey('')
      onSaved()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch('/api/notion/config/test', { method: 'POST' })
      const d = await res.json()
      setTestResult(d)
    } catch (e) {
      setTestResult({ success: false, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
          <img src="https://www.notion.so/images/favicon.ico" alt="Notion" className="w-5 h-5" onError={e => e.target.style.display='none'} />
        </div>
        <div>
          <h2 className="text-white font-semibold">Notion Connection</h2>
          <p className="text-slate-500 text-xs">
            {config?.configured
              ? <span className="text-green-400">Connected · {config.apiKeyMasked}</span>
              : config?.envKeyPresent
                ? <span className="text-blue-400">Using NOTION_API_KEY env variable</span>
                : 'Not configured'}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Notion API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={config?.configured ? 'Enter new key to replace current' : 'secret_xxxxxxxx...'}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-slate-600"
          />
          <p className="text-slate-600 text-xs mt-1">
            Get your key at notion.so/my-integrations. Leave blank to keep existing.
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
        <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </div>
      )}
      {testResult && (
        <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${testResult.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {testResult.success ? `Connected as: ${testResult.user}` : `Failed: ${testResult.error}`}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <button onClick={test} disabled={testing || !config?.configured} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-sm transition-colors">
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────
// New Task Form
// ──────────────────────────────────────────────────────
function NewTaskForm({ projects, onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const selectedProject = projects.find(p => p.id === parseInt(projectId))
      const res = await fetch('/api/notion/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          status: 'not_started',
          priority,
          due_date: dueDate || undefined,
          project_notion_id: selectedProject?.notion_id || undefined
        })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onCreated()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-slate-900 border border-orange-500/30 rounded-xl p-4 mb-4">
      <h3 className="text-white font-medium mb-3 text-sm">New Task</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Task name…" required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <select value={priority} onChange={e => setPriority(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
            <option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
        <div>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <div className="col-span-2">
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
            <option value="">No project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          {saving ? 'Creating…' : 'Create in Notion'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">Cancel</button>
      </div>
    </form>
  )
}

// ──────────────────────────────────────────────────────
// New Project Form
// ──────────────────────────────────────────────────────
function NewProjectForm({ onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/notion/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          status: 'not_started',
          priority,
          start_date: startDate || undefined,
          due_date: dueDate || undefined
        })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onCreated()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-slate-900 border border-orange-500/30 rounded-xl p-4 mb-4">
      <h3 className="text-white font-medium mb-3 text-sm">New Project</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Project name…" required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <select value={priority} onChange={e => setPriority(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
            <option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
        <div></div>
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
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          {saving ? 'Creating…' : 'Create in Notion'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">Cancel</button>
      </div>
    </form>
  )
}

// ──────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────
export default function NotionIntegration() {
  const [tab, setTab] = useState('projects')
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
    const r = await fetch('/api/notion/config')
    setConfig(await r.json())
  }, [])

  const loadProjects = useCallback(async () => {
    const r = await fetch('/api/notion/projects')
    setProjects(await r.json())
  }, [])

  const loadTasks = useCallback(async () => {
    const url = selectedProject
      ? `/api/notion/tasks?project_id=${selectedProject.id}`
      : '/api/notion/tasks'
    const r = await fetch(url)
    setTasks(await r.json())
  }, [selectedProject])

  useEffect(() => {
    Promise.all([loadConfig(), loadProjects(), loadTasks()]).finally(() => setLoading(false))
  }, [loadConfig, loadProjects, loadTasks])

  useEffect(() => { loadTasks() }, [loadTasks])

  const sync = async (type) => {
    setSyncing(type); setSyncMsg(null)
    try {
      const r = await fetch(`/api/notion/${type}/sync`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setSyncMsg({ type: 'ok', text: `Synced ${d.synced} ${type} from Notion.` })
      if (type === 'projects') loadProjects()
      if (type === 'tasks') loadTasks()
    } catch (e) {
      setSyncMsg({ type: 'err', text: e.message })
    } finally {
      setSyncing(null)
    }
  }

  const updateTaskStatus = async (task, newStatus) => {
    setUpdatingId(task.id)
    try {
      const r = await fetch(`/api/notion/tasks/${task.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
    } catch (e) {
      alert('Error updating status: ' + e.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const updateProjectStatus = async (project, newStatus) => {
    setUpdatingId(project.id)
    try {
      const r = await fetch(`/api/notion/projects/${project.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: newStatus } : p))
    } catch (e) {
      alert('Error updating status: ' + e.message)
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-full">
      <div className="text-slate-500 text-sm">Loading Notion integration…</div>
    </div>
  )

  const configured = config?.configured || config?.envKeyPresent

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Notion Integration</h1>
          <p className="text-slate-400 text-sm mt-1">Sync Projects and Tasks with your Notion workspace</p>
        </div>
        {configured && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400"></div>
            <span className="text-green-400 text-sm font-medium">Connected</span>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="mb-6">
        <SettingsPanel config={config} onSaved={loadConfig} />
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div className={`mb-4 text-sm px-4 py-3 rounded-lg ${syncMsg.type === 'ok' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {syncMsg.text}
        </div>
      )}

      {/* Only show data tabs if connected */}
      {!configured ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center">
          <p className="text-4xl mb-3">🔗</p>
          <p className="text-white font-medium">Not connected to Notion</p>
          <p className="text-slate-400 text-sm mt-2">Enter your Notion API key above to get started.</p>
        </div>
      ) : (
        <>
          {/* Tabs + actions */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              {['projects', 'tasks', 'settings'].map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                    tab === t ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}>
                  {t === 'projects' ? `Projects (${projects.length})` : t === 'tasks' ? `Tasks (${tasks.length})` : 'Info'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {tab === 'projects' && (
                <>
                  <button onClick={() => { setShowProjectForm(v => !v); setShowTaskForm(false) }}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
                    + New Project
                  </button>
                  <button onClick={() => sync('projects')} disabled={syncing === 'projects'}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-sm transition-colors flex items-center gap-1.5">
                    <span className={syncing === 'projects' ? 'animate-spin' : ''}>↻</span>
                    {syncing === 'projects' ? 'Syncing…' : 'Sync Projects'}
                  </button>
                </>
              )}
              {tab === 'tasks' && (
                <>
                  <button onClick={() => { setShowTaskForm(v => !v); setShowProjectForm(false) }}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
                    + New Task
                  </button>
                  <button onClick={() => sync('tasks')} disabled={syncing === 'tasks'}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-sm transition-colors flex items-center gap-1.5">
                    <span className={syncing === 'tasks' ? 'animate-spin' : ''}>↻</span>
                    {syncing === 'tasks' ? 'Syncing…' : 'Sync Tasks'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Projects Tab ── */}
          {tab === 'projects' && (
            <>
              {showProjectForm && (
                <NewProjectForm onCreated={() => { setShowProjectForm(false); sync('projects') }} onCancel={() => setShowProjectForm(false)} />
              )}
              {projects.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <p className="text-4xl mb-3">📁</p>
                  <p>No projects synced yet — click Sync Projects to import from Notion</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projects.map(project => (
                    <div key={project.id}
                      className={`bg-slate-900 border rounded-xl p-4 transition-colors cursor-pointer ${selectedProject?.id === project.id ? 'border-orange-500/50' : 'border-slate-800 hover:border-slate-700'}`}
                      onClick={() => { setSelectedProject(p => p?.id === project.id ? null : project); setTab('tasks') }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-white font-semibold truncate">{project.name}</span>
                            <StatusBadge status={project.status} />
                            <PriorityBadge priority={project.priority} />
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            {project.due_date && <span>Due {new Date(project.due_date).toLocaleDateString()}</span>}
                            {project.total_tasks > 0 && <span>{project.total_tasks} tasks</span>}
                            {project.last_synced && <span>Synced {new Date(project.last_synced).toLocaleString()}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <a href={project.notion_url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-slate-500 hover:text-white transition-colors">
                            Open in Notion ↗
                          </a>
                          <select
                            value={project.status}
                            onClick={e => e.stopPropagation()}
                            onChange={e => updateProjectStatus(project, e.target.value)}
                            disabled={updatingId === project.id}
                            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-orange-500 disabled:opacity-50"
                          >
                            <option value="not_started">Not Started</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Tasks Tab ── */}
          {tab === 'tasks' && (
            <>
              {selectedProject && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-slate-400 text-sm">Filtered by project:</span>
                  <span className="bg-orange-500/20 text-orange-400 text-xs px-2 py-0.5 rounded-full border border-orange-500/30 font-medium">{selectedProject.name}</span>
                  <button onClick={() => setSelectedProject(null)} className="text-slate-500 hover:text-white text-xs transition-colors ml-1">✕ Clear</button>
                </div>
              )}
              {showTaskForm && (
                <NewTaskForm projects={projects} onCreated={() => { setShowTaskForm(false); sync('tasks') }} onCancel={() => setShowTaskForm(false)} />
              )}
              {tasks.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <p className="text-4xl mb-3">✅</p>
                  <p>No tasks synced yet — click Sync Tasks to import from Notion</p>
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Task</th>
                        <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Project</th>
                        <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Priority</th>
                        <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Due Date</th>
                        <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Status</th>
                        <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map(task => (
                        <tr key={task.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-white text-sm font-medium">{task.name}</span>
                          </td>
                          <td className="px-4 py-3">
                            {task.project_name
                              ? <span className="text-slate-400 text-xs bg-slate-800 px-2 py-0.5 rounded-full">{task.project_name}</span>
                              : <span className="text-slate-600 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3"><PriorityBadge priority={task.priority} /></td>
                          <td className="px-4 py-3">
                            <span className="text-slate-400 text-sm">
                              {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <select
                                value={task.status}
                                onChange={e => updateTaskStatus(task, e.target.value)}
                                disabled={updatingId === task.id}
                                className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-orange-500 disabled:opacity-50"
                              >
                                <option value="not_started">Not Started</option>
                                <option value="in_progress">In Progress</option>
                                <option value="done">Done</option>
                              </select>
                              <a href={task.notion_url} target="_blank" rel="noopener noreferrer"
                                className="text-slate-500 hover:text-white transition-colors text-xs">
                                ↗
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Info Tab ── */}
          {tab === 'settings' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-white font-semibold">Integration Details</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Workspace</span>
                  <span className="text-white">مساحة عمل Ashraf Alkasbi</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Projects Database</span>
                  <span className="text-white font-mono text-xs">{config?.projectsDb}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Tasks Database</span>
                  <span className="text-white font-mono text-xs">{config?.tasksDb}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Projects synced</span>
                  <span className="text-white">{projects.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Tasks synced</span>
                  <span className="text-white">{tasks.length}</span>
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <p className="text-slate-400 text-xs font-medium mb-2">Status mapping (Notion → App)</p>
                <div className="space-y-1">
                  {[['لم تبدأ','Not Started'],['قيد التنفيذ','In Progress'],['تم','Done']].map(([ar, en]) => (
                    <div key={ar} className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium" dir="rtl">{ar}</span>
                      <span className="text-slate-500">→</span>
                      <span className="text-slate-300">{en}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
