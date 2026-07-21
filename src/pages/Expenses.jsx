/**
 * Expense Management — admin/manager only.
 * Record business expenses, view breakdown by category, filter by date range.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'

const CATEGORIES = [
  'Rent', 'Utilities', 'Salaries', 'Maintenance',
  'Marketing', 'Cleaning & Supplies', 'Transport', 'Other',
]

const CAT_ICONS = {
  'Rent':               '🏠',
  'Utilities':          '💡',
  'Salaries':           '👥',
  'Maintenance':        '🔧',
  'Marketing':          '📢',
  'Cleaning & Supplies':'🧹',
  'Transport':          '🚗',
  'Other':              '📋',
}

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function Expenses() {
  const { fmt } = useCurrency()
  const userRole = (() => {
    try { return JSON.parse(localStorage.getItem('auth_user') || '{}').role || '' } catch { return '' }
  })()
  const isAdmin = userRole === 'admin'

  const [expenses,   setExpenses]   = useState([])
  const [total,      setTotal]      = useState(0)
  const [byCategory, setByCategory] = useState({})
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [successMsg, setSuccess]    = useState('')
  const [showForm,   setShowForm]   = useState(false)
  const [deleting,   setDeleting]   = useState(null)

  const [from,     setFrom]     = useState(firstOfMonth())
  const [to,       setTo]       = useState(today())
  const [catFilter,setCatFilter]= useState('')

  const [form, setForm] = useState({
    category: '', vendor: '', amount: '', date: today(), notes: '',
  })
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to)   params.set('to', to)
      if (catFilter) params.set('category', catFilter)
      const r = await apiFetch(`/api/expenses?${params}`)
      if (r.ok) {
        const d = await r.json()
        setExpenses(d.expenses || [])
        setTotal(d.total || 0)
        setByCategory(d.byCategory || {})
      }
    } catch {}
    setLoading(false)
  }, [from, to, catFilter])

  useEffect(() => { load() }, [load])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.category || !form.amount || !form.date) {
      setError('Category, amount and date are required.')
      return
    }
    setSaving(true); setError(''); setSuccess('')
    try {
      const r = await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      })
      if (r.ok) {
        setSuccess('Expense recorded.')
        setForm({ category: '', vendor: '', amount: '', date: today(), notes: '' })
        setShowForm(false)
        load()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        const d = await r.json().catch(() => ({}))
        setError(d.error || 'Failed to save.')
      }
    } catch { setError('Network error.') }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    setDeleting(id)
    try {
      const r = await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' })
      if (r.ok) load()
    } catch {}
    setDeleting(null)
  }

  // Summary cards — all categories, only those with amounts
  const catTotals = CATEGORIES
    .map(c => ({ cat: c, amt: byCategory[c] || 0 }))
    .filter(x => x.amt > 0)
    .sort((a, b) => b.amt - a.amt)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Expenses</h1>
          <p className="text-slate-400 text-sm mt-0.5">إدارة المصروفات · Admin & Manager</p>
        </div>
        <div className="flex items-center gap-3">
          {successMsg && <span className="text-green-400 text-sm font-medium">{successMsg}</span>}
          <button
            onClick={() => { setShowForm(v => !v); setError('') }}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {showForm ? '✕ Cancel' : '+ Add Expense'}
          </button>
        </div>
      </div>

      {/* ── Add Expense Form ── */}
      {showForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <h2 className="text-white font-semibold text-sm mb-4 pb-2 border-b border-slate-800">
            New Expense · مصروف جديد
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-slate-400 text-xs mb-1">Category <span className="text-red-400">*</span></label>
                <select value={form.category} onChange={e => setField('category', e.target.value)} required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                  <option value="">Select category…</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1">Vendor / Supplier · المورد</label>
                <input type="text" value={form.vendor} onChange={e => setField('vendor', e.target.value)}
                  maxLength={120} placeholder="Optional"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1">Amount (OMR) <span className="text-red-400">*</span></label>
                <input type="number" value={form.amount} onChange={e => setField('amount', e.target.value)}
                  required min="0.001" step="0.001" placeholder="0.000"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1">Date <span className="text-red-400">*</span></label>
                <input type="date" value={form.date} onChange={e => setField('date', e.target.value)} required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-slate-400 text-xs mb-1">Notes · ملاحظات</label>
              <textarea value={form.notes} onChange={e => setField('notes', e.target.value)}
                maxLength={1000} rows={2} placeholder="Optional notes…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 resize-none" />
            </div>
            {error && <p className="text-red-400 text-xs mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
              {saving ? 'Saving…' : 'Save Expense · حفظ'}
            </button>
          </form>
        </div>
      )}

      {/* ── Total + Category Summary ── */}
      {!loading && (
        <>
          <div className="bg-slate-900 border border-orange-500/20 rounded-xl p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-xs">Total Expenses · إجمالي المصروفات</p>
              <p className="text-2xl font-bold text-orange-400 mt-0.5">{fmt(total)}</p>
            </div>
            <span className="text-3xl opacity-30">💸</span>
          </div>

          {catTotals.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {catTotals.map(({ cat, amt }) => (
                <div key={cat} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <p className="text-slate-500 text-xs mb-1">{CAT_ICONS[cat]} {cat}</p>
                  <p className="text-white font-semibold text-sm">{fmt(amt)}</p>
                  <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full"
                      style={{ width: `${Math.min(100, (amt / total) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-slate-500 text-xs">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-slate-500 text-xs">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500">
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* ── Expenses Table ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-slate-500 text-sm">No expenses recorded for this period.</p>
            <p className="text-slate-600 text-xs mt-1">لا توجد مصروفات مسجلة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-3 text-slate-500 font-medium text-xs">Date</th>
                  <th className="px-4 py-3 text-slate-500 font-medium text-xs">Category</th>
                  <th className="px-4 py-3 text-slate-500 font-medium text-xs">Vendor</th>
                  <th className="px-4 py-3 text-slate-500 font-medium text-xs">Notes</th>
                  <th className="px-4 py-3 text-slate-500 font-medium text-xs text-right">Amount</th>
                  {isAdmin && <th className="px-4 py-3 text-slate-500 font-medium text-xs text-right"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {expenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-slate-800/40 transition-colors group">
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{exp.date}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                        <span>{CAT_ICONS[exp.category] || '📋'}</span>
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{exp.vendor || <span className="text-slate-600">—</span>}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">{exp.notes || <span className="text-slate-700">—</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-white font-semibold text-sm">{fmt(exp.amount)}</span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(exp.id)}
                          disabled={deleting === exp.id}
                          className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 text-xs transition-all disabled:opacity-30"
                          title="Delete expense"
                        >
                          {deleting === exp.id ? '…' : '🗑️'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700 bg-slate-800/50">
                  <td colSpan={isAdmin ? 4 : 3} className="px-4 py-3 text-slate-500 text-xs font-medium">
                    {expenses.length} record{expenses.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-orange-400 font-bold text-sm">{fmt(total)}</span>
                  </td>
                  {isAdmin && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
