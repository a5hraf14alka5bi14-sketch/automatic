// @vitest-environment jsdom
//
// Kitchen Display System — critical status-transition flows:
//   1. Pending orders render in the "New Orders" column
//   2. Clicking "Start Preparing" calls PATCH /api/orders/:id/status {status:'preparing'}
//   3. Preparing orders show "Mark Ready" button
//   4. Clicking an item done checkbox calls PATCH /api/orders/:id/items/:itemId/done
//   5. Empty columns show the "Empty" placeholder
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { apiFetch } from '../src/utils/api.js'
import { ToastProvider } from '../src/context/ToastContext.jsx'
import Kitchen from '../src/pages/Kitchen.jsx'

vi.mock('../src/utils/api.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, apiFetch: vi.fn() }
})

class MockWebSocket {
  constructor() {}
  addEventListener() {}
  removeEventListener() {}
  close() {}
  send() {}
}

afterEach(() => {
  cleanup()
  vi.mocked(apiFetch).mockReset()
  localStorage.clear()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket)
  localStorage.setItem('auth_user', JSON.stringify({ id: 1, name: 'Chef', role: 'kitchen', token: 'tok' }))
})

function jsonRes(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    clone: () => ({ json: async () => body }),
  }
}

function makeOrder(id, status, items = []) {
  return {
    id,
    status,
    type: 'dine-in',
    table_number: 3,
    rush: false,
    created_at: new Date().toISOString(),
    items,
  }
}

function mockKitchenApi(orders, patchResponse = null) {
  vi.mocked(apiFetch).mockImplementation((url, opts) => {
    if (url.includes('/api/orders/stations')) return Promise.resolve(jsonRes(['kitchen', 'bar']))
    if (url.includes('/api/orders') && opts?.method === 'PATCH' && url.includes('/status')) {
      const body = JSON.parse(opts.body)
      return Promise.resolve(jsonRes({ ...patchResponse, status: body.status }))
    }
    if (url.includes('/api/orders') && opts?.method === 'PATCH' && url.includes('/done')) {
      return Promise.resolve(jsonRes({ ok: true }))
    }
    if (url.includes('/api/orders') && opts?.method === 'PATCH' && url.includes('/rush')) {
      return Promise.resolve(jsonRes({ ok: true }))
    }
    if (url.includes('/api/orders')) return Promise.resolve(jsonRes(orders))
    return Promise.resolve(jsonRes({}))
  })
}

function renderKitchen() {
  return render(
    <ToastProvider>
      <Kitchen />
    </ToastProvider>
  )
}

