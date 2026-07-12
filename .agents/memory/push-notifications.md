---
name: Server-side push notifications
description: How FCM/APNs push is wired, why it's env-gated, and the delivery boundary
---

# Server-side push (FCM HTTP v1)

Device tokens live in `device_tokens` (migration 013), keyed by user. Native
shells register via `src/native/push.js` (dynamic-imports `@capacitor/push-notifications`,
requests permission, POSTs token to `POST /api/push/register`). The server fans
a push out to `kitchen`-role staff on every new order, and to front-of-house
roles (staff/cashier/manager/admin) when an order transitions to `ready`
(guarded on prevStatus so re-saving 'ready' doesn't re-alert). `role` option
accepts a string or array of roles.

**Fully env-gated on `FCM_SERVICE_ACCOUNT`** (a Firebase service-account JSON).
When unset, `sendPushNotification` is a logged no-op — safe everywhere including
Replit (Linux), which can't reach a real device. OAuth token is minted from the
service-account private key with the existing `jsonwebtoken` dep (no native SDK).

**Why fire-and-forget** (`sendPushNotification(...).catch(()=>{})` after COMMIT):
a push failure must never fail order creation.

**Security gotcha:** `DELETE /api/push/register` must scope the delete to
`req.user.id` (`WHERE token=$1 AND user_id=$2`) — otherwise any authed user who
learns another user's device token can unregister it (cross-user notification
DoS). Internal pruning of FCM-reported dead tokens deletes unconditionally (no
userId) because the token is genuinely dead regardless of owner.

**APNs (iOS):** configured through Firebase using the same code path (upload the
APNs key to Firebase); no separate APNs client needed.
