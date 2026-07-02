import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../utils/api.js'
import { INT_API, fmt } from './notionShared.jsx'

export default function GitHubLinkTab({ projects }) {
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(null)
  const [msg, setMsg] = useState(null)

  const loadRepos = useCallback(async () => {
    try {
      const r = await apiFetch(`${INT_API}/github/repos`)
      setRepos(await r.json())
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { loadRepos() }, [loadRepos])

  const linkRepo = async (repoId, notionProjectId) => {
    setLinking(repoId)
    try {
      const r = await apiFetch(`${INT_API}/github/link-notion`, {
        method: 'POST',
        body: JSON.stringify({ github_repo_id: repoId, notion_project_id: notionProjectId || null })
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setMsg({ ok: true, text: 'Link updated.' })
      await loadRepos()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setLinking(null)
    }
  }

  if (loading) return <div className="py-16 text-center text-slate-500 text-sm">Loading repositories…</div>

  if (!repos.length) return (
    <div className="py-16 text-center text-slate-500">
      <p className="text-4xl mb-3">🐙</p>
      <p className="font-medium">No GitHub repos synced yet</p>
      <p className="text-sm mt-1">Go to the Integrations page and sync your GitHub account first.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {msg && (
        <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
      <p className="text-slate-500 text-xs">Link each GitHub repository to a Notion project to track development alongside tasks.</p>
      {repos.map(repo => (
        <div key={repo.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <a href={repo.html_url} target="_blank" rel="noopener noreferrer"
                className="text-white font-medium text-sm hover:text-orange-400 transition-colors truncate">
                {repo.full_name}
              </a>
              {repo.language && (
                <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full border border-slate-700">{repo.language}</span>
              )}
              {repo.is_private && (
                <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-500 rounded-full border border-slate-700">Private</span>
              )}
            </div>
            {repo.description && <p className="text-slate-500 text-xs mt-1 truncate">{repo.description}</p>}
            <div className="flex items-center gap-3 text-xs text-slate-600 mt-1.5">
              <span>⭐ {repo.stars}</span>
              <span>🍴 {repo.forks}</span>
              {repo.pushed_at && <span>Pushed {fmt(repo.pushed_at)}</span>}
            </div>
          </div>
          <div className="flex-shrink-0 min-w-[200px]">
            <select value={repo.notion_project_id || ''}
              onChange={e => linkRepo(repo.id, e.target.value ? parseInt(e.target.value) : null)}
              disabled={linking === repo.id}
              className="w-full bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-500 disabled:opacity-40">
              <option value="">— No Notion project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {repo.linked_project_name && (
              <p className="text-orange-400/70 text-xs mt-1 truncate">→ {repo.linked_project_name}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
