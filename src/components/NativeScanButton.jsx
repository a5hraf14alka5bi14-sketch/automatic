// NativeScanButton — renders a camera barcode/QR scan button ONLY inside a
// Capacitor native shell (iOS/Android). On the web it renders nothing, so the
// existing HID keyboard-wedge scanner path is unaffected. When tapped it opens
// the device camera via @capacitor-mlkit/barcode-scanning and reports the first
// scanned value through onScan(code).
import React, { useEffect, useState } from 'react'
import { isNativePlatform } from '../config.js'

export default function NativeScanButton({ onScan }) {
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setAvailable(isNativePlatform())
  }, [])

  if (!available) return null

  const scan = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
      // Ensure the on-device scanning module is present (Android may download it).
      const supported = await BarcodeScanner.isSupported().catch(() => ({ supported: true }))
      if (supported?.supported === false) {
        setBusy(false)
        return
      }
      const perm = await BarcodeScanner.requestPermissions()
      if (perm?.camera !== 'granted' && perm?.camera !== 'limited') {
        setBusy(false)
        return
      }
      const { barcodes } = await BarcodeScanner.scan()
      const code = barcodes?.[0]?.rawValue
      if (code) onScan?.(code)
    } catch {
      /* user cancelled or scan failed — silently ignore */
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={scan}
      disabled={busy}
      aria-label="مسح الباركود بالكاميرا"
      className="shrink-0 flex items-center justify-center w-11 h-11 rounded-lg bg-slate-800 border border-slate-700 text-orange-400 active:bg-slate-700 disabled:opacity-50"
    >
      {busy ? '…' : '📷'}
    </button>
  )
}
