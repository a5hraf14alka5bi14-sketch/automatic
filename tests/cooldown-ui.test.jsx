// @vitest-environment jsdom
//
// Frontend coverage for the "cooldown warning" path. Task #38 wired the backend's
// 429 rate limit on costly integration actions (Notion/GitHub sync, OpenAI
// summary/chat) into the UI. These tests lock that path in place so a future
// refactor can't silently reintroduce the generic red-error behavior:
//   1. getRateLimit(res) must parse the retry window from a 429 response
//      (body `retry_after_seconds`, then `Retry-After` header, then a default).
//   2. useCooldown must expose a ticking `remaining` / `cooling` window.
//   3. The triggering button must enter the disabled "Wait Ns" state — not show
//      an error — once getRateLimit reports a cooldown.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, renderHook, act, fireEvent, cleanup } from '@testing-library/react'
import { getRateLimit } from '../src/utils/api.js'
import { useCooldown } from '../src/hooks/useCooldown.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// Minimal fetch Response stand-in that exercises the code paths getRateLimit
// actually touches: res.status, res.clone().json(), res.headers.get('Retry-After').
function mockRes({ status = 429, body, header = null } = {}) {
  return {
    status,
    clone() {
      return {
        json: async () => {
          if (body === undefined) throw new Error('no json body')
          return body
        },
      }
    },
    headers: { get: (name) => (name === 'Retry-After' ? header : null) },
  }
}

describe('getRateLimit parses the retry window', () => {
  it('returns null for non-429 responses', async () => {
    expect(await getRateLimit(mockRes({ status: 200, body: {} }))).toBeNull()
    expect(await getRateLimit(null)).toBeNull()
  })

  it('reads retry_after_seconds from the 429 JSON body', async () => {
    const secs = await getRateLimit(mockRes({ body: { retry_after_seconds: 30 } }))
    expect(secs).toBe(30)
  })

  it('rounds a fractional retry window up to whole seconds', async () => {
    const secs = await getRateLimit(mockRes({ body: { retry_after_seconds: 12.2 } }))
    expect(secs).toBe(13)
  })

  it('falls back to the Retry-After header when the body has no number', async () => {
    const secs = await getRateLimit(mockRes({ body: {}, header: '45' }))
    expect(secs).toBe(45)
  })

  it('defaults to 60s when neither body nor header give a usable value', async () => {
    const secs = await getRateLimit(mockRes({ body: undefined, header: null }))
    expect(secs).toBe(60)
  })
})

describe('useCooldown drives a ticking countdown', () => {
  it('starts cooling and ticks down to zero', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useCooldown())

    expect(result.current.cooling).toBe(false)
    expect(result.current.remaining).toBe(0)

    act(() => result.current.start(3))
    expect(result.current.cooling).toBe(true)
    expect(result.current.remaining).toBe(3)

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.remaining).toBe(2)

    act(() => vi.advanceTimersByTime(2000))
    expect(result.current.remaining).toBe(0)
    expect(result.current.cooling).toBe(false)
  })
})

// Mirrors the exact button wiring used on the Integrations page (GitHub sync,
// Notion sync, OpenAI summary/chat): on a 429 it starts the cooldown and returns
// early instead of surfacing an error. Uses the REAL getRateLimit + useCooldown,
// so the disabled "Wait Ns" state is asserted against the real code paths.
function SyncButton({ response }) {
  const cooldown = useCooldown()
  const [error, setError] = useState('')
  const onClick = async () => {
    setError('')
    const secs = await getRateLimit(response)
    if (secs) {
      cooldown.start(secs)
      return
    }
    setError('Sync failed')
  }
  return (
    <div>
      <button onClick={onClick} disabled={cooldown.cooling}>
        {cooldown.cooling ? `Wait ${cooldown.remaining}s` : 'Sync repos'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

describe('the triggering button enters the disabled "Wait Ns" state on 429', () => {
  it('shows "Wait Ns", disables the button, and shows no error', async () => {
    render(<SyncButton response={mockRes({ body: { retry_after_seconds: 30 } })} />)

    const btn = screen.getByRole('button')
    expect(btn.textContent).toContain('Sync repos')
    expect(btn.disabled).toBe(false)

    await act(async () => {
      fireEvent.click(btn)
    })

    expect(btn.textContent).toContain('Wait 30s')
    expect(btn.disabled).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a normal error (not a cooldown) when the response is not a 429', async () => {
    render(<SyncButton response={mockRes({ status: 500, body: {} })} />)

    const btn = screen.getByRole('button')
    await act(async () => {
      fireEvent.click(btn)
    })

    expect(screen.getByRole('alert').textContent).toContain('Sync failed')
    expect(btn.textContent).toContain('Sync repos')
    expect(btn.disabled).toBe(false)
  })
})
