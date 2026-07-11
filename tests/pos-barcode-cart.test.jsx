// @vitest-environment jsdom
//
// Barcode-scanned items must behave like tapped items in the POS cart.
// The barcode path in POS.jsx now routes through the shared useCart.addToCart
// (no direct setCart), so these tests lock the shared behaviors both entry
// points rely on:
//   1. Adding the same no-modifier item twice (tap then scan, or scan twice)
//      merges into ONE cart line with qty 2 — cartId is `${id}:` for both,
//      never a Date.now()-suffixed key.
//   2. The warn-but-never-block low-stock toast fires when an add would push a
//      tracked ingredient negative — scanned items get the same warning taps do.
//   3. An item with modifiers keeps a distinct line from its no-modifier twin.
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCart } from '../src/hooks/useCart.js'

const burger = { id: 7, name: 'Burger', name_ar: 'برغر', price: '2.500', category: 'grills' }

describe('useCart.addToCart — shared tap/barcode path', () => {
  it('merges repeated no-modifier adds of the same item into one line', () => {
    const { result } = renderHook(() => useCart({ taxRate: 0 }))

    act(() => result.current.addToCart(burger, [])) // tap
    act(() => result.current.addToCart(burger, [])) // barcode scan of same item

    expect(result.current.cart.length).toBe(1)
    expect(result.current.cart[0].qty).toBe(2)
    expect(result.current.cart[0].cartId).toBe('7:')
    expect(result.current.cartCount).toBe(2)
  })

  it('uses a stable modifier-based cartId (no timestamp suffix)', () => {
    const { result } = renderHook(() => useCart({ taxRate: 0 }))
    act(() => result.current.addToCart(burger, []))
    // The old barcode path keyed lines as `${id}-${Date.now()}`; the shared
    // path must key as `${id}:${sortedModifierIds}`.
    expect(result.current.cart[0].cartId).not.toMatch(/^7-\d+$/)
    expect(result.current.cart[0].cartId).toBe('7:')
  })

  it('warns (but does not block) when an add exceeds tracked stock', () => {
    const showToast = vi.fn()
    const { result } = renderHook(() =>
      useCart({ taxRate: 0, stockAvail: { 7: 1 }, showToast })
    )

    act(() => result.current.addToCart(burger, []))
    expect(showToast).not.toHaveBeenCalled()

    act(() => result.current.addToCart(burger, [])) // 2 > max 1 → warn
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast.mock.calls[0][1]).toBe('error')
    // Never blocks: the line still incremented.
    expect(result.current.cart[0].qty).toBe(2)
  })

  it('warns on out-of-stock (max 0) items, matching the tapped-item behavior', () => {
    const showToast = vi.fn()
    const { result } = renderHook(() =>
      useCart({ taxRate: 0, stockAvail: { 7: 0 }, showToast })
    )

    act(() => result.current.addToCart(burger, []))
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast.mock.calls[0][0]).toContain('نفد المخزون')
    expect(result.current.cart.length).toBe(1) // still added
  })

  it('keeps a modifier line separate from the no-modifier line of the same item', () => {
    const { result } = renderHook(() => useCart({ taxRate: 0 }))
    act(() => result.current.addToCart(burger, [{ id: 3, name: 'Extra cheese', price_delta: '0.250' }]))
    act(() => result.current.addToCart(burger, [])) // barcode-style plain add

    expect(result.current.cart.length).toBe(2)
    const plain = result.current.cart.find(c => c.cartId === '7:')
    const modded = result.current.cart.find(c => c.cartId === '7:3')
    expect(plain.qty).toBe(1)
    expect(modded.qty).toBe(1)
    expect(modded.price).toBeCloseTo(2.75)
  })
})
