/**
 * Shared currency utility — one fetch per session, cached module-level.
 * All pages call useCurrency() and get the same cached symbol.
 * Default: OMR (Omani Rial) — 3 decimal places standard.
 */
import { useState, useEffect } from 'react'
import { apiFetch } from './api.js'

let _cache = null
let _promise = null

function _loadSymbol() {
  if (_cache !== null) return Promise.resolve(_cache)
  if (!_promise) {
    _promise = apiFetch('/api/settings')
      .then(r => r.json())
      .then(d => { _cache = d.currency_symbol || 'OMR'; return _cache })
      .catch(() => { _cache = 'OMR'; return 'OMR' })
  }
  return _promise
}

export function invalidateCurrencyCache() {
  _cache = null
  _promise = null
}

export function useCurrency() {
  const [symbol, setSymbol] = useState(_cache || 'OMR')

  useEffect(() => {
    _loadSymbol().then(s => setSymbol(s))
  }, [])

  const fmt = (amount) => {
    const n = parseFloat(amount) || 0
    return `${symbol} ${n.toFixed(3)}`
  }

  return { symbol, fmt }
}
