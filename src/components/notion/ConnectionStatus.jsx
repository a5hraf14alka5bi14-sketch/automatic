import React, { useState } from 'react'
import { apiFetch } from '../../utils/api.js'
import { INT_API } from './notionShared.jsx'

export default function ConnectionStatus({ config, onTest }) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(null)

  const test = async () => {
    setTesting(true); setResult(null)
    try {
      const r = await apiFetch(`${INT_API}/notion/test`, { method: 'POST' })
      const d = await r.json()
      setResult(d)
      if (onTest) onTest(d)
    } catch (e) {
      setResult({ success: false, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  const connected = config?.configured || config?.envKeyPresent
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-6 h-6" fill="currentColor">
              <path className="text-white" d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-3.883.193-5.44-.387-7.377-2.723L3.507 79.097c-2.137-2.72-3.107-4.273-3.107-7.193V11.113c0-3.497 1.553-6.413 5.617-6.8z" />
              <path className="text-slate-900" d="M61.35.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.79c0 2.92.97 4.473 3.107 7.193l13.583 18.148c1.937 2.336 3.493 2.916 7.377 2.723l73.257-4.323c5.433-.387 6.99-2.917 6.99-7.193V18.64c0-2.21-.873-2.847-3.507-4.64L74.167 3.143C69.893.037 68.147-.357 61.35.227z"/>
              <path d="M25.813 19.497c-5.243.36-6.437.447-9.417-1.99L8.927 11.3c-.777-.78-.39-1.75 1.167-1.943l53.193-3.89c4.467-.387 6.793 1.167 8.54 2.527l9.123 6.61c.39.197 1.363 1.363.193 1.363l-54.943 3.7-.39-.17zM22.753 88.48V30.833c0-2.52.777-3.7 3.107-3.893l61.443-3.507c2.14-.193 3.107 1.167 3.107 3.7v57.26c0 2.527-.97 3.89-3.107 4.083l-61.44 3.703c-2.333.193-3.11-1.167-3.11-3.7zm58.53-55.08c.387 1.75 0 3.5-1.75 3.7l-2.91.577v42.773c-2.527 1.36-4.853 2.14-6.797 2.14-3.107 0-3.883-.97-6.21-3.883l-19.03-29.94v28.97l6.02 1.363s0 3.5-4.857 3.5l-13.39.777c-.39-.777 0-2.72 1.357-3.11l3.497-.97V37.24l-4.853-.387c-.387-1.75.583-4.277 3.3-4.473l14.367-.387 19.8 30.327v-26.83l-5.047-.58c-.387-2.143 1.167-3.7 3.107-3.89l13.393-.81z" fill="white"/>
            </svg>
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Notion Workspace</h3>
          <p className={`text-xs font-medium mt-0.5 ${connected ? 'text-green-400' : 'text-slate-500'}`}>
            {connected ? 'Connected' : 'Not connected'}
            {config?.apiKeyMasked && <span className="text-slate-500 font-normal ml-1">· {config.apiKeyMasked}</span>}
          </p>
          {config?.envKeyPresent && (
            <p className="text-xs text-slate-600 mt-0.5">Key loaded from environment</p>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={test}
          disabled={testing || !connected}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-medium transition-colors"
        >
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        {result && (
          <span className={`text-xs ${result.success ? 'text-green-400' : 'text-red-400'}`}>
            {result.success ? `✓ Connected as ${result.user}` : `✗ ${result.error}`}
          </span>
        )}
      </div>
    </div>
  )
}
