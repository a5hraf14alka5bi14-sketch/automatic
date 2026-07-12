#!/bin/bash
set -e

# Install dependencies (idempotent). The database schema is created/updated
# automatically on server startup via CREATE TABLE IF NOT EXISTS in server/db.js,
# so no separate migration step is required here.
npm install --no-audit --no-fund

# ── Release Log sync ────────────────────────────────────────────────────────
# When a new version ships (package.json version changed since the last synced
# version), push the newest CHANGELOG entry into the Notion "Release Log" so the
# release history stays current without anyone remembering to run
# `npm run release:sync-log`. The sync itself is idempotent (it skips versions
# already present in Notion) and guarded: if CHANGELOG.md's newest entry does not
# match package.json's version, it logs a warning and exits non-zero WITHOUT
# pushing, so a forgotten changelog entry is surfaced (and retried next merge)
# instead of silently syncing a stale version. This step is best-effort: any
# failure is logged but never blocks the merge pipeline.
sync_release_log() {
  local version_file=".local/.release-log-synced-version"
  local current_version
  current_version="$(node -p "require('./package.json').version" 2>/dev/null || echo "")"

  if [ -z "$current_version" ]; then
    echo "[post-merge] release-log: could not read package.json version; skipping."
    return 0
  fi

  local last_version=""
  [ -f "$version_file" ] && last_version="$(cat "$version_file" 2>/dev/null || echo "")"

  if [ "$current_version" = "$last_version" ]; then
    echo "[post-merge] release-log: v$current_version already synced; skipping."
    return 0
  fi

  echo "[post-merge] release-log: version is v$current_version; syncing latest CHANGELOG entry to Notion..."
  if npm run --silent release:sync-log -- --latest; then
    mkdir -p "$(dirname "$version_file")"
    echo "$current_version" > "$version_file"
    echo "[post-merge] release-log: sync complete."
  else
    echo "[post-merge] release-log: sync failed (non-blocking) — will retry on next merge."
  fi
}

# Never let a release-log sync failure abort the post-merge pipeline.
sync_release_log || true
