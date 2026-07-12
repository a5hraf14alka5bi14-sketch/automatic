---
name: Modal keyboard a11y pattern
description: Shared useDialogA11y hook — stack-aware Escape/Tab trap for all app modals
---
All modals (payment, void, shift, drawer) use `src/hooks/useDialogA11y.js`.

Rules learned:
- The hook must be **mount-once** (deps `[]`, onClose read via ref): callers pass inline `onClose` closures, so depending on `[onClose]` re-runs focus capture/restore every parent render and breaks focus restoration.
- **Stack-awareness is required**: `stopPropagation()` does NOT stop other document-level keydown listeners, so with stacked dialogs one Escape closed multiple layers. A module-level stack of Symbol tokens lets only the topmost dialog handle Escape/Tab.
- Initial focus: skip if focus is already inside the panel (respects `autoFocus` inputs); else `initialFocusRef` or first focusable.

**How to apply:** any new modal must use this hook (panelRef + role="dialog" aria-modal aria-labelledby), never hand-roll a keydown listener.
