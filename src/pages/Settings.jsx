import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'

const TABS = [
  { id: 'general', label: '🏪 General', adminOnly: false },
  { id: 'operations', label: '⚙️ Operations', adminOnly: false },
  { id: 'staff', label: '👥 Staff', adminOnly: true },
]

const ROLES = ['admin', 'manager', 'cashier', 'kitchen', 'staff']
const ROLE_COLORS = {
  admin: 'bg-red-500/20 text-red-400 border-red-500/30',
  manager: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  cashier: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  kitchen: 'bg-green-500/20 text-green-400 border-green-500/30',
  staff: 'bg-slate-700/50 text-slate-400 border-slate-600/30',
}

function Section({ title, children }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-4">
      <h2 className="text-white font-semibold text-base mb-4 pb-3 border-b border-slate-800">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-slate-800/60 last:border-0">
      <div className="w-48 flex-shrink-0">
        <p className="text-white text-sm font-medium">{label}</p>
        {hint && <p className="text-slate-500 text-xs mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function Input({ value, onChange, type = 'text', min, max, step, placeholder, disabled, prefix, suffix }) {
  return (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-slate-400 text-sm flex-shrink-0">{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
      />
      {suffix && <span className="text-slate-400 text-sm flex-shrink-0">{suffix}</span>}
    </div>
  )
}

export default function Settings({ user }) {
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState('general')
  const [settings, setSettings] = useState({})
  const [dirty, setDirty] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [addUser, setAddUser] = useState(null)
  const [delUser, setDelUser] = useState(null)

  const loadSettings = useCallback(async () => {
    const r = await apiFetch('/api/settings')
    if (r.ok) setSettings(await r.json())
  }, [])

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    const r = await apiFetch('/api/users')
    if (r.ok) setUsers(await r.json())
    setUsersLoading(false)
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { if (tab === 'staff' && isAdmin) loadUsers() }, [tab, loadUsers, isAdmin])

  const set = (key, val) => {
    setSettings(s => ({ ...s, [key]: val }))
    setDirty(d => ({ ...d, [key]: val }))
    setSaveMsg('')
  }

  const save = async () => {
    if (!Object.keys(dirty).length) return
    setSaving(true)
    setSaveMsg('')
    try {
      const r = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(dirty)
      })
      if (r.ok) {
        setDirty({})
        setSaveMsg('Saved successfully')
        loadSettings()
      } else {
        const d = await r.json()
        setSaveMsg('Error: ' + (d.error || 'Unknown'))
      }
    } catch { setSaveMsg('Save failed') }
    setSaving(false)
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const deleteUser = async (id) => {
    const r = await apiFetch(`/api/users/${id}`, { method: 'DELETE' })
    if (r.ok) { setDelUser(null); loadUsers() }
  }

  const changeRole = async (id, role) => {
    await apiFetch(`/api/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    })
    loadUsers()
  }

  const tabs = TABS.filter(t => !t.adminOnly || isAdmin)
  const hasDirty = Object.keys(dirty).length > 0

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 text-sm mt-0.5">Configure your restaurant system</p>
        </div>
        {tab !== 'staff' && (
          <div className="flex items-center gap-3">
            {saveMsg && (
              <span className={`text-sm font-medium ${saveMsg.startsWith('Error') || saveMsg.startsWith('Save') ? 'text-red-400' : 'text-green-400'}`}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={save}
              disabled={!hasDirty || saving}
              className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? 'Saving…' : hasDirty ? `Save ${Object.keys(dirty).length} change(s)` : 'No changes'}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <>
          <Section title="Restaurant Identity">
            <Field label="Restaurant Name" hint="Shown on receipts and reports">
              <Input value={settings.restaurant_name || ''} onChange={v => set('restaurant_name', v)} placeholder="Your Restaurant" />
            </Field>
            <Field label="Tagline" hint="Subtitle shown in the sidebar">
              <Input value={settings.restaurant_tagline || ''} onChange={v => set('restaurant_tagline', v)} placeholder="Restaurant OS" />
            </Field>
            <Field label="Receipt Footer" hint="Message printed at bottom of receipts">
              <textarea
                value={settings.receipt_footer || ''}
                onChange={e => set('receipt_footer', e.target.value)}
                placeholder="Thank you for dining with us!"
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 resize-none"
              />
            </Field>
          </Section>
        </>
      )}

      {tab === 'operations' && (
        <>
          <Section title="Pricing & Tax">
            <Field label="Currency Symbol" hint="Shown next to all prices">
              <Input value={settings.currency_symbol || '$'} onChange={v => set('currency_symbol', v)} placeholder="$" />
            </Field>
            <Field label="Tax Rate" hint="Applied to all orders (%)">
              <Input
                type="number"
                value={settings.tax_rate || '11'}
                onChange={v => set('tax_rate', v)}
                min="0"
                max="100"
                step="0.1"
                suffix="%"
              />
            </Field>
          </Section>
          <Section title="Restaurant Layout">
            <Field label="Number of Tables" hint="Used in dashboard and POS table selector">
              <Input
                type="number"
                value={settings.tables_count || '10'}
                onChange={v => set('tables_count', v)}
                min="1"
                max="200"
                step="1"
                suffix="tables"
              />
            </Field>
          </Section>
          <Section title="Loyalty Program">
            <Field label="Points per Dollar" hint="Loyalty points awarded for each dollar spent">
              <Input
                type="number"
                value={settings.loyalty_points_per_dollar || '1'}
                onChange={v => set('loyalty_points_per_dollar', v)}
                min="0"
                max="100"
                step="1"
                suffix="pts / $1"
              />
            </Field>
            {settings.loyalty_points_per_dollar === '0' && (
              <div className="mt-3 text-xs text-slate-500 bg-slate-800 rounded-lg px-3 py-2">
                Setting to 0 disables the loyalty program entirely.
              </div>
            )}
          </Section>
        </>
      )}

      {tab === 'staff' && isAdmin && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-400 text-sm">{users.length} team member{users.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => setAddUser({ name: '', email: '', password: '', role: 'staff' })}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              + Add Staff
            </button>
          </div>

          {usersLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-4">
                  <div className="w-9 h-9 bg-orange-500/20 border border-orange-500/30 rounded-full flex items-center justify-center text-orange-300 text-sm font-bold flex-shrink-0">
                    {u.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{u.name} {u.id === user?.id ? <span className="text-slate-500 text-xs">(you)</span> : ''}</p>
                    <p className="text-slate-500 text-xs truncate">{u.email}</p>
                  </div>
                  {u.id !== user?.id ? (
                    <select
                      value={u.role}
                      onChange={e => changeRole(u.id, e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-500"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-full border font-medium ${ROLE_COLORS[u.role] || ROLE_COLORS.staff}`}>
                      {u.role}
                    </span>
                  )}
                  {u.id !== user?.id && (
                    <button
                      onClick={() => setDelUser(u)}
                      className="text-slate-600 hover:text-red-400 transition-colors text-sm flex-shrink-0 ml-1"
                      title="Delete user"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {addUser && (
        <AddUserModal
          onClose={() => setAddUser(null)}
          onSave={() => { setAddUser(null); loadUsers() }}
        />
      )}

      {delUser && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold mb-2">Remove {delUser.name}?</h3>
            <p className="text-slate-400 text-sm mb-5">This staff account will be permanently deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setDelUser(null)} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl transition-colors">Cancel</button>
              <button onClick={() => deleteUser(delUser.id)} className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddUserModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password) { setError('All fields are required'); return }
    setSaving(true); setError('')
    const r = await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(form) })
    if (r.ok) {
      onSave()
    } else {
      const d = await r.json()
      setError(d.error || 'Failed to create user')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-white font-bold">Add Staff Member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Full Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@restaurant.com"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Password</label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Minimum 8 characters"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Role</label>
            <select value={form.role} onChange={e => set('role', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
              {['admin', 'manager', 'cashier', 'kitchen', 'staff'].map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
            {saving ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  )
}
