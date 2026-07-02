import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { API, INT_API, STATUS_META, fmt } from '../components/notion/notionShared.jsx'
import ConnectionStatus from '../components/notion/ConnectionStatus.jsx'
import SyncPanel from '../components/notion/SyncPanel.jsx'
import SettingsPanel from '../components/notion/SettingsPanel.jsx'
import { NewProjectForm, NewTaskForm } from '../components/notion/ProjectForms.jsx'
import GitHubLinkTab from '../components/notion/GitHubLinkTab.jsx'
import RecipeIngredientsTab from '../components/notion/RecipeIngredientsTab.jsx'
import StatsRow from '../components/notion/StatsRow.jsx'
import { StatusBadge, PriorityBadge, StatusSelect, fmtDate } from '../components/notion/notionShared.jsx'

export default function NotionIntegration() {
  const [tab, setTab] = useState('status')
  const [config, setConfig] = useState(null)
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(null)
  const [syncMsg, setSyncMsg] = useState(null)
  const [syncStatus, setSyncStatus] = useState(null)
  const [autoSync, setAutoSync] = useState(null)
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

  const loadSyncStatus = useCallback(async () => {
    try {
      const [statusRes, autoRes] = await Promise.all([
        apiFetch(`${INT_API}/notion/sync/status`),
        apiFetch(`${INT_API}/notion/auto-sync`)
      ])
      setSyncStatus(await statusRes.json())
      setAutoSync(await autoRes.json())
    } catch {}
  }, [])

  useEffect(() => {
    Promise.all([loadConfig(), loadProjects(), loadTasks(), loadSyncStatus()])
      .finally(() => setLoading(false))
  }, [loadConfig, loadProjects, loadTasks, loadSyncStatus])

  const handleProjectFilter = (project) => {
    const next = selectedProject?.id === project.id ? null : project
    setSelectedProject(next)
    loadTasks(next)
    setTab('tasks')
  }

  const sync = async (type) => {
    setSyncing(type); setSyncMsg(null)
    try {
      const r = await apiFetch(`${INT_API}/notion/sync`, {
        method: 'POST',
        body: JSON.stringify({ type })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Sync failed')
      const p = d.projects || {}
      const t = d.tasks || {}
      const synced = (p.synced || 0) + (t.synced || 0)
      const total = (p.total || 0) + (t.total || 0)
      setSyncMsg({ ok: true, text: `Sync complete — ${synced}/${total} items updated from Notion` })
      await Promise.all([loadProjects(), loadTasks(selectedProject), loadSyncStatus()])
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
        body: JSON.stringify({ status: newStatus })
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
      setSyncMsg({ ok: true, text: `Task status → ${STATUS_META[newStatus]?.label} (updated in Notion)` })
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
        body: JSON.stringify({ status: newStatus })
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: newStatus } : p))
      setSyncMsg({ ok: true, text: `Project status → ${STATUS_META[newStatus]?.label} (updated in Notion)` })
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
    { id: 'status',   label: 'Status' },
    { id: 'projects', label: `Projects (${projects.length})` },
    { id: 'tasks',    label: `Tasks (${tasks.length})` },
    { id: 'recipes',  label: 'Recipe Ingredients' },
    { id: 'github',   label: 'GitHub Links' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notion Integration</h1>
          <p className="text-slate-400 text-sm mt-0.5">Sync Projects and Tasks with your Notion workspace</p>
        </div>
        {connected && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
            <div className={`w-2 h-2 rounded-full ${syncing ? 'bg-orange-400 animate-pulse' : 'bg-green-400 animate-pulse'}`} />
            <span className={`text-xs font-medium ${syncing ? 'text-orange-400' : 'text-green-400'}`}>
              {syncing ? 'Syncing…' : 'Live'}
            </span>
          </div>
        )}
      </div>

      <ConnectionStatus config={config} />

      {syncMsg && (
        <div className={`text-sm px-4 py-3 rounded-lg flex items-center gap-2 ${
          syncMsg.ok ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
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
            Add your Notion API key in Settings to start syncing Projects and Tasks.
          </p>
          <button onClick={() => setTab('settings')}
            className="mt-4 px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
            Open Settings
          </button>
        </div>
      ) : (
        <>
          <StatsRow projects={projects} tasks={tasks} />

          <div className="flex items-center justify-between border-b border-slate-800 pb-0">
            <div className="flex gap-1">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    tab === t.id ? 'border-orange-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pb-2">
              {tab === 'projects' && (
                <>
                  <button onClick={() => { setShowProjectForm(v => !v); setShowTaskForm(false) }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors">
                    + New Project
                  </button>
                  <button onClick={() => sync('projects')} disabled={!!syncing}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-medium transition-colors">
                    ↻ Sync Projects
                  </button>
                </>
              )}
              {tab === 'tasks' && (
                <>
                  <button onClick={() => { setShowTaskForm(v => !v); setShowProjectForm(false) }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors">
                    + New Task
                  </button>
                  {selectedProject && (
                    <button onClick={() => { setSelectedProject(null); loadTasks(null) }}
                      className="px-3 py-1.5 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-medium transition-colors">
                      ✕ Clear filter
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="pt-2">
            {/* ── Status Tab ── */}
            {tab === 'status' && (
              <div className="space-y-5">
                <SyncPanel
                  syncStatus={syncStatus}
                  autoSync={autoSync}
                  onSyncNow={sync}
                  syncing={syncing}
                  onAutoSyncChange={setAutoSync}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                            <div className={`h-full rounded-full ${meta.dot}`}
                              style={{ width: `${pct}%`, transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
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
                            <div className={`h-full rounded-full ${meta.dot}`}
                              style={{ width: `${pct}%`, transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
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
                          <p className="text-slate-600 text-xs font-mono mt-0.5 break-all">{db.id || 'Not configured'}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <p className="text-slate-300 text-xs font-medium">{db.count} records</p>
                          {db.lastSync && <p className="text-slate-600 text-xs mt-0.5">Synced {fmt(db.lastSync)}</p>}
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
                    <p className="text-sm mt-1">Click "Sync" to pull projects from Notion, or create one here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projects.map(project => (
                      <div key={project.id}
                        className={`bg-slate-900 border rounded-xl p-4 transition-all cursor-pointer hover:border-slate-700 ${
                          selectedProject?.id === project.id ? 'border-orange-500/40 bg-orange-500/5' : 'border-slate-800'
                        }`}
                        onClick={() => handleProjectFilter(project)}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-semibold">{project.name}</span>
                              <StatusBadge status={project.status} />
                              <PriorityBadge priority={project.priority} />
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-500 mt-1.5">
                              {project.start_date && <span>Start {fmtDate(project.start_date)}</span>}
                              {project.due_date && <span>Due {fmtDate(project.due_date)}</span>}
                              {project.total_tasks > 0 && <span className="text-slate-400">{project.total_tasks} tasks</span>}
                              <span className="text-blue-400/60 text-xs">Click to filter tasks →</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <StatusSelect value={project.status} onChange={s => updateProjectStatus(project, s)} disabled={updatingId === project.id} />
                            {project.notion_url && (
                              <a href={project.notion_url} target="_blank" rel="noopener noreferrer"
                                className="text-slate-500 hover:text-white transition-colors text-sm" title="Open in Notion">↗</a>
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
                {selectedProject && (
                  <div className="mb-3 flex items-center gap-2 text-sm text-blue-400/80">
                    <span>📁</span> Showing tasks for <strong>{selectedProject.name}</strong>
                  </div>
                )}
                {tasks.length === 0 ? (
                  <div className="text-center py-16 text-slate-500">
                    <p className="text-4xl mb-3">📋</p>
                    <p className="font-medium">{selectedProject ? `No tasks for "${selectedProject.name}"` : 'No tasks yet'}</p>
                    <p className="text-sm mt-1">Click "Sync" to pull tasks from Notion, or create a new one here.</p>
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
                              {task.project_name && <span className="text-blue-400/70">📁 {task.project_name}</span>}
                              {task.due_date && <span>Due {fmtDate(task.due_date)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <StatusSelect value={task.status} onChange={s => updateTaskStatus(task, s)} disabled={updatingId === task.id} />
                            {task.notion_url && (
                              <a href={task.notion_url} target="_blank" rel="noopener noreferrer"
                                className="text-slate-500 hover:text-white transition-colors text-sm" title="Open in Notion">↗</a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'recipes'  && <RecipeIngredientsTab />}
            {tab === 'github'   && <GitHubLinkTab projects={projects} />}
            {tab === 'settings' && <SettingsPanel config={config} onSaved={loadConfig} />}
          </div>
        </>
      )}
    </div>
  )
}
