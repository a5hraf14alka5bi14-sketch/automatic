// @vitest-environment jsdom
//
// Critical POS flows:
//   1. Menu items render after API load
//   2. Clicking a no-modifier item adds it to the cart (count badge updates)
//   3. Switching to Takeaway removes the table requirement
//   4. "Place Order" button is enabled once cart is non-empty (Takeaway mode)
//   5. Submitting the order calls POST /api/orders with correct payload
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { apiFetch } from '../src/utils/api.js'
import { ToastProvider } from '../src/context/ToastContext.jsx'
import { SettingsProvider } from '../src/context/SettingsContext.jsx'
import POS from '../src/pages/POS.jsx'

vi.mock('../src/utils/api.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, apiFetch: vi.fn() }
})

vi.mock('../src/utils/useLiveEvents.js', () => ({
  useLiveEvents: vi.fn(),
  useDebouncedCallback: (fn) => fn,
}))

vi.mock('../src/components/OfflineBanner.jsx', () => ({
  enqueueOfflineOrder: vi.fn(),
  default: () => null,
}))

afterEach(() => {
  cleanup()
  vi.mocked(apiFetch).mockReset()
  localStorage.clear()
})

beforeEach(() => {
  localStorage.setItem('auth_user', JSON.stringify({ id: 1, name: 'Admin', role: 'admin', token: 'tok' }))
})

const SETTINGS = { currency_symbol: 'OMR', tax_rate: '10', tables_count: '10', restaurant_name: 'Test', loyalty_points_per_dollar: '1' }

const MENU_ITEM = {
  id: 1,
  name: 'Hummus Plate',
  name_ar: 'حمص',
  price: '2.500',
  category: 'dips',
  available: true,
  modifier_groups: [],
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

// Find a menu item button (has font-semibold <p> child) vs cart item (<p> with font-medium).
// After adding to cart, item name appears in BOTH panel renders — this disambiguates.
function findMenuItemBtn(name) {
  const ps = [...document.querySelectorAll('p')]
  const p = ps.find(el => el.textContent.trim() === name && el.className.includes('font-semibold'))
  return p?.closest('button') || null
}

function mockPosApi({ onOrder } = {}) {
  vi.mocked(apiFetch).mockImplementation((url, opts) => {
    if (url.startsWith('/api/settings')) return Promise.resolve(jsonRes(SETTINGS))
    if (url.startsWith('/api/customers')) return Promise.resolve(jsonRes([]))
    if (url.startsWith('/api/menu/stock-availability')) return Promise.resolve(jsonRes({}))
    if (url.startsWith('/api/menu/all')) return Promise.resolve(jsonRes([MENU_ITEM]))
    if (url.startsWith('/api/stations')) return Promise.resolve(jsonRes([]))
    if (url.startsWith('/api/orders') && opts?.method === 'POST') {
      onOrder && onOrder(JSON.parse(opts.body))
      return Promise.resolve(jsonRes({ id: 42, status: 'pending', total: '2.750', items: [] }))
    }
    return Promise.resolve(jsonRes({}))
  })
}

function renderPOS() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <POS />
      </ToastProvider>
    </SettingsProvider>
  )
}

describe('POS — menu rendering', () => {
  it('renders menu items after API load', async () => {
    mockPosApi()
    renderPOS()
    await waitFor(() => expect(screen.getByText('Hummus Plate')).toBeTruthy(), { timeout: 3000 })
  })

  it('shows items count in the menu panel subtitle', async () => {
    mockPosApi()
    renderPOS()
    await waitFor(() => expect(screen.getByText(/1 items/)).toBeTruthy(), { timeout: 3000 })
  })
})

describe('POS — add to cart', () => {
  it('shows "1 in cart" badge after clicking a no-modifier item', async () => {
    mockPosApi()
    renderPOS()
    await waitFor(() => screen.getByText('Hummus Plate'), { timeout: 3000 })

    fireEvent.click(screen.getByText('Hummus Plate'))
    await waitFor(() => expect(screen.getByText(/1 in cart/)).toBeTruthy(), { timeout: 2000 })
  })

  it('increments cart count on repeated clicks', async () => {
    mockPosApi()
    renderPOS()
    await waitFor(() => screen.getByText('Hummus Plate'), { timeout: 3000 })

    fireEvent.click(screen.getByText('Hummus Plate'))
    await waitFor(() => screen.getByText(/1 in cart/), { timeout: 2000 })

    // After first add, item name exists in both menu and cart — use specific selector
    const menuBtn = findMenuItemBtn('Hummus Plate')
    expect(menuBtn).toBeTruthy()
    fireEvent.click(menuBtn)

    await waitFor(() => expect(screen.getByText(/2 in cart/)).toBeTruthy(), { timeout: 2000 })
  })
})

describe('POS — order type selection', () => {
  it('highlights the Takeaway button when clicked', async () => {
    mockPosApi()
    renderPOS()
    await waitFor(() => screen.getByText('Hummus Plate'), { timeout: 3000 })

    const takeawayBtn = screen.getAllByText(/Takeaway/i)[0].closest('button')
    fireEvent.click(takeawayBtn)

    await waitFor(() => {
      expect(takeawayBtn.className).toContain('bg-orange-500')
    }, { timeout: 2000 })
  })
})

describe('POS — Place Order', () => {
  it('Place Order button is disabled when cart is empty', async () => {
    mockPosApi()
    renderPOS()
    await waitFor(() => screen.getByText('Hummus Plate'), { timeout: 3000 })

    const btn = screen.getByText(/Place Order/i).closest('button')
    expect(btn.disabled).toBe(true)
  })

  it('Place Order button is enabled after adding a Takeaway item', async () => {
    mockPosApi()
    renderPOS()
    await waitFor(() => screen.getByText('Hummus Plate'), { timeout: 3000 })

    fireEvent.click(screen.getAllByText(/Takeaway/i)[0].closest('button'))
    fireEvent.click(screen.getByText('Hummus Plate'))

    await waitFor(() => {
      const btn = screen.getByText(/Place Order/i).closest('button')
      expect(btn.disabled).toBe(false)
    }, { timeout: 2000 })
  })

  it('submits POST /api/orders with correct items on Place Order click', async () => {
    const orderPayloads = []
    mockPosApi({ onOrder: (p) => orderPayloads.push(p) })
    renderPOS()
    await waitFor(() => screen.getByText('Hummus Plate'), { timeout: 3000 })

    fireEvent.click(screen.getAllByText(/Takeaway/i)[0].closest('button'))
    fireEvent.click(screen.getByText('Hummus Plate'))

    await waitFor(() => {
      const btn = screen.getByText(/Place Order/i).closest('button')
      expect(btn.disabled).toBe(false)
    }, { timeout: 2000 })

    await act(async () => {
      fireEvent.click(screen.getByText(/Place Order/i).closest('button'))
    })

    await waitFor(() => expect(orderPayloads.length).toBeGreaterThan(0), { timeout: 2000 })
    const payload = orderPayloads[0]
    expect(payload.type).toBe('takeaway')
    expect(Array.isArray(payload.items)).toBe(true)
    expect(payload.items.length).toBe(1)
    expect(payload.items[0].menu_item_id).toBe(1)
    expect(payload.items[0].quantity).toBe(1)
  })
})
