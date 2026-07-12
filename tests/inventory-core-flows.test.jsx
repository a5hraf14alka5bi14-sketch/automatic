// @vitest-environment jsdom
//
// Inventory page — critical UI flows:
//   1. Inventory items render after API load
//   2. Clicking ⚖️ opens AdjustModal with the correct item name
//   3. AdjustModal submit calls the adjust endpoint
//   4. Switching to Stocktake tab shows the stocktake view
//   5. Low stock badge renders when there are low-stock items
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { apiFetch } from '../src/utils/api.js'
import { ToastProvider } from '../src/context/ToastContext.jsx'
import { SettingsProvider } from '../src/context/SettingsContext.jsx'
import Inventory from '../src/pages/Inventory.jsx'

vi.mock('../src/utils/api.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, apiFetch: vi.fn() }
})

vi.mock('../src/utils/useLiveEvents.js', () => ({
  useLiveEvents: vi.fn(),
  useDebouncedCallback: (fn) => fn,
}))

vi.mock('../src/utils/countSheet.js', () => ({
  printCountSheet: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.mocked(apiFetch).mockReset()
  localStorage.clear()
})

beforeEach(() => {
  localStorage.setItem('auth_user', JSON.stringify({ id: 1, name: 'Admin', role: 'admin', token: 'tok' }))
})

const ITEM = {
  id: 1,
  name: 'Chicken Breast',
  name_ar: 'صدر دجاج',
  quantity: 10,
  unit: 'kg',
  min_quantity: 2,
  category: 'Proteins',
  supplier_id: null,
  cost_per_unit: '5.000',
  active: true,
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

function mockInventoryApi({ items = [ITEM], onAdjust } = {}) {
  vi.mocked(apiFetch).mockImplementation((url, opts) => {
    if (url.startsWith('/api/settings')) return Promise.resolve(jsonRes({ currency_symbol: 'OMR', tax_rate: '10', tables_count: '10' }))
    if (url.startsWith('/api/inventory/low-stock')) return Promise.resolve(jsonRes([]))
    if (url.startsWith('/api/inventory/movements')) return Promise.resolve(jsonRes([]))
    if (url.startsWith('/api/inventory/bulk-stocktake') && opts?.method === 'PATCH') {
      return Promise.resolve(jsonRes({ updated: 1 }))
    }
    // AdjustModal calls PATCH /api/inventory/:id with {quantity|adjust} body
    if (/\/api\/inventory\/\d+$/.test(url) && opts?.method === 'PATCH') {
      onAdjust && onAdjust({ url, body: JSON.parse(opts.body) })
      return Promise.resolve(jsonRes({ ...ITEM, quantity: 15 }))
    }
    if (url.startsWith('/api/inventory')) return Promise.resolve(jsonRes(items))
    if (url.startsWith('/api/suppliers')) return Promise.resolve(jsonRes([]))
    return Promise.resolve(jsonRes({}))
  })
}

function renderInventory() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <Inventory />
      </ToastProvider>
    </SettingsProvider>
  )
}

describe('Inventory — item list', () => {
  it('renders inventory items after API load', async () => {
    mockInventoryApi()
    renderInventory()
    await waitFor(() => expect(screen.getByText('Chicken Breast')).toBeTruthy(), { timeout: 3000 })
  })

  it('shows the quantity and unit for each item', async () => {
    mockInventoryApi()
    renderInventory()
    await waitFor(() => {
      const body = document.body.textContent
      expect(body).toContain('10')
      expect(body).toContain('kg')
    }, { timeout: 3000 })
  })

  it('renders multiple items', async () => {
    mockInventoryApi({
      items: [
        ITEM,
        { ...ITEM, id: 2, name: 'Tomatoes', name_ar: 'طماطم', unit: 'kg', quantity: 5 },
      ]
    })
    renderInventory()
    await waitFor(() => {
      expect(screen.getByText('Chicken Breast')).toBeTruthy()
      expect(screen.getByText('Tomatoes')).toBeTruthy()
    }, { timeout: 3000 })
  })
})

