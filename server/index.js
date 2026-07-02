import http from 'node:http'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
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
import { initWebSocketServer } from './events.js'
import { logger } from './logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const server = http.createServer(app)
const PORT = 3001
const IS_PROD = process.env.NODE_ENV === 'production'

// ── Trust Replit's reverse proxy so rate-limiter sees real client IPs ─────────
app.set('trust proxy', 1)

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],  // Tailwind CSS requires inline styles
      imgSrc:      ["'self'", 'data:', 'https:'],  // allow external menu images
      connectSrc:  ["'self'", 'wss:', 'ws:'],      // allow WebSocket connections
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
      formAction:  ["'self'"],
      ...(IS_PROD ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  crossOriginEmbedderPolicy: false,
}))

// ── CORS — restrict to ALLOWED_ORIGIN in production ───────────────────────────
if (IS_PROD && !process.env.ALLOWED_ORIGIN) {
  console.error('FATAL: ALLOWED_ORIGIN must be set in production (credentialed CORS cannot reflect arbitrary origins).')
  process.exit(1)
}
app.use(cors({
  origin: IS_PROD ? process.env.ALLOWED_ORIGIN : true,
  credentials: true,
}))

// ── Request body size limit (DoS prevention) ──────────────────────────────────
app.use(express.json({ limit: '1mb' }))

// ── Parse cookies (httpOnly auth tokens) ──────────────────────────────────────
app.use(cookieParser())

// ── Rate limiting: max 10 login attempts per minute per IP ────────────────────
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a minute.' },
})

// ── General API rate limiting: 300 requests per minute per IP ────────────────
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

app.get('/api/health', async (req, res) => {
  try {
    const dbStart = Date.now()
    await pool.query('SELECT 1')
    const dbLatencyMs = Date.now() - dbStart
    res.json({
      status:        'ok',
      db:            'ok',
      dbLatencyMs,
      uptimeSeconds: Math.floor(process.uptime()),
      version:       process.env.npm_package_version || '1.0.0',
      env:           process.env.NODE_ENV || 'development',
      ts:            Date.now(),
    })
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'error', ts: Date.now() })
  }
})
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api', generalLimiter)

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

// ── Global error handler — hide internal details from clients ─────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.path, '—', err?.stack || err?.message || err)
  if (res.headersSent) return
  res.status(err?.status || 500).json({ error: 'An unexpected error occurred. Please try again.' })
})

async function initSyncEngine() {
  try {
    registerAdapter('notion', syncAll)

    const r = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('notion_auto_sync_enabled','notion_auto_sync_interval')"
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

// ── Global unhandled error handlers ──────────────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException — exiting', { msg: err.message, stack: err.stack })
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { reason: String(reason) })
})

initDb().then(async () => {
  await initSyncEngine()
  server.listen(PORT, IS_PROD ? '0.0.0.0' : 'localhost', () => {
    initWebSocketServer(server)
    logger.info(`API server running on port ${PORT}`, { env: IS_PROD ? 'production' : 'development' })
  })
}).catch(err => {
  logger.error('Failed to initialize database', { msg: err.message })
  process.exit(1)
})
