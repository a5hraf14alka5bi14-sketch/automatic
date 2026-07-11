import React, { useEffect, useState } from 'react'
import {
  getInstallPrompt,
  clearInstallPrompt,
  subscribeInstallPrompt,
} from '../utils/installPrompt.js'

// Detect whether the app is already running as an installed PWA (standalone).
function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes this non-standard flag when launched from the home screen.
    window.navigator.standalone === true
  )
}

function isIOS() {
  const ua = window.navigator.userAgent || ''
  const iOSDevice = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ reports as a Mac; detect via touch support.
  const iPadOS = ua.includes('Macintosh') && 'ontouchend' in document
  return iOSDevice || iPadOS
}

/**
 * "Install this app" control for the sidebar footer.
 *
 * - Chrome / Edge / Android: captures the `beforeinstallprompt` event and
 *   triggers the native install prompt on click.
 * - iOS Safari: no prompt API exists, so it opens a small instructions card
 *   ("Share → Add to Home Screen").
 * - Renders nothing when the app is already installed (standalone) or when the
 *   platform can't install it (e.g. a desktop browser with no prompt and not iOS).
 */
export default function InstallButton({ expanded = true, onNavigate }) {
  // Seed from the app-level capture (installPrompt.js) so a prompt fired on the
  // login screen, before this component mounted, is not lost.
  const [deferredPrompt, setDeferredPrompt] = useState(getInstallPrompt())
  const [installed, setInstalled] = useState(isStandalone())
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  const ios = isIOS()

  useEffect(() => {
    // React to prompt capture / clearing / appinstalled from the global module.
    const unsub = subscribeInstallPrompt((p) => {
      setDeferredPrompt(p)
      if (p === null) setInstalled(isStandalone())
    })
    return unsub
  }, [])

  // Already installed → nothing to show.
  if (installed) return null

  // On non-iOS platforms with no captured prompt there's nothing we can trigger,
  // so hide the control entirely (avoids a dead button on desktop Firefox etc.).
  const canPrompt = !!deferredPrompt
  if (!canPrompt && !ios) return null

  const handleClick = async () => {
    if (canPrompt) {
      deferredPrompt.prompt()
      try {
        await deferredPrompt.userChoice
      } catch {
        /* user dismissed */
      }
      // A prompt event can only be used once — clear it app-wide.
      clearInstallPrompt()
      return
    }
    // iOS: no programmatic prompt — show the manual steps.
    setShowIOSHelp(true)
  }

  return (
    <>
      {expanded ? (
        <button
          onClick={handleClick}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 transition-colors"
        >
          <span>⬇️</span>
          <span>Install this app</span>
        </button>
      ) : (
        <button
          onClick={handleClick}
          className="w-full flex justify-center text-orange-400 hover:text-orange-300 transition-colors py-1 rounded hover:bg-orange-500/10"
          title="Install this app"
          aria-label="Install this app"
        >
          ⬇️
        </button>
      )}

      {showIOSHelp && (
        <IOSInstallHelp
          onClose={() => {
            setShowIOSHelp(false)
            onNavigate?.()
          }}
        />
      )}
    </>
  )
}

function IOSInstallHelp({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-base">Install on your iPhone / iPad</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          Safari can add this app to your home screen so it opens full-screen like
          a native app.
        </p>
        <ol className="space-y-3 text-sm text-slate-300">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 font-bold flex items-center justify-center text-xs">1</span>
            <span>Tap the <strong className="text-white">Share</strong> button (the square with an ↑ arrow) at the bottom of Safari.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 font-bold flex items-center justify-center text-xs">2</span>
            <span>Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 font-bold flex items-center justify-center text-xs">3</span>
            <span>Tap <strong className="text-white">Add</strong> — the icon appears on your home screen.</span>
          </li>
        </ol>
        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
