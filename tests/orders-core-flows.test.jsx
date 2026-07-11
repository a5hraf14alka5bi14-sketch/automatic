// @vitest-environment jsdom
//
// Orders page — core interaction flows beyond the a11y suite:
//   1. Status filter tabs render with correct labels (lowercase, capitalized via CSS)
//   2. Clicking the "pending" tab triggers a re-fetch
//   3. Refresh button triggers a re-fetch of orders
//   4. Order count badge reflects the counts API
//   5. Order rows render with correct "Order #N" text
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

function order(id, status = 'pending', extra = {}) {
  return {
    id,
    status,
    type: 'dine-in',
    total: '10.000',
    items_count: 1,
    items: [],
    created_at: '2026-07-10T10:00:00.000Z',
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

function mockOrdersApi(rows, counts = {}) {
  vi.mocked(apiFetch).mockImplementation((url) => {
    if (url.startsWith('/api/settings')) return Promise.resolve(jsonRes({ currency_symbol: 'OMR', tax_rate: '11', tables_count: '10' }))
    if (url.startsWith('/api/inventory/low-stock')) return Promise.resolve(jsonRes([]))
    if (url.startsWith('/api/orders/counts')) return Promise.resolve(jsonRes(counts))
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

// Find a status tab button by its exact text value (tabs render lowercase via CSS capitalize)
function findStatusTab(value) {
  return [...document.querySelectorAll('button')].find(b => b.textContent.trim() === value)
}

describe('Orders — status filter tabs', () => {
  it('renders status tab buttons: all, pending, completed', async () => {
    mockOrdersApi([order(1)])
    renderOrders()
    await waitFor(() => {
      expect(findStatusTab('all')).toBeTruthy()
      expect(findStatusTab('pending')).toBeTruthy()
      expect(findStatusTab('completed')).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('renders all six status tabs', async () => {
    mockOrdersApi([])
    renderOrders()
    await waitFor(() => {
      for (const s of ['all', 'pending', 'preparing', 'ready', 'completed', 'cancelled']) {
        expect(findStatusTab(s), `tab "${s}" not found`).toBeTruthy()
      }
    }, { timeout: 3000 })
  })

  it('highlights the selected tab as orange', async () => {
    mockOrdersApi([order(1)])
    renderOrders()
    await waitFor(() => findStatusTab('all'), { timeout: 3000 })

    const allTab = findStatusTab('all')
    expect(allTab.className).toContain('bg-orange-500')

    fireEvent.click(findStatusTab('pending'))
    await waitFor(() => {
      expect(findStatusTab('pending').className).toContain('bg-orange-500')
      expect(findStatusTab('all').className).not.toContain('bg-orange-500')
    }, { timeout: 2000 })
  })

  it('refetches orders when a status tab is clicked', async () => {
    const fetchedUrls = []
    vi.mocked(apiFetch).mockImplementation((url) => {
      fetchedUrls.push(url)
      if (url.startsWith('/api/settings')) return Promise.resolve(jsonRes({ currency_symbol: 'OMR', tax_rate: '11', tables_count: '10' }))
      if (url.startsWith('/api/inventory/low-stock')) return Promise.resolve(jsonRes([]))
      if (url.startsWith('/api/orders/counts')) return Promise.resolve(jsonRes({}))
      if (url.startsWith('/api/orders')) return Promise.resolve(listRes([]))
      return Promise.resolve(jsonRes({}))
    })

    renderOrders()
    await waitFor(() => findStatusTab('pending'), { timeout: 3000 })
    const before = fetchedUrls.filter(u => u.startsWith('/api/orders') && !u.includes('counts')).length

    fireEvent.click(findStatusTab('pending'))

    await waitFor(() => {
      const after = fetchedUrls.filter(u => u.startsWith('/api/orders') && !u.includes('counts')).length
      expect(after).toBeGreaterThan(before)
    }, { timeout: 2000 })
  })
})

describe('Orders — Refresh button', () => {
  it('Refresh button has aria-label="Refresh" and is present', async () => {
    mockOrdersApi([])
    renderOrders()
    await waitFor(() => {
      const btn = screen.queryByRole('button', { name: /Refresh/i })
      expect(btn).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('Refresh button triggers a re-fetch of orders', async () => {
    const fetchCount = { orders: 0 }
    vi.mocked(apiFetch).mockImplementation((url) => {
      if (url.startsWith('/api/settings')) return Promise.resolve(jsonRes({ currency_symbol: 'OMR', tax_rate: '11', tables_count: '10' }))
      if (url.startsWith('/api/inventory/low-stock')) return Promise.resolve(jsonRes([]))
      if (url.startsWith('/api/orders/counts')) return Promise.resolve(jsonRes({}))
      if (url.startsWith('/api/orders')) {
        fetchCount.orders++
        return Promise.resolve(listRes([order(1)]))
      }
      return Promise.resolve(jsonRes({}))
    })

    renderOrders()
    await waitFor(() => screen.queryByRole('button', { name: /Refresh/i }), { timeout: 3000 })
    const before = fetchCount.orders

    fireEvent.click(screen.queryByRole('button', { name: /Refresh/i }))

    await waitFor(() => expect(fetchCount.orders).toBeGreaterThan(before), { timeout: 2000 })
  })
})

describe('Orders — list rendering', () => {
  it('renders order rows with Order # text', async () => {
    mockOrdersApi([order(99), order(100)])
    renderOrders()
    await waitFor(() => {
      expect(screen.queryByText(/Order #99/)).toBeTruthy()
      expect(screen.queryByText(/Order #100/)).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('shows empty state when no orders returned', async () => {
    mockOrdersApi([])
    renderOrders()
    await waitFor(() => {
      expect(screen.queryByText(/Order #/)).toBeNull()
    }, { timeout: 3000 })
  })

  it('order count badge shows count from counts API', async () => {
    mockOrdersApi([order(1), order(2)], { pending: 5, completed: 12 })
    renderOrders()
    await waitFor(() => {
      const body = document.body.textContent
      expect(body).toContain('5')
    }, { timeout: 3000 })
  })
})
