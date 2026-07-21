import http from 'node:http'
import express from 'express'
import cors from 'cors'
import { isAllowedOrigin, parseExtraOrigins } from './lib/cors-origins.js'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
// ── Core middleware (must be synchronous / lightweight) ───────────────────────
import { verifyToken, enforcePasswordChange } from './middleware/auth.js'
import { requestLogger } from './lib/observability.js'
import { auditMutations } from './lib/audit.js'
// ── DB / migration (pool object needed by health endpoint at module load) ──────
import { initDb, pool } from './db.js'
import { runMigrations } from './migrate.js'
// ── WebSocket + logger (small, needed at listen time) ─────────────────────────
import { initWebSocketServer } from './events.js'
import { logger } from './logger.js'
// NOTE: all route files and heavy services (Sentry, Notion, backup-scheduler,
// sync-engine) are loaded lazily via dynamic import() AFTER server.listen()
// fires — this cuts the "port-closed window" from ~2.5 s to ~200 ms.

// Lazy-loaded Sentry handle (populated after dynamic import in isEntryPoint).
let Sentry = null

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
// ALLOWED_ORIGIN only if a SEPARATE frontend origin must call this API
// (comma-separated for multiple origins).
// Native shells (Capacitor iOS/Android → https://localhost or
// capacitor://localhost, Electron → app://bundle) load the bundled frontend
// from their own origin and call this API cross-origin with a bearer token,
// so those fixed shell origins are always allowed.
// In development, reflect any origin so the Vite dev server (port 5000) works.
const EXTRA_ORIGINS = parseExtraOrigins(process.env.ALLOWED_ORIGIN)
app.use(cors({
  origin: IS_PROD
    ? (origin, done) => done(null, isAllowedOrigin(origin, EXTRA_ORIGINS))
    : true,
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
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Only FAILED logins count toward the limit — a correct password succeeds
  // immediately and never contributes to a lockout. This still throttles
  // brute-force guessing (20 wrong attempts / minute / IP).
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again in a minute.' },
  // The integration suite drives many logins from a single IP; the limiter
  // would otherwise 429 late tests. Only disabled under the Vitest runner
  // (which sets VITEST) — never in dev or prod.
  skip: () => !!process.env.VITEST,
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
// General limit for ALL /api traffic, then a stricter limit ONLY on the
// login endpoint. The strict limiter used to sit on the whole /api/auth
// prefix, so routine 401s from /api/auth/me on app load burned through the
// login budget and locked users out — scope it to POST /api/auth/login.
app.use('/api', generalLimiter)
app.use('/api/auth/login', authLimiter)
// auth, public, replitAuth and all other routes are registered lazily
// in loadAndRegisterRoutes() after server.listen() fires — see isEntryPoint block.

// ── Serve the built frontend (production) BEFORE auth ─────────────────────────
// The SPA and its static assets must load without a token; only /api/* is gated
// by verifyToken below. Placed here so the deployment healthcheck on `/` returns
// the app shell (200) instead of 401. The fallback skips /api/ and non-GET.
if (IS_PROD) {
  const distPath = path.join(__dirname, '../dist')

  // These are the authenticated SPA routes. Used to distinguish a private deep
  // link (redirect to /) from a genuinely unknown slug (404) for unauthenticated
  // crawlers/requests, preventing duplicate thin login-page indexing.
  const KNOWN_PRIVATE_ROUTES = new Set([
    '/dashboard', '/pos', '/orders', '/kitchen', '/inventory', '/recipes',
    '/customers', '/reports', '/settings', '/integrations', '/notion',
    '/ai-executive', '/system', '/suppliers', '/profile', '/change-password',
    '/expenses',
  ])

  app.use(express.static(distPath))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    // A request for a file that has an extension (e.g. a hashed .js/.css) that
    // wasn't matched by express.static above is a genuine 404 — don't answer it
    // with the HTML shell (that can poison the service-worker asset cache).
    if (/\.[a-z0-9]+$/i.test(req.path)) return res.status(404).end()

    // For unauthenticated requests, only serve the SPA shell at `/`.
    // Private deep links redirect to the login page; unknown slugs get a real
    // 404. This prevents crawlers from indexing every app route as a duplicate
    // thin login page, concentrating search visibility on the root URL.
    // Public SPA routes: served without a session cookie (e.g. customer QR menu)
    const KNOWN_PUBLIC_ROUTES = new Set(['/qr-menu'])
    const hasSession = Boolean(req.cookies?.access_token)
    if (!hasSession && req.path !== '/') {
      if (KNOWN_PRIVATE_ROUTES.has(req.path)) return res.redirect(302, '/')
      if (KNOWN_PUBLIC_ROUTES.has(req.path)) return res.sendFile(path.join(distPath, 'index.html'))
      return res.status(404).end()
    }

    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// ── Readiness gate ────────────────────────────────────────────────────────────
// Block /api/* calls (except the health probe) while DB init + migrations are
// still running. The port is open from the first second so GET / returns the
// built HTML immediately; only API data calls are held back until ready.
// dbReady is set to true (or !isEntryPoint for tests) after initDb +
// runMigrations + initSyncEngine all resolve — see the isEntryPoint block.
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next()
  if (!dbReady) return res.status(503).json({ error: 'Server is starting up — please retry in a moment.' })
  next()
})

// verifyToken, enforcePasswordChange, auditMutations and all route handlers are
// registered lazily inside loadAndRegisterRoutes() — see the top-level await below.
// They must come AFTER the pre-auth routes (/api/auth, /api/public) in Express's
// middleware chain, so they cannot be registered here at static-init time.

async function initSyncEngine() {
  try {
    const [{ registerAdapter, startAutoSync }, { syncAll }] = await Promise.all([
      import('./integrations/sync-engine.js'),
      import('./integrations/notion.js'),
    ])

    registerAdapter('notion', syncAll)

    const r = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('notion_auto_sync_enabled','notion_auto_sync_interval')"
    )
    const cfg = {}
    for (const row of r.rows) cfg[row.key] = row.value

    if (cfg['notion_auto_sync_enabled'] === 'true') {
      const mins = parseInt(cfg['notion_auto_sync_interval']) || 60
      startAutoSync('notion', mins * 60 * 1000)
      logger.info(`[sync-engine] Restored auto-sync for notion (${mins} min)`)
    }
  } catch (e) {
    logger.warn('[sync-engine] Init skipped', { err: e.message })
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

// Readiness gate — false until routes are registered AND (in entry-point mode)
// DB init + migrations complete. The middleware above returns 503 for /api/*
// while this is false. Set to true after full boot, or right after
// loadAndRegisterRoutes() in test mode (tests manage their own DB state).
let dbReady = false

// ── Lazy route loader ─────────────────────────────────────────────────────────
// Dynamically import all route files and register them onto the Express app.
// Called AFTER server.listen() fires so that the heavy module graph (auth/argon2,
// notion SDK, openai, reports, etc.) doesn't delay port binding.
async function loadAndRegisterRoutes () {
  const [
    { default: authRoutes },
    { setupReplitAuth },
    { default: publicRoutes },
    { default: menuRoutes },
    { default: ordersRoutes },
    { default: inventoryRoutes },
    { default: customersRoutes },
    { default: dashboardRoutes },
    { default: reportsRoutes },
    { default: notionRoutes },
    { default: integrationsRoutes },
    { default: settingsRoutes },
    { default: usersRoutes },
    { default: aiRoutes },
    { default: adminRoutes },
    { default: shiftsRoutes },
    { default: suppliersRoutes },
    { default: pushRoutes },
    { default: stationsRoutes },
    { default: branchesRoutes },
    { default: supportTicketsRoutes },
    { default: expensesRoutes },
    { default: reservationsRoutes },
    { default: receiptsRoutes },
  ] = await Promise.all([
    import('./routes/auth.js'),
    import('./routes/replitAuth.js'),
    import('./routes/public.js'),
    import('./routes/menu.js'),
    import('./routes/orders.js'),
    import('./routes/inventory.js'),
    import('./routes/customers.js'),
    import('./routes/dashboard.js'),
    import('./routes/reports.js'),
    import('./routes/notion.js'),
    import('./routes/integrations.js'),
    import('./routes/settings.js'),
    import('./routes/users.js'),
    import('./routes/ai.js'),
    import('./routes/admin.js'),
    import('./routes/shifts.js'),
    import('./routes/suppliers.js'),
    import('./routes/push.js'),
    import('./routes/stations.js'),
    import('./routes/branches.js'),
    import('./routes/supportTickets.js'),
    import('./routes/expenses.js'),
    import('./routes/reservations.js'),
    import('./routes/receipts.js'),
  ])

  // Pre-verifyToken routes (auth endpoints + public QR API) ─────────────────────
  // These must come BEFORE verifyToken so unauthenticated callers can log in.
  app.use('/api/auth', authRoutes)
  app.use('/api/public', publicRoutes)
  setupReplitAuth(app)

  // Auth + audit middleware ── registered HERE so they fire only for the routes
  // below (authenticated routes), not for /api/auth or /api/public above.
  app.use(verifyToken)
  app.use(enforcePasswordChange)
  app.use(auditMutations)

  // Authenticated routes ──────────────────────────────────────────────────────
  app.use('/api/menu',         menuRoutes)
  app.use('/api/orders',       ordersRoutes)
  app.use('/api/inventory',    inventoryRoutes)
  app.use('/api/customers',    customersRoutes)
  app.use('/api/dashboard',    dashboardRoutes)
  app.use('/api/reports',      reportsRoutes)
  app.use('/api/notion',       notionRoutes)
  app.use('/api/integrations', integrationsRoutes)
  app.use('/api/settings',     settingsRoutes)
  app.use('/api/users',        usersRoutes)
  app.use('/api/ai',           aiRoutes)
  app.use('/api/admin',        adminRoutes)
  app.use('/api/shifts',       shiftsRoutes)
  app.use('/api/suppliers',    suppliersRoutes)
  app.use('/api/push',         pushRoutes)
  app.use('/api/branches',     branchesRoutes)
  app.use('/api/stations',     stationsRoutes)
  app.use('/api/support',       supportTicketsRoutes)
  app.use('/api/expenses',      expensesRoutes)
  app.use('/api/reservations',  reservationsRoutes)
  app.use('/api/receipts',      receiptsRoutes)
}

// ── Step 1 (entry-point only): open the port BEFORE loading routes ────────────
// Port binding is nearly instantaneous once Node.js reaches this line (~100-200 ms
// instead of the old ~2.5 s static-graph load). GET / hits express.static and
// returns 200 immediately; /api/* calls are held at the readiness gate below.
if (isEntryPoint) {
  server.listen(PORT, IS_PROD ? '0.0.0.0' : 'localhost', () => {
    initWebSocketServer(server)
    logger.info(`API server listening on port ${PORT}`, { env: IS_PROD ? 'production' : 'development', status: 'starting' })
  })
}

// ── Step 2: load route files (top-level await) ────────────────────────────────
// In test mode: the import() of server/index.js blocks here until routes are
//   registered, so every test gets a fully-wired app without explicit setup.
// In entry-point mode: the event loop is already live (port is open above), so
//   this await runs concurrently with incoming HTTP requests — no outage.
await loadAndRegisterRoutes()

// ── Global error handler ── registered AFTER routes so it is Express's last ──
// Must be the final app.use() call; 4-arg signature is required by Express.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.path, '—', err?.stack || err?.message || err)
  if (Sentry && process.env.SENTRY_DSN) {
    Sentry.captureException(err, { extra: { method: req.method, path: req.path } })
  }
  if (res.headersSent) return
  res.status(err?.status || 500).json({ error: 'An unexpected error occurred. Please try again.' })
})

// ── Step 3: DB init + post-boot services ─────────────────────────────────────
if (isEntryPoint) {
  initDb()
    .then(() => runMigrations(pool))
    .then(async () => {
      // Sentry: large package deferred so it never delays port binding
      if (process.env.SENTRY_DSN) {
        const mod = await import('@sentry/node')
        Sentry = mod
        Sentry.init({
          dsn: process.env.SENTRY_DSN,
          tracesSampleRate: 0.1,
          environment: process.env.NODE_ENV || 'development',
        })
        logger.info('[sentry] initialized')
      }
      const { startBackupScheduler } = await import('./lib/backup-scheduler.js')
      startBackupScheduler()
      await initSyncEngine()
      dbReady = true
      logger.info(`API server ready`, { env: IS_PROD ? 'production' : 'development' })
    })
    .catch(err => {
      logger.error('Failed to initialize server', { msg: err.message })
      process.exit(1)
    })
} else {
  // Test mode: routes registered above; DB is managed by the test suite itself.
  dbReady = true
}

export { app, server, initSyncEngine }
