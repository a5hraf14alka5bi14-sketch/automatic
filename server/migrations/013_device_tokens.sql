-- Migration 013: device_tokens
-- Stores per-device push notification tokens (FCM registration tokens for
-- Android/Web, APNs device tokens for iOS) so the backend can deliver
-- server-side push notifications (e.g. new kitchen orders) to native shells.

CREATE TABLE IF NOT EXISTS device_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL DEFAULT 'unknown',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookups when fanning out a notification to all active devices.
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
