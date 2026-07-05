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
import { render, screen, renderHook, act, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { getRateLimit, apiFetch } from '../src/utils/api.js'
import { useCooldown } from '../src/hooks/useCooldown.js'
import { ToastProvider } from '../src/context/ToastContext.jsx'
import Integrations from '../src/pages/Integrations.jsx'
import NotionIntegration from '../src/pages/NotionIntegration.jsx'

// Keep getRateLimit + useCooldown real so the cooldown path is exercised
// end-to-end; only apiFetch is faked so we can inject a 429 from the backend.
vi.mock('../src/utils/api.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, apiFetch: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.mocked(apiFetch).mockReset()
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

// ── Real component coverage ──────────────────────────────────────────────────
//
// The harness above mirrors the button wiring; these tests render the ACTUAL
// Integrations / Notion pages with apiFetch mocked to return a 429. If someone
// refactors the real buttons (drops `disabled={cooldown.cooling}`, removes the
// `getRateLimit` call, or reverts to a generic error), the harness tests would
// still pass — but these will fail, because they assert against the shipped UI.

// Response stand-in for the mocked apiFetch. Provides .ok/.status/.json() for
// the components and .clone().json()/.headers.get() for the real getRateLimit.
function apiRes({ status = 200, body = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone: () => ({ json: async () => body }),
    headers: { get: () => null },
  }
}

const rateLimited = () =>
  apiRes({ status: 429, body: { error: 'Too many requests', retry_after_seconds: 30 } })

function renderPage(ui) {
  return render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>
  )
}

describe('real Integrations page buttons enter the cooldown state on 429', () => {
  // Routes apiFetch by method+url. `on429` maps `${METHOD} ${url}` to a 429; all
  // other calls resolve to benign defaults so the page mounts fully connected.
  function mockIntegrationsApi(on429 = {}) {
    vi.mocked(apiFetch).mockImplementation((url, opts = {}) => {
      const method = (opts.method || 'GET').toUpperCase()
      const key = `${method} ${url}`
      if (on429[key]) return Promise.resolve(rateLimited())
      if (url === '/api/integrations' && method === 'GET') {
        return Promise.resolve(apiRes({
          body: {
            github: { configured: true, synced_repos: 0, env_present: true, masked: 'ghp_…' },
            notion: { configured: true, env_present: true, masked: 'sec_…' },
            openai: { configured: true, env_present: true, masked: 'sk-…' },
          },
        }))
      }
      return Promise.resolve(apiRes({ body: {} }))
    })
  }

  it('GitHub "Sync repos" button shows "Wait Ns" and disables on 429', async () => {
    mockIntegrationsApi({ 'POST /api/integrations/github/sync': true })
    renderPage(<Integrations />)

    const btn = await screen.findByRole('button', { name: /Sync repos/i })
    expect(btn.disabled).toBe(false)

    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => expect(btn.textContent).toContain('Wait 30s'))
    expect(btn.disabled).toBe(true)
    // Friendly cooldown toast, not a generic failure.
    expect(screen.getByText(/wait 30s before syncing again/i)).toBeTruthy()
  })

  it('OpenAI "Generate" summary button shows "Wait Ns" and disables on 429', async () => {
    mockIntegrationsApi({ 'POST /api/integrations/openai/summary': true })
    renderPage(<Integrations />)

    const btn = await screen.findByRole('button', { name: /Generate/i })
    expect(btn.disabled).toBe(false)

    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => expect(btn.textContent).toContain('Wait 30s'))
    expect(btn.disabled).toBe(true)
    // No red summary error text on a 429 — it must be treated as a cooldown.
    expect(screen.queryByText(/failed to generate summary/i)).toBeNull()
    expect(screen.getByText(/wait 30s before generating another summary/i)).toBeTruthy()
  })

  it('OpenAI "Ask" chat button shows "Wait Ns" and disables on 429', async () => {
    mockIntegrationsApi({ 'POST /api/integrations/openai/chat': true })
    renderPage(<Integrations />)

    const input = await screen.findByPlaceholderText(/daily special/i)
    fireEvent.change(input, { target: { value: 'What should we cook?' } })

    const btn = screen.getByRole('button', { name: /^Ask$/i })
    expect(btn.disabled).toBe(false)

    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => expect(btn.textContent).toContain('Wait 30s'))
    expect(btn.disabled).toBe(true)
    expect(screen.queryByText(/no reply received/i)).toBeNull()
    expect(screen.getByText(/wait 30s before asking again/i)).toBeTruthy()
  })
})

