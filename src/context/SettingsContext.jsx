/**
 * App-wide settings + low-stock state.
 * Fetches all settings once on mount and exposes a refresh() so changes made
 * on the Settings page propagate live (no page reload). Also polls the
 * low-stock count for the sidebar alert badge, respecting the
 * `low_stock_alert_enabled` setting.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../utils/api.js'

const DEFAULTS = {
  restaurant_name: 'Automatic',
  restaurant_tagline: 'Restaurant OS',
  tax_rate: '11',
  currency_symbol: 'OMR',
  tables_count: '10',
  receipt_footer: 'Thank you for dining with us!',
  low_stock_alert_enabled: 'true',
  loyalty_points_per_omr: '1',
}

const LOW_STOCK_POLL_MS = 60000

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const refresh = useCallback(async () => {
    try {
      const r = await apiFetch('/api/settings')
      const d = await r.json()
      if (d && !d.error) setSettings({ ...DEFAULTS, ...d })
      return d
    } catch { /* keep current */ }
  }, [])

  const refreshLowStock = useCallback(async () => {
    if (settingsRef.current.low_stock_alert_enabled === 'false') {
      setLowStockCount(0)
      return
    }
    try {
      const r = await apiFetch('/api/inventory/low-stock')
      const d = await r.json()
      setLowStockCount(Array.isArray(d) ? d.length : 0)
    } catch { /* keep current */ }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      await refresh()
      if (alive) { await refreshLowStock(); setLoading(false) }
    })()
    const timer = setInterval(() => { refreshLowStock() }, LOW_STOCK_POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [refresh, refreshLowStock])

  const symbol = settings.currency_symbol || 'OMR'
  const fmt = useCallback(
    (amount) => `${symbol} ${(parseFloat(amount) || 0).toFixed(3)}`,
    [symbol]
  )

  const value = {
    settings,
    symbol,
    fmt,
    loading,
    lowStockCount,
    lowStockEnabled: settings.low_stock_alert_enabled !== 'false',
    refresh,
    refreshLowStock,
  }

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    // Safe fallback when used outside the provider (e.g. login screen).
    return {
      settings: DEFAULTS,
      symbol: 'OMR',
      fmt: (a) => `OMR ${(parseFloat(a) || 0).toFixed(3)}`,
      loading: false,
      lowStockCount: 0,
      lowStockEnabled: true,
      refresh: async () => {},
      refreshLowStock: async () => {},
    }
  }
  return ctx
}
