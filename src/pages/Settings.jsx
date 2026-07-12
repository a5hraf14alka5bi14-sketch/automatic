import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { useSettings } from '../context/SettingsContext.jsx'

const TABS = [
  { id: 'general', label: '🏪 General', adminOnly: false },
  { id: 'operations', label: '⚙️ Operations', adminOnly: false },
  { id: 'branches', label: '🏢 Branches', adminOnly: true },
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
    <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4 py-3 border-b border-slate-800/60 last:border-0">
      <div className="sm:w-48 flex-shrink-0">
        <p className="text-white text-sm font-medium">{label}</p>
        {hint && <p className="text-slate-500 text-xs mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function Input({ value, onChange, type = 'text', min, max, step, placeholder, disabled, prefix, suffix, dir }) {
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
        dir={dir}
        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
      />
      {suffix && <span className="text-slate-400 text-sm flex-shrink-0">{suffix}</span>}
    </div>
  )
}

export default function Settings({ user }) {
  const isAdmin = user?.role === 'admin'
  const { refresh: refreshGlobalSettings, refreshLowStock } = useSettings()
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
        await refreshGlobalSettings()
        refreshLowStock()
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
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
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
            <Field label="Restaurant Name (Arabic)" hint="الاسم بالعربية — يظهر في الفاتورة">
              <Input value={settings.restaurant_name_ar || ''} onChange={v => set('restaurant_name_ar', v)} placeholder="الأوتوماتيك" dir="rtl" />
            </Field>
            <Field label="Receipt Footer" hint="Message printed at bottom of receipts">
              <textarea
                value={settings.receipt_footer || ''}
                onChange={e => set('receipt_footer', e.target.value)}
                placeholder="THANK YOU & VISIT AGAIN"
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 resize-none"
              />
            </Field>
            <Field label="Receipt Footer (Arabic)" hint="رسالة أسفل الفاتورة بالعربية">
              <textarea
                value={settings.receipt_footer_ar || ''}
                onChange={e => set('receipt_footer_ar', e.target.value)}
                placeholder="شكرا لك والزيارة مرة أخرى"
                dir="rtl"
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 resize-none"
              />
            </Field>
          </Section>

          <Section title="Business Info (Tax Invoice) · بيانات الفاتورة الضريبية">
            <Field label="Legal Business Name" hint="Printed under the logo on the receipt">
              <Input value={settings.business_legal_name || ''} onChange={v => set('business_legal_name', v)} placeholder="Automatic Lebanese Restaurant & Catering" />
            </Field>
            <Field label="Legal Business Name (Arabic)" hint="الاسم القانوني بالعربية">
              <Input value={settings.business_legal_name_ar || ''} onChange={v => set('business_legal_name_ar', v)} placeholder="مطعم ومقهى الأوتوماتيك اللبناني" dir="rtl" />
            </Field>
            <Field label="CR No." hint="رقم السجل التجاري — Commercial Registration">
              <Input value={settings.business_cr_no || ''} onChange={v => set('business_cr_no', v)} placeholder="1234568" />
            </Field>
            <Field label="Tax Card No." hint="رقم البطاقة الضريبية">
              <Input value={settings.business_tax_card || ''} onChange={v => set('business_tax_card', v)} placeholder="1017973" />
            </Field>
            <Field label="Phone" hint="رقم الهاتف المطبوع على الفاتورة">
              <Input value={settings.business_phone || ''} onChange={v => set('business_phone', v)} placeholder="+968 24499981" />
            </Field>
          </Section>
        </>
      )}

      {tab === 'operations' && (
        <>
          <Section title="Pricing & Tax">
            <Field label="Currency Symbol" hint="Shown next to all prices">
              <Input value={settings.currency_symbol || 'OMR'} onChange={v => set('currency_symbol', v)} placeholder="OMR" />
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
            <Field label="Points per OMR" hint="Loyalty points awarded for each Omani Rial spent">
              <Input
                type="number"
                value={settings.loyalty_points_per_omr || '1'}
                onChange={v => set('loyalty_points_per_omr', v)}
                min="0"
                max="100"
                step="1"
                suffix="pts / OMR 1"
              />
            </Field>
            {settings.loyalty_points_per_omr === '0' && (
              <div className="mt-3 text-xs text-slate-500 bg-slate-800 rounded-lg px-3 py-2">
                Setting to 0 disables the loyalty program entirely.
              </div>
            )}
          </Section>

          <StationsSection />

          <Section title="🔐 Security">
            <Field label="Void Manager PIN" hint="Cashiers must enter this PIN to void a completed order. Leave blank to require manager login instead.">
              <Input
                type="password"
                value={settings.void_manager_pin || ''}
                onChange={v => set('void_manager_pin', v)}
                placeholder="4-digit PIN (e.g. 1234)"
                maxLength={20}
              />
            </Field>
            {settings.void_manager_pin && (
              <div className="mt-3 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                ⚠️ PIN is set. Cashiers will be prompted for this PIN when voiding completed orders.
              </div>
            )}
          </Section>
        </>
      )}

      {tab === 'branches' && isAdmin && <BranchesSection />}

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