describe('Kitchen — column rendering', () => {
  it('renders column headers: New Orders, Preparing, Ready to Serve', async () => {
    mockKitchenApi([])
    renderKitchen()
    await waitFor(() => {
      expect(screen.getByText('New Orders')).toBeTruthy()
      expect(screen.getByText('Preparing')).toBeTruthy()
      expect(screen.getByText('Ready to Serve')).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('shows Empty placeholder when no orders in a column', async () => {
    mockKitchenApi([])
    renderKitchen()
    await waitFor(() => {
      const empties = screen.getAllByText('Empty')
      expect(empties.length).toBeGreaterThanOrEqual(3)
    }, { timeout: 3000 })
  })

  it('renders a pending order in the New Orders column', async () => {
    mockKitchenApi([makeOrder(10, 'pending', [])])
    renderKitchen()
    // KitchenCard shows #{id} not "Order #N"
    await waitFor(() => expect(screen.getByText('#10')).toBeTruthy(), { timeout: 3000 })
    expect(screen.getByText('▶ Start Preparing')).toBeTruthy()
  })

  it('renders a preparing order with Mark Ready button', async () => {
    mockKitchenApi([makeOrder(11, 'preparing', [])])
    renderKitchen()
    await waitFor(() => expect(screen.getByText('✓ Mark Ready')).toBeTruthy(), { timeout: 3000 })
  })
})

describe('Kitchen — status transitions', () => {
  it('calls PATCH /api/orders/:id/status {status:preparing} on Start Preparing click', async () => {
    const patches = []
    vi.mocked(apiFetch).mockImplementation((url, opts) => {
      if (url.includes('/api/orders/stations')) return Promise.resolve(jsonRes(['kitchen']))
      if (opts?.method === 'PATCH' && url.includes('/status')) {
        patches.push({ url, body: JSON.parse(opts.body) })
        return Promise.resolve(jsonRes({ ok: true }))
      }
      if (url.includes('/api/orders')) return Promise.resolve(jsonRes([makeOrder(10, 'pending')]))
      return Promise.resolve(jsonRes({}))
    })

    renderKitchen()
    await waitFor(() => screen.getByText('▶ Start Preparing'), { timeout: 3000 })

    await act(async () => {
      fireEvent.click(screen.getByText('▶ Start Preparing'))
    })

    await waitFor(() => expect(patches.length).toBe(1), { timeout: 2000 })
    expect(patches[0].url).toContain('/api/orders/10/status')
    expect(patches[0].body.status).toBe('preparing')
  })

  it('calls PATCH /api/orders/:id/status {status:ready} on Mark Ready click', async () => {
    const patches = []
    vi.mocked(apiFetch).mockImplementation((url, opts) => {
      if (url.includes('/api/orders/stations')) return Promise.resolve(jsonRes(['kitchen']))
      if (opts?.method === 'PATCH' && url.includes('/status')) {
        patches.push({ url, body: JSON.parse(opts.body) })
        return Promise.resolve(jsonRes({ ok: true }))
      }
      if (url.includes('/api/orders')) return Promise.resolve(jsonRes([makeOrder(11, 'preparing')]))
      return Promise.resolve(jsonRes({}))
    })

    renderKitchen()
    await waitFor(() => screen.getByText('✓ Mark Ready'), { timeout: 3000 })

    await act(async () => {
      fireEvent.click(screen.getByText('✓ Mark Ready'))
    })

    await waitFor(() => expect(patches.length).toBe(1), { timeout: 2000 })
    expect(patches[0].url).toContain('/api/orders/11/status')
    expect(patches[0].body.status).toBe('ready')
  })
})

describe('Kitchen — item done toggle', () => {
  it('calls PATCH /api/orders/:id/items/:itemId/done on checkbox click', async () => {
    const donePatches = []
    const orderWithItem = makeOrder(20, 'pending', [
      { id: 5, name: 'Falafel', name_ar: 'فلافل', qty: 1, done: false }
    ])

    vi.mocked(apiFetch).mockImplementation((url, opts) => {
      if (url.includes('/api/orders/stations')) return Promise.resolve(jsonRes(['kitchen']))
      if (opts?.method === 'PATCH' && url.includes('/done')) {
        donePatches.push({ url, body: JSON.parse(opts.body) })
        return Promise.resolve(jsonRes({ ok: true }))
      }
      if (url.includes('/api/orders')) return Promise.resolve(jsonRes([orderWithItem]))
      return Promise.resolve(jsonRes({}))
    })

    renderKitchen()
    await waitFor(() => screen.getByText('Falafel'), { timeout: 3000 })

    await act(async () => {
      // The done checkbox is a small button (w-4 h-4 rounded border-2) adjacent to the item name span
      const falafelSpan = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Falafel')
      const itemRow = falafelSpan?.closest('.flex.items-start')
      const checkbox = itemRow?.querySelector('button') || document.querySelector('button.w-4')
      fireEvent.click(checkbox)
    })

    await waitFor(() => expect(donePatches.length).toBe(1), { timeout: 2000 })
    expect(donePatches[0].url).toContain('/api/orders/20/items/5/done')
    expect(donePatches[0].body.done).toBe(true)
  })
})

describe('Kitchen — rush toggle', () => {
  it('calls PATCH /api/orders/:id/rush on rush button click', async () => {
    const rushPatches = []
    vi.mocked(apiFetch).mockImplementation((url, opts) => {
      if (url.includes('/api/orders/stations')) return Promise.resolve(jsonRes(['kitchen']))
      if (opts?.method === 'PATCH' && url.includes('/rush')) {
        rushPatches.push({ url, body: JSON.parse(opts.body) })
        return Promise.resolve(jsonRes({ ok: true }))
      }
      if (url.includes('/api/orders')) return Promise.resolve(jsonRes([makeOrder(30, 'pending')]))
      return Promise.resolve(jsonRes({}))
    })

    renderKitchen()
    await waitFor(() => screen.getByText('▶ Start Preparing'), { timeout: 3000 })

    // Rush button title is "Mark as rush" when not in rush state
    const rushBtn = document.querySelector('button[title="Mark as rush"]')
      || document.querySelector('button[title*="rush"]')
    expect(rushBtn).toBeTruthy()

    await act(async () => { fireEvent.click(rushBtn) })

    await waitFor(() => expect(rushPatches.length).toBe(1), { timeout: 2000 })
    expect(rushPatches[0].url).toContain('/api/orders/30/rush')
  })
})