// ── Countdown ticks down and re-enables (real button, fake clock) ─────────────
//
// The tests above only prove the button REACHES "Wait 30s" and is disabled right
// after a 429. They never advance the clock, so a regression in useCooldown's
// interval or the `cooling` derivation (e.g. the interval never firing, or
// `cooling` staying true) would leave a real button stuck disabled forever and
// still pass. This test drives the real GitHub "Sync repos" button through the
// full lifecycle on a fake clock: 429 → "Wait 30s" → "Wait 29s" → back to the
// normal "Sync repos" label, enabled again.
describe('cooldown countdown ticks down and re-enables the real button', () => {
  function mockGitHubSync429() {
    vi.mocked(apiFetch).mockImplementation((url, opts = {}) => {
      const method = (opts.method || 'GET').toUpperCase()
      if (url === '/api/integrations/github/sync' && method === 'POST')
        return Promise.resolve(rateLimited())
      if (url === '/api/integrations' && method === 'GET') {
        return Promise.resolve(apiRes({
          body: {
            github: { configured: true, synced_repos: 0, env_present: true, masked: 'ghp_…' },
            notion: { configured: true, env_present: true, masked: 'sec_…' },
            openai: { configured: true, env_present: true, masked: 'sk-…' },
          },
        }))
      }
      return Promise.resolve(apiRes({ body: {} }))
    })
  }

  it('counts down "Wait 30s" → "Wait 29s" → back to enabled "Sync repos"', async () => {
    mockGitHubSync429()
    renderPage(<Integrations />)

    // Mount + initial load happen on the real clock so findByRole resolves.
    const btn = await screen.findByRole('button', { name: /Sync repos/i })
    expect(btn.disabled).toBe(false)

    // Switch to a fake clock so we can advance the cooldown deterministically.
    // The countdown interval is created on click, so faking before the click is
    // enough to control it. (afterEach restores real timers.)
    vi.useFakeTimers()

    // 429 → cooldown starts; button immediately shows the full window, disabled.
    await act(async () => { fireEvent.click(btn) })
    expect(btn.textContent).toContain('Wait 30s')
    expect(btn.disabled).toBe(true)

    // One second later the countdown must actually decrement.
    act(() => { vi.advanceTimersByTime(1000) })
    expect(btn.textContent).toContain('Wait 29s')
    expect(btn.disabled).toBe(true)

    // Partway through it keeps ticking (proves the interval keeps firing).
    act(() => { vi.advanceTimersByTime(15000) })
    expect(btn.textContent).toContain('Wait 14s')
    expect(btn.disabled).toBe(true)

    // Once the whole window elapses the button returns to its normal label and
    // becomes clickable again — users are not left locked out.
    act(() => { vi.advanceTimersByTime(14000) })
    expect(btn.textContent).toContain('Sync repos')
    expect(btn.disabled).toBe(false)
  })
})

describe('real Notion page sync buttons enter the cooldown state on 429', () => {
  function mockNotionApi() {
    vi.mocked(apiFetch).mockImplementation((url, opts = {}) => {
      const method = (opts.method || 'GET').toUpperCase()
      if (url === '/api/integrations/notion/sync' && method === 'POST')
        return Promise.resolve(rateLimited())
      if (url.endsWith('/projects')) return Promise.resolve(apiRes({ body: [] }))
      if (url.startsWith('/api/notion/tasks')) return Promise.resolve(apiRes({ body: [] }))
      if (url === '/api/notion/config')
        return Promise.resolve(apiRes({ body: { configured: true, envKeyPresent: true } }))
      return Promise.resolve(apiRes({ body: {} }))
    })
  }

  it('"Sync All" button shows "Wait Ns", disables, and shows no error on 429', async () => {
    mockNotionApi()
    renderPage(<NotionIntegration />)

    const btn = await screen.findByRole('button', { name: /Sync All/i })
    expect(btn.disabled).toBe(false)

    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => expect(btn.textContent).toContain('Wait 30s'))
    expect(btn.disabled).toBe(true)
    // The sync() error path (setSyncMsg) must NOT fire — only the cooldown toast.
    expect(screen.getByText(/wait 30s before syncing again/i)).toBeTruthy()
  })
})
