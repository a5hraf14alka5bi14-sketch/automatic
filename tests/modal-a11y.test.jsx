// @vitest-environment jsdom
//
// Keyboard accessibility for the payment/void/shift modals (useDialogA11y):
//   1. role="dialog" + aria-modal + aria-labelledby wired to the title.
//   2. Escape closes the dialog.
//   3. Tab from the last focusable wraps to the first (focus trap).
//   4. Focus moves into the panel on open and is restored on unmount.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { useDialogA11y } from '../src/hooks/useDialogA11y.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function TestDialog({ onClose }) {
  const panelRef = useDialogA11y(onClose)
  return (
    <div>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="t-title">
        <h2 id="t-title">Test Dialog</h2>
        <button id="first">First</button>
        <input id="mid" />
        <button id="last">Last</button>
      </div>
    </div>
  )
}

let container, root
function mount(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(ui))
}
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = root = null
})

const key = (k, opts = {}) =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }))
  })

describe('useDialogA11y', () => {
  it('renders dialog semantics and moves focus into the panel on open', () => {
    mount(<TestDialog onClose={() => {}} />)
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('t-title')
    // Initial focus lands on the first focusable inside the panel
    expect(document.activeElement?.id).toBe('first')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    mount(<TestDialog onClose={onClose} />)
    key('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('traps Tab: wraps last → first and Shift+Tab first → last', () => {
    mount(<TestDialog onClose={() => {}} />)
    container.querySelector('#last').focus()
    key('Tab')
    expect(document.activeElement?.id).toBe('first')
    key('Tab', { shiftKey: true })
    expect(document.activeElement?.id).toBe('last')
  })

  it('restores focus to the previously focused element on unmount', () => {
    const outside = document.createElement('button')
    outside.id = 'outside'
    document.body.appendChild(outside)
    outside.focus()
    mount(<TestDialog onClose={() => {}} />)
    expect(document.activeElement?.id).toBe('first')
    act(() => root.unmount())
    expect(document.activeElement?.id).toBe('outside')
    outside.remove()
  })

  it('only the topmost of stacked dialogs handles Escape', () => {
    const closeOuter = vi.fn()
    const closeInner = vi.fn()
    function Stacked() {
      const outerRef = useDialogA11y(closeOuter)
      const innerRef = useDialogA11y(closeInner)
      return (
        <div>
          <div ref={outerRef} role="dialog"><button id="o">Outer</button></div>
          <div ref={innerRef} role="dialog"><button id="i">Inner</button></div>
        </div>
      )
    }
    mount(<Stacked />)
    key('Escape')
    expect(closeInner).toHaveBeenCalledTimes(1)
    expect(closeOuter).not.toHaveBeenCalled()
  })

  it('leaves an autoFocus element inside the panel alone', () => {
    function AutoDialog() {
      const panelRef = useDialogA11y(() => {})
      return (
        <div ref={panelRef} role="dialog" aria-modal="true">
          <button id="btn">Btn</button>
          <textarea id="auto" autoFocus />
        </div>
      )
    }
    mount(<AutoDialog />)
    expect(document.activeElement?.id).toBe('auto')
  })
})
