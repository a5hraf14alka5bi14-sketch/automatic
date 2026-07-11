import { useEffect, useRef } from 'react'

// Module-level stack of open dialogs so that when dialogs stack (e.g. the
// Orders drawer with a payment modal on top), only the TOPMOST one responds
// to Escape and traps Tab. Each mounted dialog pushes a token on open and
// removes it on close.
const dialogStack = []

// Shared modal/dialog keyboard accessibility:
//  - moves focus into the panel on open (initialFocusRef if given, else first focusable)
//  - closes on Escape (topmost dialog only)
//  - traps Tab / Shift+Tab inside the panel (topmost dialog only)
//  - restores focus to the previously-focused element on unmount
// The effect runs ONCE per mount: onClose is read through a ref so inline
// closures from parents don't re-run focus capture/restore mid-dialog.
// Usage: const panelRef = useDialogA11y(onClose, { initialFocusRef })
// Attach panelRef to the dialog panel element along with
// role="dialog" aria-modal="true" aria-labelledby="<title id>".
export function useDialogA11y(onClose, { initialFocusRef } = {}) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const initialFocusR = useRef(initialFocusRef)
  initialFocusR.current = initialFocusRef

  useEffect(() => {
    const token = Symbol('dialog')
    dialogStack.push(token)
    const previouslyFocused = document.activeElement

    const getFocusables = () => {
      const panel = panelRef.current
      if (!panel) return []
      return Array.from(panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )).filter(el => !el.disabled)
    }

    // Initial focus: preferred element, else first focusable in the panel.
    // Skip if focus is already inside the panel (e.g. an autoFocus input won).
    const panel = panelRef.current
    if (!panel || !panel.contains(document.activeElement)) {
      const target = initialFocusR.current?.current || getFocusables()[0]
      target?.focus()
    }

    const onKeyDown = (e) => {
      // Only the topmost open dialog handles keyboard chrome.
      if (dialogStack[dialogStack.length - 1] !== token) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = getFocusables()
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const inside = panelRef.current?.contains(document.activeElement)
      if (e.shiftKey) {
        if (document.activeElement === first || !inside) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last || !inside) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const i = dialogStack.indexOf(token)
      if (i !== -1) dialogStack.splice(i, 1)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
    // Intentionally mount-once: onClose/initialFocusRef are read via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return panelRef
}
