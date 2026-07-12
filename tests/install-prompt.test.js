// @vitest-environment jsdom
//
// Covers src/utils/installPrompt.js — the app-level capture of the PWA
// `beforeinstallprompt` event. Chromium fires that event ONCE, early during
// page load (usually on the login screen, before the post-login Sidebar and its
// InstallButton mount). The whole point of this module is that it starts
// listening at import time so a late-mounting component can still retrieve the
// prompt. A regression here means the "Install this app" button silently never
// appears — so the capture-before-mount contract is pinned down here.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

async function loadModule() {
  vi.resetModules()
  return import('../src/utils/installPrompt.js')
}

// A minimal stand-in for a BeforeInstallPromptEvent.
function makePromptEvent() {
  const evt = new Event('beforeinstallprompt')
  evt.prompt = vi.fn()
  evt.userChoice = Promise.resolve({ outcome: 'accepted' })
  return evt
}

describe('installPrompt — capture before mount', () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.restoreAllMocks() })

  it('starts with no captured prompt', async () => {
    const { getInstallPrompt } = await loadModule()
    expect(getInstallPrompt()).toBe(null)
  })

  it('captures a beforeinstallprompt fired AFTER import (late-mount contract)', async () => {
    const { getInstallPrompt } = await loadModule()
    const evt = makePromptEvent()
    window.dispatchEvent(evt)
    // The event is retained so a component mounting later can still read it.
    expect(getInstallPrompt()).toBe(evt)
  })

  it('calls preventDefault so the mini-infobar is suppressed', async () => {
    await loadModule()
    const evt = makePromptEvent()
    const spy = vi.spyOn(evt, 'preventDefault')
    window.dispatchEvent(evt)
    expect(spy).toHaveBeenCalled()
  })

  it('notifies subscribers when a prompt is captured', async () => {
    const { subscribeInstallPrompt } = await loadModule()
    const seen = []
    const unsub = subscribeInstallPrompt((p) => seen.push(p))
    const evt = makePromptEvent()
    window.dispatchEvent(evt)
    expect(seen).toContain(evt)
    unsub()
  })

  it('clearInstallPrompt() forgets the prompt and notifies (used once)', async () => {
    const { getInstallPrompt, clearInstallPrompt, subscribeInstallPrompt } = await loadModule()
    window.dispatchEvent(makePromptEvent())
    expect(getInstallPrompt()).not.toBe(null)

    const seen = []
    const unsub = subscribeInstallPrompt((p) => seen.push(p))
    clearInstallPrompt()
    expect(getInstallPrompt()).toBe(null)
    expect(seen).toContain(null)
    unsub()
  })

  it('appinstalled clears the captured prompt', async () => {
    const { getInstallPrompt } = await loadModule()
    window.dispatchEvent(makePromptEvent())
    expect(getInstallPrompt()).not.toBe(null)
    window.dispatchEvent(new Event('appinstalled'))
    expect(getInstallPrompt()).toBe(null)
  })

  it('unsubscribe stops further notifications', async () => {
    const { subscribeInstallPrompt } = await loadModule()
    const seen = []
    const unsub = subscribeInstallPrompt((p) => seen.push(p))
    unsub()
    window.dispatchEvent(makePromptEvent())
    expect(seen).toHaveLength(0)
  })
})
