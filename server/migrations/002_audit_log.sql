-- Audit log: records every successful mutating API request (who did what).
CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER,
  user_email TEXT,
  method     TEXT NOT NULL,
  path       TEXT NOT NULL,
  status     INTEGER,
  ip         TEXT,
  details    JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user       ON audit_log (user_id);
