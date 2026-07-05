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
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ToastProvider } from '../src/context/ToastContext.jsx'
import SyncPanel from '../src/components/notion/SyncPanel.jsx'

afterEach(cleanup)

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
