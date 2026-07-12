import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../utils/api.js'
import { API } from './notionShared.jsx'

export default function SettingsPanel({ config, onSaved }) {
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
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-white font-semibold text-sm">Connection Settings</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">API Key</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder={config?.configured ? 'Enter new key to replace current…' : 'secret_xxxxxxxx…'}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-slate-600" />
            <p className="text-slate-600 text-xs mt-1">
              Get yours at{' '}
              <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer"
                className="text-orange-400 hover:text-orange-300">notion.so/my-integrations</a>.
              {' '}Leave blank to keep current.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Projects Database ID</label>
              <input type="text" value={projectsDb} onChange={e => setProjectsDb(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-orange-500"
                placeholder="bea6bf0f-16f9-455c-…" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tasks Database ID</label>
              <input type="text" value={tasksDb} onChange={e => setTasksDb(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-orange-500"
                placeholder="2ea23851-9271-456c-…" />
            </div>
          </div>
        </div>
        {msg && (
          <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {msg.text}
          </div>
        )}
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-white font-semibold text-sm mb-3">Setup Guide</h3>
        <ol className="space-y-3 text-sm">
          {[
            { n: 1, title: 'Create a Notion Integration', desc: 'Go to notion.so/my-integrations → New Integration. Choose your workspace and enable Read/Update capabilities.' },
            { n: 2, title: 'Copy the API Key', desc: 'Copy the "Internal Integration Token" (starts with secret_…) and paste it in the API Key field above.' },
            { n: 3, title: 'Share Databases with the Integration', desc: 'Open each Notion database → ··· menu → Add connections → select your integration. Do this for both Projects and Tasks databases.' },
            { n: 4, title: 'Copy Database IDs', desc: 'Each database has a UUID in its URL. Copy it and paste in the fields above. Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.' },
            { n: 5, title: 'Test and Sync', desc: 'Click "Test Connection", then go to the Status tab and click "Sync All" to pull your data.' },
          ].map(step => (
            <li key={step.n} className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {step.n}
              </span>
              <div>
                <p className="text-white text-xs font-medium">{step.title}</p>
                <p className="text-slate-500 text-xs mt-0.5">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
