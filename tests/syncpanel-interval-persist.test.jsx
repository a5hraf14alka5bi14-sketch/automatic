// @vitest-environment jsdom
//
// Regression coverage for the auto-sync interval control surviving a reload.
// SyncPanel's `autoSync` prop arrives asynchronously — it is `null` on the first
// render and only fills in once the persisted setting loads. The control's local
// state was originally seeded ONCE from that initial (null) prop, so it defaulted
// to 15 min and never picked up the saved value, making the user's choice appear
// to reset on every reload. A `useEffect` now re-syncs the control from the
// persisted value once it arrives.
//
// The control is now a free numeric input (any minutes, clamped 5–1440 server
// side) with preset "quick pick" buttons. These tests lock in:
//   1. Async reload: null → default 60, then loaded value shows.
//   2. `interval_minutes` (saved) preferred over `interval_min` (live engine).
//   3. Custom values reach the backend (via typing + commit, and preset clicks).
//   4. Failure reverts the value and toasts.
//   5. No PUT when not running, but local value still reflects the choice.
//   6. Frequent-interval warning.
//   7. Server clamp reflection snaps the input back.
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

// The interval control is now a numeric input labelled for accessibility.
function intervalInput(container) {
  return container.querySelector('input[type="number"]')
}

// Type a custom value and commit it (blur mirrors the Enter-key path too).
function typeInterval(container, value) {
  const input = intervalInput(container)
  fireEvent.change(input, { target: { value: String(value) } })
  fireEvent.blur(input)
}

describe('SyncPanel auto-sync interval survives an async reload', () => {
  it('defaults to 60 while autoSync is null, then shows the saved 30 once it loads', () => {
    const { container, rerender } = renderPanel({ autoSync: null })

    // Before the persisted setting arrives, the input shows the default.
    expect(intervalInput(container).value).toBe('60')

    // Once autoSync loads with the saved 30-minute interval, the input must
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

    expect(intervalInput(container).value).toBe('30')
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

    expect(intervalInput(container).value).toBe('60')
  })
})

describe('SyncPanel auto-sync interval reaches the backend', () => {
  it('PUTs a custom typed value (e.g. 45 min) when running', async () => {
    vi.mocked(apiFetch).mockResolvedValue(okRes({ running: true, interval_min: 45, interval_minutes: 45 }))
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

    // A free-text value that is NOT one of the old fixed presets.
    typeInterval(container, 45)

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    const [url, opts] = vi.mocked(apiFetch).mock.calls[0]
    expect(url).toMatch(/\/notion\/auto-sync$/)
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ enabled: true, interval_minutes: 45 })
    await waitFor(() => expect(onAutoSyncChange).toHaveBeenCalled())
  })

  it('PUTs the preset value when a quick-pick button is clicked', async () => {
    vi.mocked(apiFetch).mockResolvedValue(okRes({ running: true, interval_min: 30, interval_minutes: 30 }))
    const { container } = render(
      <ToastProvider>
        <SyncPanel
          onSyncNow={() => {}}
          onAutoSyncChange={() => {}}
          autoSync={{ running: true, interval_minutes: 15, interval_min: 15 }}
        />
      </ToastProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '30m' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    const [, opts] = vi.mocked(apiFetch).mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ enabled: true, interval_minutes: 30 })
    expect(intervalInput(container).value).toBe('30')
  })

  it('reverts the value and shows an error toast when the backend rejects the change', async () => {
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

    typeInterval(container, 45)

    // The failed PUT must roll the input back to its previous value...
    await waitFor(() => expect(intervalInput(container).value).toBe('15'))
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

    typeInterval(container, 45)

    // The interval is persisted later (on enable), so no PUT should fire now —
    // but the input must still reflect the user's local selection.
    expect(apiFetch).not.toHaveBeenCalled()
    expect(intervalInput(container).value).toBe('45')
  })

  it('reverts an empty / invalid entry back to the last committed value', () => {
    const { container } = renderPanel({
      autoSync: { running: false, interval_minutes: 60, interval_min: 60 }
    })

    // Clearing the field then committing must not leave it blank.
    typeInterval(container, '')
    expect(intervalInput(container).value).toBe('60')
  })
})

describe('SyncPanel warns about aggressive intervals', () => {
  it('shows the rate-limit hint when a frequent interval (<=10 min) is selected', () => {
    const { container } = renderPanel({
      autoSync: { running: false, interval_minutes: 5, interval_min: 5 }
    })

    // A 5-minute interval is aggressive enough to risk hitting Notion limits.
    expect(intervalInput(container).value).toBe('5')
    expect(screen.getByText(/frequent syncs may hit notion rate limits/i)).toBeTruthy()
  })

  it('does not show the hint for a comfortable interval (15 min)', () => {
    renderPanel({ autoSync: { running: false, interval_minutes: 15, interval_min: 15 } })
    expect(screen.queryByText(/frequent syncs may hit notion rate limits/i)).toBeNull()
  })
})

describe('SyncPanel reflects the clamped value the server actually saved', () => {
  it('snaps the input to whatever value the server returns', async () => {
    // User types 2 min but the server clamps/returns 5 min: the input must
    // silently follow the saved value so it matches what is actually running.
    vi.mocked(apiFetch).mockResolvedValue(okRes({ running: true, interval_min: 5, interval_minutes: 5 }))
    const { container } = render(
      <ToastProvider>
        <SyncPanel
          onSyncNow={() => {}}
          onAutoSyncChange={() => {}}
          autoSync={{ running: true, interval_minutes: 15, interval_min: 15 }}
        />
      </ToastProvider>
    )

    typeInterval(container, 2)

    await waitFor(() => expect(intervalInput(container).value).toBe('5'))
  })
})
