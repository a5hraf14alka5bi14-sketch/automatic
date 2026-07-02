#!/usr/bin/env bash
# On-demand full database backup. Writes a timestamped SQL dump to backups/.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

mkdir -p backups
ts="$(date +%Y%m%d-%H%M%S)"
out="backups/backup-${ts}.sql"

pg_dump --no-owner --no-privileges "$DATABASE_URL" > "$out"
echo "Backup written to $out"
