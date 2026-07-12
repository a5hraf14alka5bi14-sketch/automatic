// @vitest-environment jsdom
//
// Covers src/config.js — the single place that decides whether API/WS calls go
// out relative (web, served same-origin as the API) or absolute (Capacitor /
// Electron shells, which bake in the deployed backend origin via
// VITE_API_BASE_URL). A regression here silently breaks EVERY native build's
// networking, so both modes are pinned down.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

async function loadConfig() {
  vi.resetModules()
  return import('../src/config.js')
}

describe('config — same-origin web mode (VITE_API_BASE_URL unset)', () => {
  beforeEach(() => { vi.stubEnv('VITE_API_BASE_URL', '') })
  afterEach(() => { vi.unstubAllEnvs() })

  it('apiUrl returns the path unchanged (relative)', async () => {
    const { apiUrl, API_BASE } = await loadConfig()
    expect(API_BASE).toBe('')
    expect(apiUrl('/api/orders')).toBe('/api/orders')
    expect(apiUrl('api/orders')).toBe('/api/orders')
  })

  it('wsUrl derives ws(s) from the page origin', async () => {
    const { wsUrl } = await loadConfig()
    // Derived from the jsdom page origin (host includes whatever port jsdom uses).
    expect(wsUrl('/ws')).toBe(`ws://${window.location.host}/ws`)
  })
})

describe('config — native mode (VITE_API_BASE_URL set)', () => {
  beforeEach(() => { vi.stubEnv('VITE_API_BASE_URL', 'https://app.example.com/') })
  afterEach(() => { vi.unstubAllEnvs() })

  it('normalizes trailing slash and prepends the backend origin', async () => {
    const { apiUrl, API_BASE } = await loadConfig()
    expect(API_BASE).toBe('https://app.example.com')
    expect(apiUrl('/api/orders')).toBe('https://app.example.com/api/orders')
  })

  it('wsUrl converts the http(s) base to ws(s)', async () => {
    const { wsUrl } = await loadConfig()
    expect(wsUrl('/ws')).toBe('wss://app.example.com/ws')
  })
})
