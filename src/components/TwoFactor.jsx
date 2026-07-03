import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api.js'
import { useToast } from '../context/ToastContext.jsx'

export default function TwoFactor({ user, onUpdated, onClose }) {
  const showToast = useToast()
  const [status, setStatus] = useState(null) // null | { enabled, verified }
  const [setup, setSetup] = useState(null)   // { qr_url, secret }
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadStatus = async () => {
    try {
      const res = await apiFetch('/api/auth/totp/status')
      if (res.ok) setStatus(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { loadStatus() }, [])

  const startSetup = async () => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/auth/totp/setup', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSetup(d)
    } catch (err) { showToast(err.message, 'error') }
    setSaving(false)
  }

  const enableTotp = async () => {
    if (token.length !== 6) return showToast('Enter the 6-digit code from your authenticator app', 'error')
    setSaving(true)
    try {
      const res = await apiFetch('/api/auth/totp/enable', { method: 'POST', body: JSON.stringify({ token }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      showToast('Two-factor authentication enabled!', 'success')
      setSetup(null)
      setToken('')
      setStatus({ enabled: true, verified: true })
      onUpdated?.()
    } catch (err) { showToast(err.message, 'error') }
    setSaving(false)
  }

  const disableTotp = async () => {
    if (!confirm('Disable two-factor authentication? This will remove the extra security layer.')) return
    setSaving(true)
    try {
      const res = await apiFetch('/api/auth/totp', { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      showToast('2FA disabled', 'success')
      setStatus({ enabled: false, verified: false })
      onUpdated?.()
    } catch (err) { showToast(err.message, 'error') }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Current status */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
        status?.enabled
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-slate-800 border-slate-700'
      }`}>
        <span className="text-2xl">{status?.enabled ? '🔐' : '🔓'}</span>
        <div>
          <p className="text-white font-semibold">
            {status?.enabled ? 'Two-Factor Authentication is ON' : 'Two-Factor Authentication is OFF'}
          </p>
          <p className="text-slate-400 text-sm">
            {status?.enabled
              ? 'Your account is protected with a TOTP authenticator app'
              : 'Add an extra layer of security to your account'}
          </p>
        </div>
      </div>

      {/* Setup flow */}
      {!status?.enabled && !setup && (
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-slate-300 font-medium text-sm">How it works:</h3>
            <ol className="text-slate-400 text-sm space-y-1 list-decimal list-inside">
              <li>Install an authenticator app (Google Authenticator, Authy, etc.)</li>
              <li>Scan the QR code that appears after clicking Setup</li>
              <li>Enter the 6-digit code from the app to confirm</li>
            </ol>
          </div>
          <button onClick={startSetup} disabled={saving}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
            {saving ? 'Setting up…' : 'Setup 2FA'}
          </button>
        </div>
      )}

      {!status?.enabled && setup && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-slate-300 text-sm mb-3">Scan this QR code with your authenticator app:</p>
            <div className="bg-white p-4 rounded-xl inline-block shadow-lg">
              <img src={setup.qr_url} alt="2FA QR Code" className="w-48 h-48" />
            </div>
            <details className="mt-3">
              <summary className="text-slate-500 text-xs cursor-pointer hover:text-slate-400">
                Can't scan? Enter manually
              </summary>
              <p className="text-slate-400 font-mono text-xs mt-2 bg-slate-800 px-3 py-2 rounded-lg break-all">
                {setup.secret}
              </p>
            </details>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Enter the 6-digit code from your app to confirm:
            </label>
            <input
              type="text" maxLength={6} value={token}
              onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full text-center text-2xl font-mono bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 tracking-[0.5em]"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setSetup(null); setToken('') }}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
              Cancel
            </button>
            <button onClick={enableTotp} disabled={saving || token.length !== 6}
              className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
              {saving ? 'Verifying…' : 'Enable 2FA'}
            </button>
          </div>
        </div>
      )}

      {status?.enabled && (
        <button onClick={disableTotp} disabled={saving}
          className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 text-red-400 border border-red-500/30 font-medium rounded-xl transition-colors">
          {saving ? 'Disabling…' : 'Disable 2FA'}
        </button>
      )}
    </div>
  )
}