// ── Kitchen station management ────────────────────────────────────────────────
// Managed list of stations (kitchen, bar, drinks, grill, …) used by the KDS
// filter, order routing, and menu-item assignment. Add / rename / retire —
// retiring keeps historical orders intact but removes the station from
// dropdowns and stops new orders routing to it.
function StationsSection() {
  const [stations, setStations] = useState([])
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(null) // { id, name }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/stations/all')
      if (r.ok) setStations(await r.json())
    } catch {}
  }, [])
  useEffect(() => { load() }, [load])

  const call = async (fn) => {
    setBusy(true); setError('')
    let ok = false
    try {
      const r = await fn()
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setError(d.error || 'Request failed')
      } else {
        ok = true
        await load()
      }
    } catch { setError('Request failed') }
    setBusy(false)
    return ok
  }

  const addStation = async () => {
    if (!newName.trim()) return
    const ok = await call(() => apiFetch('/api/stations', { method: 'POST', body: JSON.stringify({ name: newName }) }))
    if (ok) setNewName('')
  }

  const saveRename = async () => {
    if (!editing || !editing.name.trim()) return
    const ok = await call(() => apiFetch(`/api/stations/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: editing.name }) }))
    if (ok) setEditing(null)
  }

  const toggleActive = (s) => {
    call(() => apiFetch(`/api/stations/${s.id}`, { method: 'PATCH', body: JSON.stringify({ active: !s.active }) }))
  }

  return (
    <Section title="🍳 Kitchen Stations · محطات المطبخ">
      <p className="text-slate-500 text-xs mb-3">
        Stations are where order tickets appear in the Kitchen display and print as KOTs.
        Retiring a station hides it from filters and stops new orders routing to it — past orders are untouched.
      </p>
      {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">{error}</p>}
      <div className="space-y-2 mb-4">
        {stations.map(s => (
          <div key={s.id} className={`flex items-center gap-3 bg-slate-800/60 border rounded-lg px-3 py-2 ${s.active ? 'border-slate-700' : 'border-slate-800 opacity-60'}`}>
            {editing?.id === s.id ? (
              <>
                <input
                  value={editing.name}
                  onChange={e => setEditing(ed => ({ ...ed, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(null) }}
                  autoFocus
                  className="flex-1 bg-slate-800 border border-orange-500 rounded-lg px-2 py-1 text-white text-sm focus:outline-none"
                />
                <button onClick={saveRename} disabled={busy} className="text-green-400 hover:text-green-300 text-xs font-semibold disabled:opacity-50">Save</button>
                <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-white text-xs">Cancel</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-white text-sm capitalize">{s.name}</span>
                {!s.active && <span className="text-[10px] uppercase tracking-wide text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">Retired</span>}
                <button onClick={() => setEditing({ id: s.id, name: s.name })} disabled={busy}
                  className="text-slate-400 hover:text-white text-xs disabled:opacity-50">Rename</button>
                <button onClick={() => toggleActive(s)} disabled={busy}
                  className={`text-xs font-medium disabled:opacity-50 ${s.active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`}>
                  {s.active ? 'Retire' : 'Reactivate'}
                </button>
              </>
            )}
          </div>
        ))}
        {!stations.length && <p className="text-slate-500 text-sm">No stations yet.</p>}
      </div>
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addStation() }}
          placeholder="New station name (e.g. grill)"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
        />
        <button onClick={addStation} disabled={busy || !newName.trim()}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
          + Add
        </button>
      </div>
    </Section>
  )
}

// ── Branch management ─────────────────────────────────────────────────────────
// Allows admins to add/rename/deactivate branches and mark one as default.
// branch_id is stored on every order for per-branch reporting.
function BranchesSection() {
  const [branches, setBranches] = useState([])
  const [newBranch, setNewBranch] = useState({ name: '', name_ar: '', address: '', phone: '' })
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/branches/all')
      if (r.ok) setBranches(await r.json())
    } catch {}
  }, [])
  useEffect(() => { load() }, [load])

  const call = async (fn) => {
    setBusy(true); setError('')
    let ok = false
    try {
      const r = await fn()
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setError(d.error || 'Request failed')
      } else {
        ok = true
        await load()
      }
    } catch { setError('Request failed') }
    setBusy(false)
    return ok
  }

  const addBranch = async () => {
    if (!newBranch.name.trim()) return
    const ok = await call(() => apiFetch('/api/branches', {
      method: 'POST',
      body: JSON.stringify(newBranch),
    }))
    if (ok) { setNewBranch({ name: '', name_ar: '', address: '', phone: '' }); setShowForm(false) }
  }

  const saveEdit = async () => {
    if (!editing || !editing.name.trim()) return
    const ok = await call(() => apiFetch(`/api/branches/${editing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: editing.name, name_ar: editing.name_ar, address: editing.address, phone: editing.phone }),
    }))
    if (ok) setEditing(null)
  }

  const setDefault = (id) => call(() => apiFetch(`/api/branches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_default: true }),
  }))

  const toggleActive = (b) => call(() => apiFetch(`/api/branches/${b.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: !b.is_active }),
  }))

  const qrUrl = typeof window !== 'undefined' ? `${window.location.origin}/qr-menu` : '/qr-menu'

  return (
    <Section title="🏢 Branch Management · إدارة الفروع">
      <p className="text-slate-500 text-xs mb-4">
        Each branch can have its own name, contact info, and is linked to the orders placed there.
        Mark one branch as <strong className="text-slate-400">Default</strong> to pre-select it in the POS.
      </p>

      {/* QR Menu link */}
      <div className="mb-5 flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3">
        <span className="text-2xl select-none">📱</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium">Customer QR Menu</p>
          <a href={qrUrl} target="_blank" rel="noopener noreferrer"
            className="text-orange-400 hover:text-orange-300 text-xs break-all transition-colors">
            {qrUrl}
          </a>
        </div>
        <button
          onClick={() => { navigator.clipboard?.writeText(qrUrl); }}
          className="text-slate-400 hover:text-white text-xs px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg transition-colors"
          title="Copy link"
        >
          Copy
        </button>
      </div>

      {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {/* Branch list */}
      <div className="space-y-2 mb-4">
        {branches.map(b => (
          <div key={b.id}
            className={`bg-slate-800/60 border rounded-xl p-3 transition-opacity ${b.is_active ? 'border-slate-700' : 'border-slate-800 opacity-55'}`}
          >
            {editing?.id === b.id ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input value={editing.name}
                    onChange={e => setEditing(ed => ({ ...ed, name: e.target.value }))}
                    placeholder="Branch name (EN)"
                    className="flex-1 bg-slate-800 border border-orange-500 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none" />
                  <input value={editing.name_ar || ''}
                    onChange={e => setEditing(ed => ({ ...ed, name_ar: e.target.value }))}
                    placeholder="الاسم بالعربية"
                    dir="rtl"
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none" />
                </div>
                <div className="flex gap-2">
                  <input value={editing.address || ''}
                    onChange={e => setEditing(ed => ({ ...ed, address: e.target.value }))}
                    placeholder="Address"
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none" />
                  <input value={editing.phone || ''}
                    onChange={e => setEditing(ed => ({ ...ed, phone: e.target.value }))}
                    placeholder="Phone"
                    className="w-36 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none" />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-white text-xs px-3 py-1.5">Cancel</button>
                  <button onClick={saveEdit} disabled={busy}
                    className="text-white text-xs font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors">
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white text-sm font-semibold">{b.name}</span>
                    {b.name_ar && <span className="text-slate-400 text-xs" dir="rtl">{b.name_ar}</span>}
                    {b.is_default && (
                      <span className="text-[10px] uppercase tracking-wide text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-2 py-0.5">
                        Default
                      </span>
                    )}
                    {!b.is_active && (
                      <span className="text-[10px] uppercase tracking-wide text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                        Inactive
                      </span>
                    )}
                  </div>
                  {b.address && <p className="text-slate-500 text-xs mt-0.5">{b.address}</p>}
                  {b.phone && <p className="text-slate-500 text-xs">{b.phone}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!b.is_default && b.is_active && (
                    <button onClick={() => setDefault(b.id)} disabled={busy}
                      className="text-xs text-slate-400 hover:text-orange-400 disabled:opacity-50 transition-colors">
                      Set Default
                    </button>
                  )}
                  <button onClick={() => setEditing({ id: b.id, name: b.name, name_ar: b.name_ar || '', address: b.address || '', phone: b.phone || '' })}
                    disabled={busy}
                    className="text-xs text-slate-400 hover:text-white disabled:opacity-50">
                    Edit
                  </button>
                  {!b.is_default && (
                    <button onClick={() => toggleActive(b)} disabled={busy}
                      className={`text-xs font-medium disabled:opacity-50 ${b.is_active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`}>
                      {b.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {!branches.length && <p className="text-slate-500 text-sm">No branches yet.</p>}
      </div>

      {/* Add branch */}
      {showForm ? (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
          <h4 className="text-white text-sm font-semibold">Add Branch</h4>
          <div className="flex gap-2">
            <input value={newBranch.name}
              onChange={e => setNewBranch(b => ({ ...b, name: e.target.value }))}
              placeholder="Branch name *"
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
            <input value={newBranch.name_ar}
              onChange={e => setNewBranch(b => ({ ...b, name_ar: e.target.value }))}
              placeholder="الاسم بالعربية"
              dir="rtl"
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div className="flex gap-2">
            <input value={newBranch.address}
              onChange={e => setNewBranch(b => ({ ...b, address: e.target.value }))}
              placeholder="Address (optional)"
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
            <input value={newBranch.phone}
              onChange={e => setNewBranch(b => ({ ...b, phone: e.target.value }))}
              placeholder="Phone (optional)"
              className="w-40 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm px-4 py-2 rounded-lg transition-colors">
              Cancel
            </button>
            <button onClick={addBranch} disabled={busy || !newBranch.name.trim()}
              className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
              {busy ? 'Adding…' : '+ Add Branch'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full px-4 py-2.5 border border-dashed border-slate-700 hover:border-orange-500 text-slate-400 hover:text-orange-400 text-sm rounded-xl transition-colors">
          + Add Branch
        </button>
      )}
    </Section>
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
