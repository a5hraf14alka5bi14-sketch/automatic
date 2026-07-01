import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { verifyToken } from './middleware/auth.js'
import authRoutes from './routes/auth.js'
import menuRoutes from './routes/menu.js'
import ordersRoutes from './routes/orders.js'
import inventoryRoutes from './routes/inventory.js'
import customersRoutes from './routes/customers.js'
import dashboardRoutes from './routes/dashboard.js'
import reportsRoutes from './routes/reports.js'
import notionRoutes from './routes/notion.js'
import integrationsRoutes from './routes/integrations.js'
import settingsRoutes from './routes/settings.js'
import usersRoutes from './routes/users.js'
import { initDb, pool } from './db.js'
import { registerAdapter, startAutoSync } from './integrations/sync-engine.js'
import { syncAll } from './integrations/notion.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3001
const IS_PROD = process.env.NODE_ENV === 'production'

app.use(cors({
  origin: true,
  credentials: true
}))
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
app.use('/api/auth', authRoutes)

app.use(verifyToken)

app.use('/api/menu', menuRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/customers', customersRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/notion', notionRoutes)
app.use('/api/integrations', integrationsRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/users', usersRoutes)

if (IS_PROD) {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(distPath, 'index.html'))
    }
  })
}

async function initSyncEngine() {
  try {
    registerAdapter('notion', syncAll)

    const r = await pool.query(
      "SELECT value FROM settings WHERE key IN ('notion_auto_sync_enabled','notion_auto_sync_interval')"
    )
    const cfg = {}
    for (const row of r.rows) cfg[row.key] = row.value

    if (cfg['notion_auto_sync_enabled'] === 'true') {
      const mins = parseInt(cfg['notion_auto_sync_interval']) || 15
      startAutoSync('notion', mins * 60 * 1000)
      console.log(`[sync-engine] Restored auto-sync for notion (${mins} min)`)
    }
  } catch (e) {
    console.warn('[sync-engine] Init skipped:', e.message)
  }
}

initDb().then(async () => {
  await initSyncEngine()
  app.listen(PORT, IS_PROD ? '0.0.0.0' : 'localhost', () => {
    console.log(`API server running on port ${PORT} (${IS_PROD ? 'production' : 'development'})`)
  })
}).catch(err => {
  console.error('Failed to initialize database:', err)
  process.exit(1)
})
