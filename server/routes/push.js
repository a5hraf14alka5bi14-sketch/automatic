// Device-token registration for server-side push notifications.
// All routes require a valid session (verifyToken is applied globally in
// index.js before this router is mounted).
import express from 'express'
import { registerDeviceToken, removeDeviceToken } from '../integrations/push.js'
import { logger } from '../logger.js'

const router = express.Router()

// Register / refresh this device's push token for the current user.
// Body: { token: string, platform?: 'ios'|'android'|'web' }
router.post('/register', async (req, res, next) => {
  try {
    const { token, platform } = req.body || {}
    if (!token || typeof token !== 'string' || token.length > 4096) {
      return res.status(400).json({ error: 'token is required' })
    }
    const plat = typeof platform === 'string' && ['ios', 'android', 'web'].includes(platform) ? platform : 'unknown'
    await registerDeviceToken(req.user.id, token, plat)
    res.json({ success: true })
  } catch (err) {
    logger.error('Device token register failed', { path: req.path })
    next(err)
  }
})

// Unregister a device token (logout / disable). Idempotent.
// Body: { token: string }
router.delete('/register', async (req, res, next) => {
  try {
    const { token } = req.body || {}
    if (!token || typeof token !== 'string' || token.length > 4096) {
      return res.status(400).json({ error: 'token is required' })
    }
    // Scope to the current user so nobody can unregister someone else's device.
    await removeDeviceToken(token, req.user.id)
    res.json({ success: true })
  } catch (err) {
    logger.error('Device token unregister failed', { path: req.path })
    next(err)
  }
})

export default router
