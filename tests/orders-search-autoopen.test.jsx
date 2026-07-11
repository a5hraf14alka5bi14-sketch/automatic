// @vitest-environment jsdom
//
// Regression coverage for the Orders "jump-to-order" auto-open behavior
// (autoOpenedSearchRef + the [orders, search, loading] effect in
// src/pages/Orders.jsx). Searching an order number auto-opens its detail
// drawer, but ONLY when the intent is unambiguous. These tests lock that in
// place so a future refactor can't accidentally:
//   • auto-open the wrong order,
//   • auto-open on a partial / multi-result search,
//   • auto-open when a numeric search matches a table/customer number that
//     coincides with a *different* order's id,
//   • auto-open for a non-numeric (table/customer name) search, or
//   • surprise-reopen after the user closes the drawer or after a live refresh.
//
// The drawer is detected via its <h2> heading ("Order #N"); the list card only
// renders "Order #N" inside a <span>, so getByRole('heading') distinguishes an
// OPEN drawer from a mere list row.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { apiFetch } from '../src/utils/api.js'
import { ToastProvider } from '../src/context/ToastContext.jsx'
import { SettingsProvider } from '../src/context/SettingsContext.jsx'
import Orders from '../src/pages/Orders.jsx'

// Keep everything real except apiFetch, which we drive so we can control
// exactly what the server "returns" for a given search term.
vi.mock('../src/utils/api.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, apiFetch: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.mocked(apiFetch).mockReset()
  localStorage.clear()
})

// A tiny order factory — only the fields the list/drawer actually read.
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

// Route apiFetch by URL. `resultsFor(searchValue)` returns the rows the server
// would return for that `search` query param; with no search we return the full
// unfiltered list. Settings / low-stock / counts calls get benign defaults so
// the page mounts fully.
function mockOrdersApi(resultsFor, fullList = []) {
  vi.mocked(apiFetch).mockImplementation((url) => {
    if (url.startsWith('/api/settings')) {
      return Promise.resolve(jsonRes({ currency_symbol: 'OMR', tax_rate: '11', tables_count: '10' }))
    }
    if (url.startsWith('/api/inventory/low-stock')) return Promise.resolve(jsonRes([]))
    if (url.startsWith('/api/orders/counts')) return Promise.resolve(jsonRes({}))
    if (url.startsWith('/api/orders')) {
      const search = new URL(url, 'http://x').searchParams.get('search')
      const rows = search ? resultsFor(search) : fullList
      return Promise.resolve(listRes(rows))
    }
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

// Type into the debounced search box (350ms debounce in the component).
function typeSearch(value) {
  const input = screen.getByPlaceholderText(/Order # · table · customer/i)
  fireEvent.change(input, { target: { value } })
}

// The drawer is open iff there's a heading "Order #<id>".
const drawerHeading = (id) => screen.queryByRole('heading', { name: new RegExp(`^Order #${id}$`) })

describe('Orders search auto-open: opens only on an exact single-id numeric match', () => {
  it('auto-opens the drawer for a pure-numeric search returning one order whose id equals the term', async () => {
    mockOrdersApi((s) => (s === '5' ? [order(5)] : []))
    renderOrders()

    typeSearch('5')

    // The drawer heading ("Order #5") only renders when the drawer is open; the
    // list card renders "Order #5" in a <span>, so a heading match proves the
    // correct order's drawer opened.
    await waitFor(() => expect(drawerHeading(5)).toBeTruthy(), { timeout: 2000 })
    expect(drawerHeading(5).tagName).toBe('H2')
    // A different order's drawer must NOT be what opened.
    expect(drawerHeading(42)).toBeNull()
  })
})

describe('Orders search auto-open: stays closed when intent is ambiguous or mismatched', () => {
  it('does NOT auto-open for a multi-result search', async () => {
    // "1" matches several orders (1, 10, 12) — a browsing search, not a jump.
    mockOrdersApi((s) => (s === '1' ? [order(1), order(10), order(12)] : []))
    renderOrders()

    typeSearch('1')

    // Wait past the debounce + fetch, then assert no drawer opened.
    await waitFor(() => expect(screen.getAllByText(/Order #1$/).length).toBeGreaterThan(0), { timeout: 2000 })
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('heading', { name: /^Order #/ })).toBeNull()
  })

  it('does NOT auto-open when the single result\'s id differs from the numeric search term', async () => {
    // Searching "3" matches order #42 by its TABLE number 3, not by id.
    mockOrdersApi((s) => (s === '3' ? [order(42, { table_number: 3 })] : []))
    renderOrders()

    typeSearch('3')

    await waitFor(() => expect(screen.getByText(/Order #42$/)).toBeTruthy(), { timeout: 2000 })
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('heading', { name: /^Order #/ })).toBeNull()
  })

  it('does NOT auto-open for a non-numeric (customer/table name) search, even with a single result', async () => {
    mockOrdersApi((s) => (s === 'john' ? [order(7, { customer_name: 'John' })] : []))
    renderOrders()

    typeSearch('john')

    await waitFor(() => expect(screen.getByText(/Order #7$/)).toBeTruthy(), { timeout: 2000 })
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('heading', { name: /^Order #/ })).toBeNull()
  })
})

describe('Orders search auto-open: never surprise-reopens', () => {
  it('does not reopen after the user closes the drawer (search unchanged + live refresh)', async () => {
    mockOrdersApi((s) => (s === '5' ? [order(5)] : []))
    renderOrders()

    typeSearch('5')
    await waitFor(() => expect(drawerHeading(5)).toBeTruthy(), { timeout: 2000 })

    // Close the drawer via its ✕ button (the search-clear ✕ comes first in the
    // DOM, so the drawer's close button is the last ✕).
    const closeButtons = screen.getAllByRole('button').filter((b) => b.textContent === '✕')
    fireEvent.click(closeButtons[closeButtons.length - 1])
    await waitFor(() => expect(drawerHeading(5)).toBeNull())

    // A live refresh (same term, same single result) must NOT reopen it —
    // autoOpenedSearchRef already remembers "5".
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))
    await new Promise((r) => setTimeout(r, 150))
    expect(drawerHeading(5)).toBeNull()
  })
})
