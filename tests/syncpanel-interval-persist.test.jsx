// @vitest-environment jsdom
//
// Regression coverage for the auto-sync interval dropdown surviving a reload.
// SyncPanel's `autoSync` prop arrives asynchronously — it is `null` on the first
// render and only fills in once the persisted setting loads. The dropdown's local
// state was originally seeded ONCE from that initial (null) prop, so it defaulted
// to 15 min and never picked up the saved value, making the user's choice appear
// to reset on every reload. A `useEffect` now re-syncs the dropdown from the
// persisted value once it arrives. These tests lock that behavior in place:
//   1. Mounting with `autoSync = null` shows the default (15), then re-rendering
//      with the loaded value updates the dropdown to the saved interval (30).
//   2. `interval_minutes` (saved setting) is preferred over `interval_min` (live
//      engine) when both are present.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react'
import { ToastProvider } from '../src/context/ToastContext.jsx'
import { apiFetch } from '../src/utils/api.js'
import SyncPanel from '../src/components/notion/SyncPanel.jsx'

// Only apiFetch is faked so we can assert exactly what SyncPanel PUTs to the
// backend (and inject a failure) without a real network call.
vi.mock('../src/utils/api.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, apiFetch: vi.fn() }
})

// Minimal fetch Response stand-in: SyncPanel reads res.ok then res.json().
function okRes(body = {}) {
  return { ok: true, json: async () => body }
}

afterEach(() => {
  cleanup()
  vi.mocked(apiFetch).mockReset()
})

function renderPanel(props) {
  return render(
    <ToastProvider>
      <SyncPanel onSyncNow={() => {}} onAutoSyncChange={() => {}} {...props} />
    </ToastProvider>
  )
}

// The one <select> on the panel is the interval dropdown.
function intervalSelect(container) {
  return container.querySelector('select')
}

describe('SyncPanel auto-sync interval survives an async reload', () => {
  it('defaults to 15 while autoSync is null, then shows the saved 30 once it loads', () => {
    const { container, rerender } = renderPanel({ autoSync: null })

    // Before the persisted setting arrives, the dropdown shows the default.
    expect(intervalSelect(container).value).toBe('15')

    // Once autoSync loads with the saved 30-minute interval, the dropdown must
    // reflect it — not stay stuck on the initial default.
    rerender(
      <ToastProvider>
        <SyncPanel
          onSyncNow={() => {}}
          onAutoSyncChange={() => {}}
          autoSync={{ interval_minutes: 30, running: true, interval_min: 30 }}
        />
      </ToastProvider>
    )

    expect(intervalSelect(container).value).toBe('30')
  })

  it('prefers interval_minutes (saved setting) over interval_min (live engine)', () => {
    const { container, rerender } = renderPanel({ autoSync: null })

    rerender(
      <ToastProvider>
        <SyncPanel
          onSyncNow={() => {}}
          onAutoSyncChange={() => {}}
          autoSync={{ interval_minutes: 60, running: true, interval_min: 5 }}
        />
      </ToastProvider>
    )

    expect(intervalSelect(container).value).toBe('60')
  })
})

describe('SyncPanel auto-sync interval reaches the backend', () => {
  it('PUTs { enabled: true, interval_minutes: 30 } when running and the dropdown changes', async () => {
    vi.mocked(apiFetch).mockResolvedValue(okRes({ running: true, interval_min: 30, interval_minutes: 30 }))
    const onAutoSyncChange = vi.fn()
    const { container } = render(
      <ToastProvider>
        <SyncPanel
          onSyncNow={() => {}}
          onAutoSyncChange={onAutoSyncChange}
          autoSync={{ running: true, interval_minutes: 15, interval_min: 15 }}
        />
      </ToastProvider>
    )

    fireEvent.change(intervalSelect(container), { target: { value: '30' } })

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    const [url, opts] = vi.mocked(apiFetch).mock.calls[0]
    expect(url).toMatch(/\/notion\/auto-sync$/)
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ enabled: true, interval_minutes: 30 })
    await waitFor(() => expect(onAutoSyncChange).toHaveBeenCalled())
  })

  it('reverts the dropdown and shows an error toast when the backend rejects the change', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: false, json: async () => ({}) })
    const { container } = render(
      <ToastProvider>
        <SyncPanel
          onSyncNow={() => {}}
          onAutoSyncChange={() => {}}
          autoSync={{ running: true, interval_minutes: 15, interval_min: 15 }}
        />
      </ToastProvider>
    )

    fireEvent.change(intervalSelect(container), { target: { value: '30' } })

    // The failed PUT must roll the dropdown back to its previous value...
    await waitFor(() => expect(intervalSelect(container).value).toBe('15'))
    // ...and surface an error toast rather than silently dropping the change.
    await waitFor(() => expect(screen.getByText(/couldn.t update the auto-sync interval/i)).toBeTruthy())
  })

  it('does NOT call the backend when auto-sync is not running', async () => {
    const { container } = render(
      <ToastProvider>
        <SyncPanel
          onSyncNow={() => {}}
          onAutoSyncChange={() => {}}
          autoSync={{ running: false, interval_minutes: 15, interval_min: 15 }}
        />
      </ToastProvider>
    )

    fireEvent.change(intervalSelect(container), { target: { value: '30' } })

    // The interval is persisted later (on enable), so no PUT should fire now —
    // but the dropdown must still reflect the user's local selection.
    expect(apiFetch).not.toHaveBeenCalled()
    expect(intervalSelect(container).value).toBe('30')
  })
})
