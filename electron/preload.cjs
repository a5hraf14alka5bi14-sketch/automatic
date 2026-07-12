// Preload runs in an isolated context with access to Node + the DOM bridge.
// It exposes a minimal, safe surface to the renderer (the web app) so the
// frontend can trigger native desktop notifications without nodeIntegration.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  notify: (title, body) => ipcRenderer.invoke('app:notify', { title, body }),
})
