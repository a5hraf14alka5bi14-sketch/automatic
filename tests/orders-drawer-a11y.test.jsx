// @vitest-environment jsdom
//
// Accessibility coverage for the Orders detail drawer (OrderDetailDrawer in
// src/pages/Orders.jsx). The drawer opens as an overlay and must behave like a
// proper modal dialog for keyboard and screen-reader users:
//   • role="dialog" + aria-modal, accessibly named after "Order #N"
//   • Escape closes it
//   • focus moves into the drawer on open and returns to the trigger on close
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { apiFetch } from '../src/utils/api.js'
import { ToastProvider } from '../src/context/ToastContext.jsx'
import { SettingsProvider } from '../src/context/SettingsContext.jsx'
import Orders from '../src/pages/Orders.jsx'

vi.mock('../src/utils/api.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, apiFetch: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.mocked(apiFetch).mockReset()
  localStorage.clear()
})

function order(id, extra = {}) {
  return {
    id,
    status: 'pending',
    type: 'dine-in',
    total: '10.000',
    items_count: 1,
    items: [],
    created_at: '2026-07-06T10:00:00.000Z',
    ...extra,
  }
}

function listRes(rows) {
  return {
    ok: true,
    status: 200,
    headers: { get: (h) => (h === 'X-Total-Count' ? String(rows.length) : null) },
    json: async () => rows,
    clone: () => ({ json: async () => rows }),
  }
}

function jsonRes(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    clone: () => ({ json: async () => body }),
  }
}

function mockOrdersApi(rows) {
  vi.mocked(apiFetch).mockImplementation((url) => {
    if (url.startsWith('/api/settings')) {
      return Promise.resolve(jsonRes({ currency_symbol: 'OMR', tax_rate: '11', tables_count: '10' }))
    }
    if (url.startsWith('/api/inventory/low-stock')) return Promise.resolve(jsonRes([]))
    if (url.startsWith('/api/orders/counts')) return Promise.resolve(jsonRes({}))
    if (url.startsWith('/api/orders')) return Promise.resolve(listRes(rows))
    return Promise.resolve(jsonRes({}))
  })
}

function renderOrders() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <Orders />
      </ToastProvider>
    </SettingsProvider>
  )
}

// Open the drawer by clicking the order card in the list (the card is the
// clickable element containing the "Order #N" span).
async function openDrawer(id) {
  await waitFor(() => expect(screen.getByText(new RegExp(`^Order #${id}$`))).toBeTruthy(), { timeout: 2000 })
  const trigger = screen.getByText(new RegExp(`^Order #${id}$`)).closest('[class]')
  fireEvent.click(trigger)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeTruthy(), { timeout: 2000 })
  return trigger
}

describe('Orders drawer: dialog semantics', () => {
  it('exposes role="dialog", aria-modal, and an accessible name tied to Order #N', async () => {
    mockOrdersApi([order(7)])
    renderOrders()
    await openDrawer(7)

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')

    // Accessible name is wired via aria-labelledby → the "Order #7" heading.
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const label = document.getElementById(labelledBy)
    expect(label).toBeTruthy()
    expect(label.textContent).toBe('Order #7')
    // And the heading itself is a real heading element inside the dialog.
    expect(label.tagName).toBe('H2')
    expect(dialog.contains(label)).toBe(true)
  })

  it('moves focus into the drawer on open', async () => {
    mockOrdersApi([order(7)])
    renderOrders()
    await openDrawer(7)

    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    // Specifically the close button, so Enter/Space immediately dismisses.
    expect(document.activeElement.getAttribute('aria-label')).toMatch(/close order #7/i)
  })
})

describe('Orders drawer: Escape closes it', () => {
  it('closes on Escape and does not reopen', async () => {
    mockOrdersApi([order(7)])
    renderOrders()
    await openDrawer(7)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // A second Escape with no dialog open must be a no-op (listener removed).
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Orders drawer: focus restore on close', () => {
  it('returns focus to the previously focused element after closing', async () => {
    mockOrdersApi([order(7)])
    renderOrders()

    // Focus a stable element before opening — the Refresh button acts as the
    // "trigger" whose focus must be restored.
    await waitFor(() => expect(screen.getByRole('button', { name: /Refresh/i })).toBeTruthy(), { timeout: 2000 })
    const refreshBtn = screen.getByRole('button', { name: /Refresh/i })
    refreshBtn.focus()
    expect(document.activeElement).toBe(refreshBtn)

    await openDrawer(7)
    // Focus moved into the dialog…
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true))

    // …and returns to the trigger after Escape closes it.
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(refreshBtn))
  })
})
