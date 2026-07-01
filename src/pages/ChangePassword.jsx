import React, { useState, useMemo } from 'react'
import { apiFetch } from '../utils/api.js'
import { useToast } from '../context/ToastContext.jsx'

const RULES = [
  { id: 'len',   label: 'At least 8 characters',          test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter (A–Z)',      test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter (a–z)',      test: (p) => /[a-z]/.test(p) },
  { id: 'num',   label: 'One number (0–9)',                test: (p) => /[0-9]/.test(p) },
]

function PasswordInput({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-slate-400 text-sm mb-1.5 font-medium">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500 pr-10"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm transition-colors"
        >
          {show ? '🙈' : '👁️'}
        </button>
      </div>
    </div>
  )
}

export default function ChangePassword() {
  const showToast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const checks = useMemo(() => RULES.map(r => ({ ...r, ok: r.test(next) })), [next])
  const allPassed = checks.every(c => c.ok)
  const passCount = checks.filter(c => c.ok).length

  const strength = passCount === 0 ? null : passCount <= 1 ? 'weak' : passCount <= 3 ? 'fair' : 'strong'
  const strengthColor = { weak: 'bg-red-500', fair: 'bg-yellow-500', strong: 'bg-green-500' }[strength] || ''
  const strengthLabel = { weak: 'Weak', fair: 'Fair', strong: 'Strong' }[strength] || ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!current) { showToast('Please enter your current password', 'warning'); return }
    if (!allPassed) { showToast('New password does not meet all requirements', 'warning'); return }
    if (next !== confirm) { showToast('Passwords do not match', 'error'); return }
    if (next === current) { showToast('New password must differ from current password', 'warning'); return }

    setLoading(true)
    try {
      const res = await apiFetch('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ current_password: current, new_password: next })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change password')
      showToast('Password changed successfully', 'success')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Change Password</h1>
        <p className="text-slate-400 text-sm mt-1">Update your account password. You'll need your current password to confirm.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <PasswordInput
          label="Current Password"
          value={current}
          onChange={setCurrent}
          placeholder="Enter your current password"
        />

        <div className="border-t border-slate-800" />

        <PasswordInput
          label="New Password"
          value={next}
          onChange={setNext}
          placeholder="Enter new password"
        />

        {next.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500">Password Strength</span>
              <span className={`text-xs font-semibold ${strength === 'strong' ? 'text-green-400' : strength === 'fair' ? 'text-yellow-400' : 'text-red-400'}`}>
                {strengthLabel}
              </span>
            </div>
            <div className="flex gap-1 mb-3">
              {[0,1,2,3].map(i => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < passCount ? strengthColor : 'bg-slate-700'}`} />
              ))}
            </div>
            <div className="space-y-1.5">
              {checks.map(c => (
                <div key={c.id} className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${c.ok ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-500'}`}>
                    {c.ok ? '✓' : '·'}
                  </span>
                  <span className={`text-xs ${c.ok ? 'text-green-400' : 'text-slate-500'}`}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <PasswordInput
          label="Confirm New Password"
          value={confirm}
          onChange={setConfirm}
          placeholder="Re-enter new password"
        />

        {confirm.length > 0 && next !== confirm && (
          <p className="text-red-400 text-xs -mt-2">Passwords do not match</p>
        )}

        <button
          type="submit"
          disabled={loading || !current || !allPassed || next !== confirm}
          className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Changing…
            </span>
          ) : 'Change Password'}
        </button>
      </form>
    </div>
  )
}
