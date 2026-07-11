---
name: Settings context + low-stock badge
description: App-wide live settings propagation and the sidebar low-stock alert badge
---

# SettingsContext (live settings propagation)

`src/context/SettingsContext.jsx` is the single source of app-wide settings state.
It fetches `/api/settings` once, exposes `{ settings, symbol, fmt, lowStockCount, lowStockEnabled, refresh, refreshLowStock, loading }`, and polls `/api/inventory/low-stock` every 60s.

**Why:** settings used to be fetched per-page (and currency via a module-level cache in `utils/currency.js`), so a change on the Settings page did not propagate without a page reload.

**How to apply:**
- `useCurrency()` (in `utils/currency.js`) is now a thin wrapper over `useSettings()` — keep its return shape `{ symbol, fmt }` so existing call sites keep working.
- The provider wraps ONLY the authenticated layout in `App.jsx` (not Login) because the fetches need auth. `useSettings()` has a safe fallback for any consumer rendered outside the provider.
- After any settings write, call `await refresh()` then `refreshLowStock()` (order matters when toggling `low_stock_alert_enabled`).
- `refreshLowStock` reads the current setting via a `settingsRef` (not closure) to avoid stale reads during polling.
- Keep provider callbacks memoized (stable identity) — `Inventory.load` depends on `refreshLowStock`; a non-stable identity would loop the load effect.

# Low-stock badge
Lives on the **Inventory nav item in the Sidebar** (there is no top header in this app). Red count badge when the sidebar is expanded, red dot when collapsed. Only shows when `low_stock_alert_enabled !== 'false'` AND count > 0. Refreshed after POS sales and Inventory stock changes, plus the 60s poll.
