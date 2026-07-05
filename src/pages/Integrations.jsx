import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, getRateLimit } from '../utils/api.js'
import { useToast } from '../context/ToastContext.jsx'
import { useCooldown } from '../hooks/useCooldown.js'

function StatusDot({ ok, loading }) {
  if (loading) return <span className="w-2.5 h-2.5 rounded-full bg-slate-500 animate-pulse inline-block" />
  return <span className={`w-2.5 h-2.5 rounded-full inline-block ${ok ? 'bg-green-400' : 'bg-red-400'}`} />
}

function Badge({ children, color = 'slate' }) {
  const colors = {
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    slate: 'bg-slate-700 text-slate-300 border-slate-600',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[color]}`}>
      {children}
    </span>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl p-6 ${className}`}>
      {children}
    </div>
  )
}

function TestResultBox({ result, error }) {
  if (!result && !error) return null
  if (error) return (
    <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
      <p className="text-red-400 text-sm flex items-start gap-2">
        <span className="flex-shrink-0 mt-0.5">✗</span>
        <span>{error}</span>
      </p>
    </div>
  )
  return (
    <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg space-y-1">
      <p className="text-green-400 text-sm font-medium flex items-center gap-2">
        <span>✓</span> Connection successful
      </p>
      {Object.entries(result).map(([k, v]) => (
        <p key={k} className="text-slate-400 text-xs">
          <span className="text-slate-300">{k.replace(/_/g, ' ')}:</span>{' '}
          {Array.isArray(v) ? v.join(', ') : String(v)}
        </p>
      ))}
    </div>
  )
}

// ── GitHub Section ────────────────────────────────────────────────────────────

