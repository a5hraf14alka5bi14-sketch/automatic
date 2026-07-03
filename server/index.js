import http from 'node:http'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import { verifyToken, enforcePasswordChange } from './middleware/auth.js'
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
import aiRoutes from './routes/ai.js'
import adminRoutes from './routes/admin.js'
import shiftsRoutes from './routes/shifts.js'
import { startBackupScheduler } from './lib/backup-scheduler.js'
import { requestLogger } from './lib/observability.js'
import { auditMutations } from './lib/audit.js'
import { initDb, pool } from './db.js'
import { runMigrations } from './migrate.js'
import { registerAdapter, startAutoSync } from './integrations/sync-engine.js'
import { syncAll } from './integrations/notion.js'
import { initWebSocketServer } from './events.js'
import { logger } from './logger.js'
import * as Sentry from '@sentry/node'

// Optional Sentry error monitoring — activate by setting SENTRY_DSN env var
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV || 'development',
  })
  logger.info('[sentry] initialized')
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const server = http.createServer(app)
// Treat a Replit deployment as production even when NODE_ENV isn't set — Replit
// deployments do NOT auto-set NODE_ENV, but they DO set REPLIT_DEPLOYMENT. Without
// this, the deployed app runs in dev mode and never serves the built frontend, so
// the healthcheck on `/` 401s and the site is unusable.
const IS_PROD = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1'
// In production the whole app (API + built frontend + WebSocket) is served from a
// single port. Replit's deployment forwards external port 80 → localPort 5000, so
// we must listen on 5000 there. In development the API stays on 3001 and Vite
// serves the client on 5000 (proxying /api and /ws to 3001).
const PORT = process.env.PORT || (IS_PROD ? 5000 : 3001)

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

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production the built frontend is served from the SAME origin as the API, so
// no cross-origin access is needed — we disable CORS reflection (origin:false) by
// default, which is safe (same-origin requests never trigger CORS). Set
// ALLOWED_ORIGIN only if a SEPARATE frontend origin must call this API.
// In development, reflect any origin so the Vite dev server (port 5000) works.
app.use(cors({
  origin: IS_PROD ? (process.env.ALLOWED_ORIGIN || false) : true,
  credentials: true,
}))

// ── Request body size limit (DoS prevention) ──────────────────────────────────
app.use(express.json({ limit: '1mb' }))

// ── Parse cookies (httpOnly auth tokens) ──────────────────────────────────────
app.use(cookieParser())

// ── Observability: request id + timing + metrics counters ─────────────────────
app.use(requestLogger)

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

// ── Serve the built frontend (production) BEFORE auth ─────────────────────────
// The SPA and its static assets must load without a token; only /api/* is gated
// by verifyToken below. Placed here so the deployment healthcheck on `/` returns
// the app shell (200) instead of 401. The fallback skips /api/ and non-GET.
if (IS_PROD) {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    // A request for a file that has an extension (e.g. a hashed .js/.css) that
    // wasn't matched by express.static above is a genuine 404 — don't answer it
    // with the HTML shell (that can poison the service-worker asset cache).
    if (/\.[a-z0-9]+$/i.test(req.path)) return res.status(404).end()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.use(verifyToken)
app.use(enforcePasswordChange)

// ── Audit trail for authenticated mutations ───────────────────────────────────
app.use(auditMutations)

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
app.use('/api/ai', aiRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/shifts', shiftsRoutes)

// ── Global error handler — hide internal details from clients ─────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.path, '—', err?.stack || err?.message || err)
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, { extra: { method: req.method, path: req.path } })
  }
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

// Only bootstrap the DB + HTTP listener when this module is the entry point.
// Integration tests import `app` directly and manage their own lifecycle.
const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isEntryPoint) {
  initDb()
    .then(() => runMigrations(pool))
    .then(async () => {
      await initSyncEngine()
      server.listen(PORT, IS_PROD ? '0.0.0.0' : 'localhost', () => {
        initWebSocketServer(server)
        startBackupScheduler()
        logger.info(`API server running on port ${PORT}`, { env: IS_PROD ? 'production' : 'development' })
      })
    }).catch(err => {
      logger.error('Failed to initialize database', { msg: err.message })
      process.exit(1)
    })
}

export { app, server }
