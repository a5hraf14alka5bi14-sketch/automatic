// Automatic Restaurant OS — Electron main process (Windows desktop shell).
//
// The desktop app reuses the exact same built web frontend (dist/) as the web
// and mobile targets — no business logic is duplicated. It talks to the SAME
// hosted Express/PostgreSQL backend. The backend origin is provided at build
// time (VITE_API_BASE_URL, baked into the bundle) or overridable at runtime via
// the APP_BACKEND_URL env var for testing against a different server.
import { app, BrowserWindow, Menu, shell, Notification, ipcMain, protocol, net } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import electronUpdater from 'electron-updater'
import { resolveBundleAsset } from './resolve-asset.js'

const { autoUpdater } = electronUpdater
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, '..', 'dist')

const APP_TITLE = 'الأوتوماتيك اللبناني · Automatic Restaurant OS'
// Custom protocol for deep links (auto-os://…), mirrors the mobile scheme.
const DEEP_LINK_SCHEME = 'auto-os'
// Internal scheme used to serve the built SPA. Serving over a real protocol
// (instead of file://) makes Vite's root-absolute asset URLs (/assets/…,
// /favicon.png) resolve against the app bundle, so the UI actually loads.
const APP_SCHEME = 'app'
const APP_ORIGIN = `${APP_SCHEME}://bundle`

// Only these schemes may be opened in the system browser from renderer content.
const SAFE_EXTERNAL_SCHEMES = new Set(['https:', 'mailto:'])

let mainWindow = null

// Must be called BEFORE app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

// Map an app://bundle/<path> request onto a file inside dist/.
// The pure resolution + path-traversal guard lives in resolve-asset.js so it can
// be unit-tested without Electron.
function registerAppProtocol() {
  protocol.handle(APP_SCHEME, (request) => {
    const { pathname } = new URL(request.url)
    const { ok, filePath } = resolveBundleAsset(DIST_DIR, pathname)
    if (!ok) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click: () => shell.openExternal('https://replit.com'),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#020617',
    title: APP_TITLE,
    autoHideMenuBar: false,
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Open external links in the system browser — but ONLY safe schemes, so
  // renderer-injected URLs can't launch file:/custom-protocol handlers.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (SAFE_EXTERNAL_SCHEMES.has(new URL(url).protocol)) shell.openExternal(url)
    } catch { /* malformed URL — ignore */ }
    return { action: 'deny' }
  })

  // Block top-level navigation away from the bundled app origin (defense in
  // depth against a hijacked link navigating the window to a remote page).
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) event.preventDefault()
  })

  // Load the bundled SPA over the app:// protocol (see registerAppProtocol).
  // The frontend was built with VITE_API_BASE_URL baked in, so its API/WS
  // helpers resolve to the hosted backend.
  mainWindow.loadURL(`${APP_ORIGIN}/index.html`)

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Native desktop notification bridge (renderer -> main via preload) ─────────
ipcMain.handle('app:notify', (_evt, { title, body } = {}) => {
  if (Notification.isSupported()) {
    new Notification({ title: title || APP_TITLE, body: body || '' }).show()
  }
  return true
})

// ── Single-instance lock so deep links focus the existing window ──────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [path.resolve(process.argv[1])])
      }
    } else {
      app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)
    }

    registerAppProtocol()
    buildMenu()
    createWindow()

    // Check for updates in packaged builds only (no-op in dev / unsigned).
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().catch(() => { /* offline / no feed */ })
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
