import React, { useState } from 'react'
import { apiFetch } from '../../utils/api.js'
import { API } from './notionShared.jsx'

export function NewTaskForm({ projects, onCreated, onCancel }) {
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

export function NewProjectForm({ onCreated, onCancel }) {
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
