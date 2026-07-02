#!/bin/bash
set -e

# Install dependencies (idempotent). The database schema is created/updated
# automatically on server startup via CREATE TABLE IF NOT EXISTS in server/db.js,
# so no separate migration step is required here.
npm install --no-audit --no-fund
