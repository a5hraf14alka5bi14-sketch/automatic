// Native push-notification registration (Capacitor iOS/Android only).
//
// On the web this is a no-op — browser push would use a different (VAPID/service
// worker) flow and isn't part of this feature. On a native shell we ask the OS
// for permission, register with FCM/APNs, and POST the resulting device token to
// our backend (`/api/push/register`) so the server can deliver order alerts.
//
// The Capacitor plugin is loaded via dynamic import so the standard web bundle
// never has to resolve the native-only module at runtime.
import { isNativePlatform } from '../config.js'
import { apiFetch } from '../utils/api.js'

let _initialized = false

export async function initNativePush() {
  if (_initialized || !isNativePlatform()) return
  _initialized = true
  try {
    const mod = await import('@capacitor/push-notifications')
    const PushNotifications = mod.PushNotifications

    // Ask for permission (iOS shows a prompt; Android <13 is granted implicitly).
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return

    // When the token arrives, send it to the backend for this logged-in user.
    PushNotifications.addListener('registration', async (tokenData) => {
      try {
        const platform = window?.Capacitor?.getPlatform?.() || 'unknown'
        await apiFetch('/api/push/register', {
          method: 'POST',
          body: JSON.stringify({ token: tokenData.value, platform }),
        })
      } catch { /* registration will retry on next app launch */ }
    })

    PushNotifications.addListener('registrationError', () => {
      /* surfaced by the OS; nothing actionable client-side */
    })

    await PushNotifications.register()
  } catch {
    // Plugin unavailable or registration failed — non-fatal.
  }
}
