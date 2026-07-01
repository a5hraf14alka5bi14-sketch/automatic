/**
 * Shared currency helper — now backed by SettingsContext so the symbol and
 * formatting update live when settings change (no page reload).
 * Kept as a thin wrapper so existing `useCurrency()` call sites keep working.
 */
import { useSettings } from '../context/SettingsContext.jsx'

export function useCurrency() {
  const { symbol, fmt } = useSettings()
  return { symbol, fmt }
}
