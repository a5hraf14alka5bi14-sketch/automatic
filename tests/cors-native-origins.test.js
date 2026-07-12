// Production CORS origin policy for native shells (Capacitor/Electron).
import { describe, it, expect } from 'vitest'
import { isAllowedOrigin, parseExtraOrigins, NATIVE_ORIGINS } from '../server/lib/cors-origins.js'

describe('native shell CORS origins', () => {
  it('always allows the fixed Capacitor and Electron shell origins', () => {
    for (const origin of ['https://localhost', 'capacitor://localhost', 'http://localhost', 'app://bundle']) {
      expect(isAllowedOrigin(origin)).toBe(true)
    }
  })

  it('the fixed list matches the exported NATIVE_ORIGINS set', () => {
    for (const origin of NATIVE_ORIGINS) expect(isAllowedOrigin(origin)).toBe(true)
  })

  it('rejects arbitrary web origins by default', () => {
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false)
    expect(isAllowedOrigin('https://localhost.evil.com')).toBe(false)
    expect(isAllowedOrigin('http://localhost:3000')).toBe(false)
  })

  it('rejects missing/empty origin (same-origin requests never send one)', () => {
    expect(isAllowedOrigin(undefined)).toBe(false)
    expect(isAllowedOrigin('')).toBe(false)
    expect(isAllowedOrigin(null)).toBe(false)
  })

  it('allows extra origins from ALLOWED_ORIGIN (comma-separated, trimmed)', () => {
    const extra = parseExtraOrigins(' https://a.example.com, https://b.example.com ,')
    expect(isAllowedOrigin('https://a.example.com', extra)).toBe(true)
    expect(isAllowedOrigin('https://b.example.com', extra)).toBe(true)
    expect(isAllowedOrigin('https://c.example.com', extra)).toBe(false)
    // Native origins still allowed alongside extras.
    expect(isAllowedOrigin('app://bundle', extra)).toBe(true)
  })

  it('parseExtraOrigins handles unset/empty env values', () => {
    expect(parseExtraOrigins(undefined).size).toBe(0)
    expect(parseExtraOrigins('').size).toBe(0)
  })
})
