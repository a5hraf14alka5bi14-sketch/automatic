// @vitest-environment jsdom
//
// Regression coverage for the thermal-printer receipt redesign in
// src/components/ReceiptModal.jsx, matching the restaurant's real printed
// output:
//   • Customer copy is a bilingual TAX INVOICE: business identity block
//     (CR NO / Tax Card / Tel), "TAX INVOICE / فاتورة" title, order type,
//     Inv No/Date/Customer meta, bilingual item table, Subtotal/VAT/Grand
//     Total with 3-decimal amounts, and bilingual thank-you footer.
//   • Kitchen copy renders one KOT slip PER STATION (drinks print on their
//     own slip, like the real printer setup), with Inv No, KOT number,
//     Items/Qt. columns, and NO prices.
//   • stationForCategory routes drink categories to the 'drinks' station.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ReceiptModal from '../src/components/ReceiptModal.jsx'
import { stationForCategory } from '../src/components/pos/constants.js'

afterEach(() => cleanup())

const settings = {
  restaurant_name: 'Automatic',
  restaurant_name_ar: 'الأوتوماتيك',
  business_legal_name: 'Automatic Lebanese Restaurant & Catering',
  business_legal_name_ar: 'مطعم ومقهى الأوتوماتيك اللبناني',
  business_cr_no: '1234568',
  business_tax_card: '1017973',
  business_phone: '+968 24499981',
  receipt_footer: 'THANK YOU & VISIT AGAIN',
  receipt_footer_ar: 'شكرا لك والزيارة مرة أخرى',
  tax_rate: '5',
  currency_symbol: 'OMR',
}

const order = {
  id: 4130,
  type: 'takeaway',
  customer_name: null,
  payment_method: 'cash',
  created_at: '2026-07-07T12:00:00Z',
  paid_at: '2026-07-07T12:05:00Z',
  subtotal: 3.6,
  tax: 0.18,
  total: 3.78,
  items: [
    { name: 'French Fries', name_ar: 'بطاطا مقلية', quantity: 2, price: 1.2, station: 'kitchen', modifiers: [] },
    { name: 'Kinza Cola', name_ar: 'كولا كنزة', quantity: 2, price: 0.6, station: 'drinks', modifiers: [] },
  ],
}

describe('CustomerReceipt — TAX INVOICE format', () => {
  it('renders the business identity header (CR, tax card, phone) and bilingual titles', () => {
    render(<ReceiptModal order={order} settings={settings} onClose={() => {}} />)
    const bodies = screen.getAllByText('TAX INVOICE')
    expect(bodies.length).toBeGreaterThan(0)
    expect(screen.getAllByText('فاتورة').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/1234568/).length).toBeGreaterThan(0) // CR NO
    expect(screen.getAllByText(/1017973/).length).toBeGreaterThan(0) // Tax card
    expect(screen.getAllByText(/\+968 24499981/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Automatic Lebanese Restaurant & Catering').length).toBeGreaterThan(0)
    expect(screen.getAllByText('مطعم ومقهى الأوتوماتيك اللبناني').length).toBeGreaterThan(0)
  })

  it('shows order type, Inv No, bilingual totals with 3-decimals and the footer', () => {
    render(<ReceiptModal order={order} settings={settings} onClose={() => {}} />)
    expect(screen.getAllByText('Take Away').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Inv No.').length).toBeGreaterThan(0)
    // Line amounts: 2 × 1.200 = 2.400 and 2 × 0.600 = 1.200 (3 decimals, no currency per line)
    expect(screen.getAllByText('2.400').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Grand Total/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('OMR 3.780').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/VAT 5%/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('THANK YOU & VISIT AGAIN').length).toBeGreaterThan(0)
    expect(screen.getAllByText('شكرا لك والزيارة مرة أخرى').length).toBeGreaterThan(0)
    // Arabic item names printed under English
    expect(screen.getAllByText('بطاطا مقلية').length).toBeGreaterThan(0)
  })
})

describe('KitchenReceipt — KOT per station', () => {
  function openKitchenTab() {
    render(<ReceiptModal order={order} settings={settings} onClose={() => {}} />)
    fireEvent.click(screen.getByText(/Kitchen Copy/))
  }

  it('renders one KOT slip per station with KOT numbers and no prices', () => {
    openKitchenTab()
    // Two stations → KOT: 1 and KOT: 2 headings (preview renders once)
    const kotLabels = screen.getAllByText(/^KOT:$/)
    expect(kotLabels.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText(/KITCHEN/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/DRINKS/).length).toBeGreaterThan(0)
    // Items/Qt. table header, food + drink names on their slips
    expect(screen.getAllByText('Items').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Qt.').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('French Fries').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Kinza Cola').length).toBeGreaterThan(0)
    // No prices anywhere on the KOT (kitchen tab replaces customer preview)
    expect(screen.queryByText('OMR 3.780')).toBeNull()
    expect(screen.queryByText(/Grand Total/)).toBeNull()
  })

  it('falls back to a single kitchen slip when items lack a station', () => {
    const noStation = { ...order, items: order.items.map(({ station, ...rest }) => rest) }
    render(<ReceiptModal order={noStation} settings={settings} onClose={() => {}} />)
    fireEvent.click(screen.getByText(/Kitchen Copy/))
    // The modal renders the receipt twice (hidden print target + visible
    // preview), so a single-station order yields exactly 2 "KOT:" labels.
    expect(screen.getAllByText(/^KOT:$/).length).toBe(2)
    expect(screen.queryByText(/DRINKS/)).toBeNull()
  })
})

describe('stationForCategory', () => {
  it('routes drinks/coffee-tea/juices to the drinks station, food to kitchen', () => {
    expect(stationForCategory('drinks')).toBe('drinks')
    expect(stationForCategory('coffee-tea')).toBe('drinks')
    expect(stationForCategory('juices')).toBe('drinks')
    expect(stationForCategory('grills')).toBe('kitchen')
    expect(stationForCategory(undefined)).toBe('kitchen')
  })
})
