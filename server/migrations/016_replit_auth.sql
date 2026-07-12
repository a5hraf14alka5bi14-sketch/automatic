-- Replit Auth (web-only additional sign-in option)
-- sessions: express-session store used ONLY during the OIDC handshake
CREATE TABLE IF NOT EXISTS sessions (
  sid    VARCHAR PRIMARY KEY,
  sess   JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

-- Stable link between a staff account and a Replit identity (OIDC sub claim).
ALTER TABLE users ADD COLUMN IF NOT EXISTS replit_sub VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_replit_sub ON users (replit_sub) WHERE replit_sub IS NOT NULL;
