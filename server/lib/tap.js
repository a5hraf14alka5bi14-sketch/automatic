/**
 * Tap Payments — Charges API v2 client
 *
 * Sandbox (test) credentials:
 *   TAP_SECRET_KEY = sk_test_…   (set in Replit Secrets)
 *   TAP_PUBLIC_KEY = pk_test_…   (set in Replit Secrets)
 *
 * IMPORTANT — before accepting real payments in production, replace the
 * sk_test_/pk_test_ keys with sk_live_/pk_live_ keys from the Tap merchant
 * dashboard (https://businesses.tap.company) and update the Replit Secrets.
 *
 * API docs: https://developers.tap.company/docs
 *
 * Amount: plain OMR decimal (e.g. 1.500). Tap does NOT use subunits for OMR.
 *
 * source.id = "src_all": Tap's hosted page automatically shows Visa,
 * Mastercard, and Apple Pay — no extra Apple developer setup required.
 */

import { createHmac } from 'crypto'
import { logger } from '../logger.js'

const BASE_URL = 'https://api.tap.company/v2'

function secretKey() {
  const k = process.env.TAP_SECRET_KEY
  if (!k) throw new Error('TAP_SECRET_KEY is not configured')
  return k
}

export function tapPublicKey() {
  return process.env.TAP_PUBLIC_KEY || ''
}

// ── Webhook signature verification ────────────────────────────────────────────
/**
 * Verify Tap's webhook hashstring.
 *
 * Tap computes the hashstring as HMAC-SHA256(secretKey, concatenated_fields)
 * where concatenated_fields = sorted top-level keys (excluding hashstring)
 * joined as "key=value" with no separator, using the string representations
 * of the values.
 *
 * @param {object} payload  — parsed webhook body from Tap
 * @returns {boolean}       — true if signature is valid
 */
export function verifyWebhookSignature(payload) {
  const received = payload?.hashstring
  if (!received) return false          // legitimate Tap webhooks always include hashstring

  try {
    const key = secretKey()

    // Build the message: sorted keys (excluding hashstring itself), value as string
    const message = Object.keys(payload)
      .filter(k => k !== 'hashstring')
      .sort()
      .map(k => {
        const v = payload[k]
        // Only scalar values are included; nested objects are skipped (Tap behaviour)
        if (v === null || v === undefined) return `${k}=`
        if (typeof v === 'object') return null   // skip nested
        return `${k}=${v}`
      })
      .filter(Boolean)
      .join('')

    const computed = createHmac('sha256', key).update(message).digest('hex')
    return computed === received
  } catch {
    return false
  }
}

// ── In-memory charge-status cache (5 s TTL) ───────────────────────────────────
// Prevents rapid polls from the payment-confirmation page from each making
// a separate outbound API call to Tap during the ~30-40 s polling window.
// Only non-terminal (pending) statuses are cached briefly; terminal states
// (paid / failed) are cached for longer since they won't change.
const _chargeCache = new Map()
const PENDING_TTL_MS  = 5_000   //  5 s — re-check soon
const TERMINAL_TTL_MS = 30_000  // 30 s — final state, safe to cache longer

function _cacheGet(chargeId) {
  const entry = _chargeCache.get(chargeId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { _chargeCache.delete(chargeId); return null }
  return entry.value
}

function _cacheSet(chargeId, value) {
  const ttl = value.status === 'pending' ? PENDING_TTL_MS : TERMINAL_TTL_MS
  _chargeCache.set(chargeId, { value, expiresAt: Date.now() + ttl })
}

// Prune stale entries every minute so the Map doesn't grow indefinitely
if (!process.env.VITEST) {
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of _chargeCache) { if (now > v.expiresAt) _chargeCache.delete(k) }
  }, 60_000).unref()
}

/**
 * Create a Tap charge and return the hosted payment URL.
 *
 * @param {object} opts
 * @param {number}  opts.orderId     — internal order ID (used as reference)
 * @param {number}  opts.amountOmr   — total in OMR, plain decimal (e.g. 5.250)
 * @param {string}  opts.description — shown on Tap's checkout page
 * @param {string}  opts.successUrl  — Tap redirects customer here after payment attempt
 * @param {string}  opts.webhookUrl  — Tap POSTs async status updates here
 * @returns {{ chargeId: string, paymentUrl: string }}
 */
export async function createCharge({ orderId, amountOmr, description, successUrl, webhookUrl }) {
  const amount = parseFloat(parseFloat(amountOmr).toFixed(3))

  const body = {
    amount,
    currency:           'OMR',
    customer_initiated: true,
    threeDSecure:       true,
    save_card:          false,
    description:        (description || `Order #${orderId}`).substring(0, 100),
    metadata:           { order_id: String(orderId) },
    reference: {
      transaction: `order_${orderId}`,
      order:       `order_${orderId}`,
    },
    receipt:  { email: false, sms: false },
    customer: {
      first_name: 'Guest',
      email:      'guest@restaurant.local',
    },
    // src_all → Tap hosted page shows card (Visa/Mastercard) + Apple Pay automatically
    source:   { id: 'src_all' },
    post:     { url: webhookUrl },
    redirect: { url: successUrl },
  }

  logger.info('[tap] creating charge', { orderId, amount })

  const res = await fetch(`${BASE_URL}/charges`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    logger.error('[tap] charge creation failed', { status: res.status, body: json })
    throw new Error(json?.errors?.[0]?.description || json?.message || `Tap error ${res.status}`)
  }

  const chargeId   = json.id
  const paymentUrl = json.transaction?.url

  if (!chargeId || !paymentUrl) {
    logger.error('[tap] unexpected response shape', { keys: Object.keys(json) })
    throw new Error('Tap returned an unexpected response shape — check TAP_SECRET_KEY')
  }

  logger.info('[tap] charge created', { orderId, chargeId })
  return { chargeId, paymentUrl }
}

/**
 * Fetch the authoritative status of an existing charge.
 *
 * Results are cached for 5 s (pending) or 30 s (terminal) to prevent rapid
 * polling from hammering Tap's API during the payment-confirmation window.
 *
 * Always re-query Tap rather than trusting the webhook payload alone —
 * this is the safest verification approach for payment webhooks.
 *
 * Tap charge statuses: INITIATED | ABANDONED | CANCELLED | FAILED |
 * DECLINED | RESTRICTED | CAPTURED | VOID | TIMEDOUT | EXPIRED | UNKNOWN
 *
 * @param {string} chargeId
 * @returns {{ status: 'paid'|'failed'|'pending', rawStatus: string }}
 */
export async function getChargeStatus(chargeId) {
  const cached = _cacheGet(chargeId)
  if (cached) {
    logger.info('[tap] charge status (cached)', { chargeId, rawStatus: cached.rawStatus, status: cached.status })
    return cached
  }

  const res = await fetch(`${BASE_URL}/charges/${chargeId}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    logger.error('[tap] charge lookup failed', { chargeId, status: res.status })
    throw new Error(`Tap charge lookup failed: ${res.status}`)
  }

  const rawStatus = json.status || 'UNKNOWN'

  let status = 'pending'
  if (rawStatus === 'CAPTURED') {
    status = 'paid'
  } else if (['DECLINED', 'CANCELLED', 'FAILED', 'VOID', 'TIMEDOUT', 'EXPIRED', 'ABANDONED', 'RESTRICTED'].includes(rawStatus)) {
    status = 'failed'
  }

  const result = { status, rawStatus }
  _cacheSet(chargeId, result)

  logger.info('[tap] charge status', { chargeId, rawStatus, status })
  return result
}