function GitHubSection({ status, onRefresh }) {
  const showToast = useToast()
  const syncCooldown = useCooldown()
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testError, setTestError] = useState(null)
  const [repos, setRepos] = useState([])
  const [showRepos, setShowRepos] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const handleSave = async () => {
    if (!token.trim()) return
    setSaving(true)
    setSaveMsg('')
    try {
      await apiFetch(`/api/integrations/github/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })
      setToken('')
      setSaveMsg('Token saved successfully')
      onRefresh()
    } catch (e) {
      setSaveMsg('Failed to save: ' + e.message)
    }
    setSaving(false)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const res = await apiFetch(`/api/integrations/github/test`, { method: 'POST' })
      const data = await res.json()
      if (data.success) setTestResult({ login: data.login, name: data.name, public_repos: data.public_repos })
      else setTestError(data.error)
    } catch (e) {
      setTestError(e.message)
    }
    setTesting(false)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await apiFetch(`/api/integrations/github/sync`, { method: 'POST' })
      const cooldown = await getRateLimit(res)
      if (cooldown) {
        syncCooldown.start(cooldown)
        showToast(`Too many sync requests. Please wait ${cooldown}s before syncing again.`, 'warning', cooldown * 1000)
        setSyncing(false)
        return
      }
      const data = await res.json()
      if (data.synced !== undefined) {
        setSyncing(false)
        setShowRepos(true)
        const r2 = await apiFetch(`/api/integrations/github/repos`)
        setRepos(await r2.json())
        onRefresh()
        return
      }
    } catch (e) { /* ignore */ }
    setSyncing(false)
  }

  const loadRepos = async () => {
    const r = await apiFetch(`/api/integrations/github/repos`)
    setRepos(await r.json())
    setShowRepos(true)
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-xl">
            🐙
          </div>
          <div>
            <h3 className="text-white font-semibold text-base">GitHub</h3>
            <p className="text-slate-400 text-sm">Repository metadata sync</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot ok={status?.configured} />
          <Badge color={status?.configured ? 'green' : 'red'}>
            {status?.configured ? 'Connected' : 'Not configured'}
          </Badge>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-white font-bold text-lg">{status?.synced_repos ?? '—'}</p>
          <p className="text-slate-400 text-xs mt-0.5">Repos synced</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-white font-bold text-lg">{status?.env_present ? '✓' : '—'}</p>
          <p className="text-slate-400 text-xs mt-0.5">Env secret</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-slate-300 font-mono text-sm truncate">{status?.masked || '—'}</p>
          <p className="text-slate-400 text-xs mt-0.5">Token (masked)</p>
        </div>
      </div>

      {/* Config */}
      <div className="space-y-3 mb-4">
        <label className="block text-slate-300 text-sm font-medium">Personal Access Token</label>
        <div className="flex gap-2">
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder={status?.configured ? '••••••••••••• (leave blank to keep current)' : 'ghp_xxxxxxxxxxxxxxxx'}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
          <button
            onClick={handleSave}
            disabled={saving || !token.trim()}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {saveMsg && <p className={`text-xs ${saveMsg.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>{saveMsg}</p>}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={testing || !status?.configured}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-sm rounded-lg transition-colors border border-slate-700"
        >
          {testing ? <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" /> : '⚡'}
          Test connection
        </button>
        <button
          onClick={handleSync}
          disabled={syncing || syncCooldown.cooling || !status?.configured}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-sm rounded-lg transition-colors border border-slate-700"
        >
          {syncing ? <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" /> : '🔄'}
          {syncCooldown.cooling ? `Wait ${syncCooldown.remaining}s` : 'Sync repos'}
        </button>
        {status?.synced_repos > 0 && (
          <button
            onClick={loadRepos}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors border border-slate-700"
          >
            📂 View repos
          </button>
        )}
      </div>

      <TestResultBox result={testResult} error={testError} />

      {showRepos && repos.length > 0 && (
        <div className="mt-4 border border-slate-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
            <span className="text-slate-300 text-sm font-medium">{repos.length} Repositories</span>
            <button onClick={() => setShowRepos(false)} className="text-slate-500 hover:text-slate-300 text-xs">Hide</button>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-800">
            {repos.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/50">
                <div className="min-w-0">
                  <a href={r.html_url} target="_blank" rel="noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium truncate block">
                    {r.full_name}
                  </a>
                  {r.description && <p className="text-slate-500 text-xs truncate">{r.description}</p>}
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  {r.language && <Badge color="slate">{r.language}</Badge>}
                  {r.is_private && <Badge color="orange">private</Badge>}
                  <span className="text-slate-500 text-xs">★{r.stars}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Docs */}
      <details className="mt-5">
        <summary className="text-slate-400 text-sm cursor-pointer hover:text-slate-300 select-none">
          📖 How to configure GitHub
        </summary>
        <div className="mt-3 space-y-2 text-slate-400 text-sm leading-relaxed">
          <p>1. Go to <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">github.com/settings/tokens</a></p>
          <p>2. Click <strong className="text-slate-300">Generate new token (classic)</strong></p>
          <p>3. Select scopes: <code className="bg-slate-800 px-1 rounded text-xs">repo</code>, <code className="bg-slate-800 px-1 rounded text-xs">read:user</code>, <code className="bg-slate-800 px-1 rounded text-xs">read:org</code></p>
          <p>4. Copy the token (starts with <code className="bg-slate-800 px-1 rounded text-xs">ghp_</code>) and paste it above</p>
          <p className="text-slate-500">The token is stored in your Replit secret <code className="bg-slate-800 px-1 rounded text-xs">GITHUB_TOKEN</code> and never exposed to the browser.</p>
        </div>
      </details>
    </Card>
  )
}

// ── Notion Section ────────────────────────────────────────────────────────────

function NotionSection({ status, onRefresh }) {
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState('')
  const [projectsDb, setProjectsDb] = useState('')
  const [tasksDb, setTasksDb] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testError, setTestError] = useState(null)
  const [saveMsg, setSaveMsg] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await apiFetch(`/api/integrations/notion/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, projectsDb, tasksDb })
      })
      setApiKey('')
      setSaveMsg('Settings saved successfully')
      onRefresh()
    } catch (e) {
      setSaveMsg('Failed to save: ' + e.message)
    }
    setSaving(false)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const res = await apiFetch(`/api/integrations/notion/test`, { method: 'POST' })
      const data = await res.json()
      if (data.success) setTestResult({ user: data.user, type: data.type })
      else setTestError(data.error)
    } catch (e) {
      setTestError(e.message)
    }
    setTesting(false)
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-xl">
            📓
          </div>
          <div>
            <h3 className="text-white font-semibold text-base">Notion</h3>
            <p className="text-slate-400 text-sm">Project & task sync</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot ok={status?.configured} />
          <Badge color={status?.configured ? 'green' : 'red'}>
            {status?.configured ? 'Connected' : 'Not configured'}
          </Badge>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-white font-bold text-lg">{status?.synced_projects ?? '—'}</p>
          <p className="text-slate-400 text-xs mt-0.5">Projects synced</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-white font-bold text-lg">{status?.synced_tasks ?? '—'}</p>
          <p className="text-slate-400 text-xs mt-0.5">Tasks synced</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-slate-300 font-mono text-sm truncate">{status?.masked || '—'}</p>
          <p className="text-slate-400 text-xs mt-0.5">Key (masked)</p>
        </div>
      </div>

      {/* Config */}
      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-slate-300 text-sm font-medium mb-1.5">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={status?.configured ? '••••••••••••• (leave blank to keep current)' : 'secret_xxxxxxxx'}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-slate-400 text-xs mb-1">Projects DB ID</label>
            <input
              value={projectsDb}
              onChange={e => setProjectsDb(e.target.value)}
              placeholder={status?.projects_db?.slice(0, 8) + '…' || 'xxxxxxxx-…'}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Tasks DB ID</label>
            <input
              value={tasksDb}
              onChange={e => setTasksDb(e.target.value)}
              placeholder={status?.tasks_db?.slice(0, 8) + '…' || 'xxxxxxxx-…'}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saveMsg && <p className={`text-xs ${saveMsg.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>{saveMsg}</p>}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={testing || !status?.configured}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-sm rounded-lg transition-colors border border-slate-700"
        >
          {testing ? <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" /> : '⚡'}
          Test connection
        </button>
        <button type="button" onClick={() => navigate('/notion')}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors border border-slate-700">
          📓 Open Notion page
        </button>
      </div>

      <TestResultBox result={testResult} error={testError} />

      <details className="mt-5">
        <summary className="text-slate-400 text-sm cursor-pointer hover:text-slate-300 select-none">
          📖 How to configure Notion
        </summary>
        <div className="mt-3 space-y-2 text-slate-400 text-sm leading-relaxed">
          <p>1. Go to <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">notion.so/my-integrations</a></p>
          <p>2. Create a new integration, copy the <strong className="text-slate-300">Internal Integration Token</strong></p>
          <p>3. Share each database with your integration (open DB → ··· → Connections)</p>
          <p>4. Copy each database ID from its URL (the UUID after the workspace name)</p>
          <p className="text-slate-500">Stored in <code className="bg-slate-800 px-1 rounded text-xs">NOTION_API_KEY</code> secret — never exposed to the browser.</p>
        </div>
      </details>
    </Card>
  )
}

// ── OpenAI Section ────────────────────────────────────────────────────────────

function OpenAISection({ status, onRefresh }) {
  const showToast = useToast()
  const summaryCooldown = useCooldown()
  const chatCooldown = useCooldown()
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testError, setTestError] = useState(null)
  const [saveMsg, setSaveMsg] = useState('')
  const [prompt, setPrompt] = useState('')
  const [aiReply, setAiReply] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [summary, setSummary] = useState(null)
  const [summaryAt, setSummaryAt] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')

  useEffect(() => {
    apiFetch('/api/integrations/openai/summary')
      .then(r => r.json())
      .then(d => { if (d.summary) { setSummary(d.summary); setSummaryAt(d.generated_at) } })
      .catch(() => {})
  }, [])

  const handleGenerateSummary = async () => {
    setSummaryLoading(true)
    setSummaryError('')
    try {
      const res = await apiFetch('/api/integrations/openai/summary', { method: 'POST' })
      const cooldown = await getRateLimit(res)
      if (cooldown) {
        summaryCooldown.start(cooldown)
        showToast(`Too many AI requests. Please wait ${cooldown}s before generating another summary.`, 'warning', cooldown * 1000)
        setSummaryLoading(false)
        return
      }
      const data = await res.json()
      if (data.summary) { setSummary(data.summary); setSummaryAt(data.generated_at) }
      else setSummaryError(data.error || 'Failed to generate summary')
    } catch (e) {
      setSummaryError(e.message)
    }
    setSummaryLoading(false)
  }

  const handleSave = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    setSaveMsg('')
    try {
      await apiFetch(`/api/integrations/openai/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      })
      setApiKey('')
      setSaveMsg('API key saved successfully')
      onRefresh()
    } catch (e) {
      setSaveMsg('Failed to save: ' + e.message)
    }
    setSaving(false)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const res = await apiFetch(`/api/integrations/openai/test`, { method: 'POST' })
      const data = await res.json()
      if (data.success) setTestResult({ models_available: data.models_available, gpt_models: data.gpt_models })
      else setTestError(data.error)
    } catch (e) {
      setTestError(e.message)
    }
    setTesting(false)
  }

  const handleChat = async () => {
    if (!prompt.trim()) return
    setAiLoading(true)
    setAiReply('')
    setAiError('')
    try {
      const res = await apiFetch(`/api/integrations/openai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a helpful assistant for a restaurant management system called Automatic.' },
            { role: 'user', content: prompt }
          ]
        })
      })
      const cooldown = await getRateLimit(res)
      if (cooldown) {
        chatCooldown.start(cooldown)
        showToast(`Too many AI requests. Please wait ${cooldown}s before asking again.`, 'warning', cooldown * 1000)
        setAiLoading(false)
        return
      }
      const data = await res.json()
      if (data.reply) setAiReply(data.reply)
      else setAiError(data.error || 'No reply received')
    } catch (e) {
      setAiError(e.message)
    }
    setAiLoading(false)
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-xl">
            🤖
          </div>
          <div>
            <h3 className="text-white font-semibold text-base">OpenAI</h3>
            <p className="text-slate-400 text-sm">AI-powered features</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot ok={status?.configured} />
          <Badge color={status?.configured ? 'green' : 'red'}>
            {status?.configured ? 'Connected' : 'Not configured'}
          </Badge>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-white font-bold text-lg">{status?.configured ? '✓' : '—'}</p>
          <p className="text-slate-400 text-xs mt-0.5">API ready</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-white font-bold text-lg">{status?.env_present ? '✓' : '—'}</p>
          <p className="text-slate-400 text-xs mt-0.5">Env secret</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-slate-300 font-mono text-sm truncate">{status?.masked || '—'}</p>
          <p className="text-slate-400 text-xs mt-0.5">Key (masked)</p>
        </div>
      </div>

      {/* Config */}
      <div className="space-y-3 mb-4">
        <label className="block text-slate-300 text-sm font-medium">API Key</label>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={status?.configured ? '••••••••••••• (leave blank to keep current)' : 'sk-xxxxxxxxxxxxxxxx'}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
          <button
            onClick={handleSave}
            disabled={saving || !apiKey.trim()}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {saveMsg && <p className={`text-xs ${saveMsg.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>{saveMsg}</p>}
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={handleTest}
          disabled={testing || !status?.configured}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-sm rounded-lg transition-colors border border-slate-700"
        >
          {testing ? <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" /> : '⚡'}
          Test connection
        </button>
      </div>

      <TestResultBox result={testResult} error={testError} />

      {/* Live chat demo */}
      {status?.configured && (
        <div className="mt-5 border border-slate-700 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-700">
            <span className="text-slate-300 text-sm font-medium">🧪 Live AI demo — ask anything about your restaurant</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <input
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChat()}
                placeholder="e.g. Suggest a daily special based on our menu…"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
              <button
                onClick={handleChat}
                disabled={aiLoading || chatCooldown.cooling || !prompt.trim()}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {aiLoading
                  ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block" />
                  : chatCooldown.cooling ? `Wait ${chatCooldown.remaining}s` : 'Ask'}
              </button>
            </div>
            {aiReply && (
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{aiReply}</p>
              </div>
            )}
            {aiError && <p className="text-red-400 text-sm">{aiError}</p>}
          </div>
        </div>
      )}

      {/* Daily AI Summary */}
      {status?.configured && (
        <div className="mt-5 border border-slate-700 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
            <span className="text-slate-300 text-sm font-medium">📊 Daily AI Summary</span>
            <button
              onClick={handleGenerateSummary}
              disabled={summaryLoading || summaryCooldown.cooling}
              className="px-3 py-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            >
              {summaryLoading
                ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block" />
                : '✨'}
              {summaryLoading ? 'Generating…' : summaryCooldown.cooling ? `Wait ${summaryCooldown.remaining}s` : 'Generate'}
            </button>
          </div>
          <div className="p-4">
            {summaryError && <p className="text-red-400 text-sm mb-3">{summaryError}</p>}
            {summary ? (
              <>
                <p className="text-slate-300 text-sm leading-relaxed">{summary}</p>
                {summaryAt && (
                  <p className="text-slate-600 text-xs mt-2">Generated: {new Date(summaryAt).toLocaleString()}</p>
                )}
              </>
            ) : (
              <p className="text-slate-500 text-sm">No summary yet. Click Generate to create a daily performance summary powered by AI.</p>
            )}
          </div>
        </div>
      )}

      <details className="mt-5">
        <summary className="text-slate-400 text-sm cursor-pointer hover:text-slate-300 select-none">
          📖 How to configure OpenAI
        </summary>
        <div className="mt-3 space-y-2 text-slate-400 text-sm leading-relaxed">
          <p>1. Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">platform.openai.com/api-keys</a></p>
          <p>2. Click <strong className="text-slate-300">Create new secret key</strong></p>
          <p>3. Copy the key (starts with <code className="bg-slate-800 px-1 rounded text-xs">sk-</code>) and paste it above</p>
          <p>4. Make sure your account has billing enabled for API calls</p>
          <p className="text-slate-500">Stored in <code className="bg-slate-800 px-1 rounded text-xs">OPENAI_API_KEY</code> secret — never exposed to the browser. Recommended model: <code className="bg-slate-800 px-1 rounded text-xs">gpt-4o-mini</code> for cost efficiency.</p>
        </div>
      </details>
    </Card>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Integrations() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/integrations`)
      if (!res.ok) throw new Error('Failed to load integration status')
      setStatus(await res.json())
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const connectedCount = status
    ? [status.github?.configured, status.notion?.configured, status.openai?.configured].filter(Boolean).length
    : 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-white text-2xl font-bold">Integrations</h1>
          <button
            onClick={() => { setLoading(true); fetchStatus() }}
            className="text-slate-400 hover:text-white text-sm flex items-center gap-1.5 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
        <p className="text-slate-400 text-sm">Connect external services to power AI features, sync repositories, and manage projects.</p>

        {!loading && status && (
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[status.github, status.notion, status.openai].map((s, i) => (
                  <span key={i} className={`w-2 h-2 rounded-full ${s?.configured ? 'bg-green-400' : 'bg-slate-600'}`} />
                ))}
              </div>
              <span className="text-slate-400 text-sm">
                <span className="text-white font-medium">{connectedCount}</span> of 3 connected
              </span>
            </div>
            {connectedCount === 3 && (
              <Badge color="green">All systems operational</Badge>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Loading integration status…</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 mb-6">
          <p className="text-red-400 text-sm">⚠ {error}</p>
        </div>
      )}

      {!loading && status && (
        <div className="space-y-5">
          <GitHubSection status={status.github} onRefresh={fetchStatus} />
          <NotionSection status={status.notion} onRefresh={fetchStatus} />
          <OpenAISection status={status.openai} onRefresh={fetchStatus} />
        </div>
      )}

      {/* Security note */}
      <div className="mt-6 p-4 bg-slate-900 border border-slate-700 rounded-xl">
        <h4 className="text-slate-300 text-sm font-medium mb-2 flex items-center gap-2">🔒 Security</h4>
        <ul className="space-y-1 text-slate-500 text-xs">
          <li>• All API keys are stored as Replit environment secrets — they are never sent to the browser</li>
          <li>• Keys shown above are masked; only the first 6 and last 4 characters are visible</li>
          <li>• Connection tests are performed server-side; responses contain only metadata (username, model count, etc.)</li>
          <li>• Saving a new key in the settings form overwrites the previous value in the database</li>
        </ul>
      </div>
    </div>
  )
}
