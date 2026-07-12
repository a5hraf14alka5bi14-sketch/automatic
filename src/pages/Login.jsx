import React, { useState } from 'react'
import logo from '../assets/brand/logo-full.png'
import { apiUrl, API_BASE, isNativePlatform, isDesktop } from '../config.js'
import { setTokens } from '../utils/authToken.js'

// Replit Auth is a same-origin browser redirect flow — only offer it on the
// web build (not in Capacitor/Electron shells, which use bearer tokens against
// a remote API origin).
const REPLIT_AUTH_AVAILABLE = !API_BASE && !isNativePlatform() && !isDesktop()

function replitAuthError() {
  try {
    const flag = new URLSearchParams(window.location.search).get('replit_auth')
    if (flag === 'unmatched') return 'لا يوجد حساب موظف مرتبط بهذا الحساب — اطلب من المدير إضافة بريدك الإلكتروني أولًا.'
    if (flag === 'failed') return 'تعذر تسجيل الدخول عبر Replit — حاول مرة أخرى أو استخدم البريد وكلمة المرور.'
  } catch { /* ignore */ }
  return ''
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpToken, setTotpToken] = useState('')
  const [requiresTotp, setRequiresTotp] = useState(false)
  const [error, setError] = useState(replitAuthError())
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = { email, password }
      if (requiresTotp) body.totp_token = totpToken
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (data.requires_totp) {
        setRequiresTotp(true)
        setError('')
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error(data.error || 'Login failed')
      // On native shells, persist the bearer tokens returned in the body
      // (no-op on web, which keeps using the httpOnly auth cookies).
      setTokens({ token: data.token, refresh_token: data.refresh_token })
      onLogin(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center bg-white rounded-3xl p-5 mx-auto mb-5 shadow-2xl shadow-black/40 ring-1 ring-white/10">
            <img src={logo} alt="الأوتوماتيك اللبناني — Lebanese Food" className="h-24 w-auto" />
          </div>
          <h1 className="text-3xl font-bold text-white">Automatic Restaurant OS</h1>
          <p className="text-slate-400 mt-1">الأوتوماتيك اللبناني · مأكولات لبنانية</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">
            {requiresTotp ? '🔐 Two-Factor Authentication' : 'Sign In'}
          </h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

          {requiresTotp ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-slate-400 text-sm">
                Enter the 6-digit code from your authenticator app.
              </p>
              <input
                type="text"
                maxLength={6}
                value={totpToken}
                onChange={e => setTotpToken(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-3xl font-mono bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 tracking-[0.5em]"
                placeholder="000000"
                autoFocus
                required
              />
              <button type="submit" disabled={loading || totpToken.length !== 6}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50">
                {loading ? 'Verifying…' : 'Verify'}
              </button>
              <button type="button" onClick={() => { setRequiresTotp(false); setTotpToken(''); setError('') }}
                className="w-full text-slate-500 hover:text-slate-300 text-sm transition-colors">
                ← Back to login
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                  placeholder="admin@restaurant.com" required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                  placeholder="••••••••" required
                />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 mt-2">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              {REPLIT_AUTH_AVAILABLE && (
                <>
                  <div className="flex items-center gap-3 pt-1">
                    <div className="flex-1 h-px bg-slate-800" />
                    <span className="text-slate-500 text-xs">or</span>
                    <div className="flex-1 h-px bg-slate-800" />
                  </div>
                  <a href="/api/login"
                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium py-2.5 rounded-lg transition-colors">
                    <svg viewBox="0 0 32 32" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                      <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V12H8.5A1.5 1.5 0 0 1 7 10.5v-5Z"/>
                      <path d="M17 12h6.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17v-8Z"/>
                      <path d="M7 21.5A1.5 1.5 0 0 1 8.5 20H17v6.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 26.5v-5Z"/>
                    </svg>
                    Sign in with Replit
                  </a>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