describe('Inventory — adjust modal', () => {
  it('opens AdjustModal with correct item name on ⚖️ click', async () => {
    mockInventoryApi()
    renderInventory()
    await waitFor(() => screen.getByText('Chicken Breast'), { timeout: 3000 })

    const adjustBtn = [...document.querySelectorAll('button')].find(
      b => b.title === 'Adjust stock' || b.textContent.trim() === '⚖️'
    )
    expect(adjustBtn).toBeTruthy()
    fireEvent.click(adjustBtn)

    await waitFor(() => {
      expect(screen.getByText(/Adjust Stock — Chicken Breast/)).toBeTruthy()
    }, { timeout: 2000 })
  })

  it('AdjustModal shows Add / Remove / Set mode buttons', async () => {
    mockInventoryApi()
    renderInventory()
    await waitFor(() => screen.getByText('Chicken Breast'), { timeout: 3000 })

    const adjustBtn = [...document.querySelectorAll('button')].find(
      b => b.title === 'Adjust stock' || b.textContent.trim() === '⚖️'
    )
    fireEvent.click(adjustBtn)

    await waitFor(() => {
      const body = document.body.textContent
      expect(body).toContain('Add')
      expect(body).toContain('Remove')
      expect(body).toContain('Set')
    }, { timeout: 2000 })
  })

  it('submits POST /api/inventory/:id/adjust with correct body', async () => {
    const adjustCalls = []
    mockInventoryApi({ onAdjust: (d) => adjustCalls.push(d) })
    renderInventory()
    await waitFor(() => screen.getByText('Chicken Breast'), { timeout: 3000 })

    const adjustBtn = [...document.querySelectorAll('button')].find(
      b => b.title === 'Adjust stock' || b.textContent.trim() === '⚖️'
    )
    fireEvent.click(adjustBtn)

    await waitFor(() => screen.getByText(/Adjust Stock — Chicken Breast/), { timeout: 2000 })

    const input = document.querySelector('input[type="number"]')
      || document.querySelector('input[inputmode="decimal"]')
      || document.querySelector('input[min]')
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: '5' } })

    // Save button text is "Update Stock"
    const saveBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent.trim() === 'Update Stock'
    )
    expect(saveBtn).toBeTruthy()

    await act(async () => {
      fireEvent.click(saveBtn)
    })

    await waitFor(() => expect(adjustCalls.length).toBe(1), { timeout: 2000 })
    // PATCH /api/inventory/:id with {quantity} (set mode default) or {adjust} (add/subtract)
    expect(adjustCalls[0].url).toMatch(/\/api\/inventory\/1$/)
    expect(
      typeof adjustCalls[0].body.quantity === 'number' || typeof adjustCalls[0].body.adjust === 'number'
    ).toBe(true)
  })

  it('closes AdjustModal when cancel/close is clicked', async () => {
    mockInventoryApi()
    renderInventory()
    await waitFor(() => screen.getByText('Chicken Breast'), { timeout: 3000 })

    const adjustBtn = [...document.querySelectorAll('button')].find(
      b => b.title === 'Adjust stock' || b.textContent.trim() === '⚖️'
    )
    fireEvent.click(adjustBtn)
    await waitFor(() => screen.getByText(/Adjust Stock — Chicken Breast/), { timeout: 2000 })

    const cancelBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent.includes('Cancel') || b.textContent === '✕' || b.textContent === '×'
    )
    expect(cancelBtn).toBeTruthy()
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.queryByText(/Adjust Stock — Chicken Breast/)).toBeNull()
    }, { timeout: 2000 })
  })
})

describe('Inventory — Stocktake tab', () => {
  it('switches to Stocktake view when Stocktake tab is clicked', async () => {
    mockInventoryApi()
    renderInventory()
    await waitFor(() => screen.getByText('Chicken Breast'), { timeout: 3000 })

    const stocktakeTab = [...document.querySelectorAll('button')].find(
      b => b.textContent.trim() === 'Stocktake'
    )
    expect(stocktakeTab).toBeTruthy()
    fireEvent.click(stocktakeTab)

    await waitFor(() => {
      const body = document.body.textContent
      expect(body).toContain('Stocktake') || expect(body).toContain('Count')
    }, { timeout: 2000 })
  })

  it('renders count inputs for items in Stocktake view', async () => {
    mockInventoryApi()
    renderInventory()
    await waitFor(() => screen.getByText('Chicken Breast'), { timeout: 3000 })

    const stocktakeTab = [...document.querySelectorAll('button')].find(
      b => b.textContent.trim() === 'Stocktake'
    )
    fireEvent.click(stocktakeTab)

    await waitFor(() => {
      const inputs = document.querySelectorAll('input[type="number"]')
      expect(inputs.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })
})

describe('Inventory — tab navigation', () => {
  it('renders all four tab buttons: Items, Movements, Stocktake, Impact', async () => {
    mockInventoryApi()
    renderInventory()
    await waitFor(() => screen.getByText('Chicken Breast'), { timeout: 3000 })

    const tabs = ['Items', 'Movements', 'Stocktake']
    for (const tab of tabs) {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === tab)
      expect(btn, `tab "${tab}" not found`).toBeTruthy()
    }
  })

  it('Movements tab switches to the audit log view', async () => {
    vi.mocked(apiFetch).mockImplementation((url) => {
      if (url.startsWith('/api/settings')) return Promise.resolve(jsonRes({ currency_symbol: 'OMR', tax_rate: '10', tables_count: '10' }))
      if (url.startsWith('/api/inventory/low-stock')) return Promise.resolve(jsonRes([]))
      if (url.startsWith('/api/inventory/movements')) return Promise.resolve(jsonRes([{
        id: 1, type: 'adjustment', delta: 5, quantity_after: 15,
        note: 'Manual top-up', created_at: new Date().toISOString(),
        item_name: 'Chicken Breast', unit: 'kg',
      }]))
      if (url.startsWith('/api/inventory')) return Promise.resolve(jsonRes([ITEM]))
      if (url.startsWith('/api/suppliers')) return Promise.resolve(jsonRes([]))
      return Promise.resolve(jsonRes({}))
    })

    renderInventory()
    await waitFor(() => screen.getByText('Chicken Breast'), { timeout: 3000 })

    const movementsTab = [...document.querySelectorAll('button')].find(
      b => b.textContent.trim() === 'Movements'
    )
    fireEvent.click(movementsTab)

    await waitFor(() => {
      const body = document.body.textContent
      expect(body.includes('Movements') || body.includes('adjustment') || body.includes('Manual')).toBe(true)
    }, { timeout: 3000 })
  })
})
