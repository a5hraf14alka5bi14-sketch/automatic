// Generates a printable one-page "How to install the app" cheat-sheet (PDF)
// staff can hand out. Dark branded header + white body for clean printing.
// Run: node scripts/generate-install-guide.js [publishedUrl]

import { jsPDF } from 'jspdf'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const PUBLISHED_URL = process.argv[2] || 'your-app.replit.app'
const OUT = path.join(ROOT, 'install-guide.pdf')

const ORANGE = [249, 115, 22] // orange-500
const DARK = [2, 6, 23] // #020617
const SLATE = [71, 85, 105]
const LIGHT_SLATE = [148, 163, 184]

const logoData =
  'data:image/png;base64,' +
  fs.readFileSync(path.join(ROOT, 'src/assets/brand/logo-full.png')).toString('base64')

const doc = new jsPDF({ unit: 'pt', format: 'a4' })
const W = doc.internal.pageSize.getWidth()
const M = 40

// ── Header band ────────────────────────────────────────────────────────────
doc.setFillColor(...DARK)
doc.rect(0, 0, W, 130, 'F')

// White "plate" behind logo so the dark logo text stays legible.
doc.setFillColor(255, 255, 255)
doc.roundedRect(M, 28, 74, 74, 10, 10, 'F')
doc.addImage(logoData, 'PNG', M + 7, 35, 60, 60)

doc.setTextColor(255, 255, 255)
doc.setFont('helvetica', 'bold')
doc.setFontSize(22)
doc.text('Automatic Restaurant OS', M + 92, 58)
doc.setFont('helvetica', 'normal')
doc.setFontSize(12)
doc.setTextColor(...ORANGE)
doc.text('How to install the app on your device', M + 92, 78)
doc.setTextColor(...LIGHT_SLATE)
doc.setFontSize(10)
doc.text('No app store needed  ·  Installs in seconds  ·  Updates automatically', M + 92, 96)

let y = 168

function sectionTitle(title) {
  doc.setFillColor(...ORANGE)
  doc.roundedRect(M, y - 13, 4, 18, 2, 2, 'F')
  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(title, M + 14, y)
  y += 22
}

function steps(lines) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  lines.forEach((line, i) => {
    doc.setFillColor(...ORANGE)
    doc.circle(M + 20, y - 4, 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(String(i + 1), M + 20, y - 1, { align: 'center' })

    doc.setTextColor(...SLATE)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    const wrapped = doc.splitTextToSize(line, W - M - 55)
    doc.text(wrapped, M + 38, y)
    y += wrapped.length * 15 + 6
  })
  y += 10
}

// ── The published address box ────────────────────────────────────────────────
doc.setFillColor(241, 245, 249)
doc.roundedRect(M, y - 14, W - M * 2, 34, 6, 6, 'F')
doc.setTextColor(...SLATE)
doc.setFont('helvetica', 'normal')
doc.setFontSize(9)
doc.text('Open this address in your browser first:', M + 12, y - 1)
doc.setTextColor(...DARK)
doc.setFont('helvetica', 'bold')
doc.setFontSize(13)
doc.text(PUBLISHED_URL, M + 12, y + 14)
y += 46

// ── iPhone / iPad ────────────────────────────────────────────────────────────
sectionTitle('iPhone & iPad  (use Safari)')
steps([
  'Open the address above in the Safari browser.',
  'Tap the Share button (the square with an up arrow) at the bottom.',
  'Scroll down and tap "Add to Home Screen".',
  'Tap "Add" — the app icon appears on your home screen.',
])

// ── Android ──────────────────────────────────────────────────────────────────
sectionTitle('Android  (use Chrome)')
steps([
  'Open the address above in the Chrome browser.',
  'Tap the "Install app" banner, or tap the three-dot menu (top-right).',
  'Choose "Install app" / "Add to Home screen", then confirm.',
])

// ── Computer ─────────────────────────────────────────────────────────────────
sectionTitle('Windows, Mac & Linux  (Chrome or Edge)')
steps([
  'Open the address above in Chrome or Edge.',
  'Click the install icon on the right side of the address bar.',
  'Click "Install" — the app opens in its own window.',
])

// ── Footer ───────────────────────────────────────────────────────────────────
const H = doc.internal.pageSize.getHeight()
doc.setDrawColor(...LIGHT_SLATE)
doc.setLineWidth(0.5)
doc.line(M, H - 54, W - M, H - 54)
doc.setTextColor(...LIGHT_SLATE)
doc.setFont('helvetica', 'normal')
doc.setFontSize(9)
doc.text(
  'Once installed, the app opens full-screen like a native app, works offline, and updates itself automatically.',
  M,
  H - 38,
)
doc.setTextColor(...ORANGE)
doc.setFont('helvetica', 'bold')
doc.text('Automatic Restaurant OS  ·  Lebanese Food', M, H - 22)

doc.save(OUT)
fs.writeFileSync(OUT, Buffer.from(doc.output('arraybuffer')))
console.log('Wrote', OUT)
