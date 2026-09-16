#!/usr/bin/env bash
set -euo pipefail

cd /app

echo "Waiting for PostgreSQL..."
until pg_isready -h "${POSTGRES_HOST:-postgres}" -U "${POSTGRES_USER:-medusa}" -d payload >/dev/null 2>&1; do
  sleep 1
done

echo "Running Payload migrations..."
cd /app/apps/storefront
if [ "${SKIP_PAYLOAD_MIGRATE:-0}" != "1" ]; then
  # Clears batch=-1 "dev push" marker so migrate never prompts / silently no-ops.
  # Minimal config (payload.migrate.config.ts) avoids Lexical top-level await in the CLI.
  node ./scripts/run-payload-migrate.mjs
else
  echo "WARNING: SKIP_PAYLOAD_MIGRATE=1 — Payload schema may drift (restore-only)."
fi

# Prod-safe admin upsert (does not rely on the dev-only /api/dev/seed route).
if [ -n "${PAYLOAD_SEED_EMAIL:-${ADMIN_EMAIL:-}}" ] && [ -n "${PAYLOAD_SEED_PASSWORD:-${ADMIN_PASSWORD:-}}" ]; then
  echo "Ensuring Payload admin ${PAYLOAD_SEED_EMAIL:-${ADMIN_EMAIL}}..."
  ADMIN_EMAIL="${PAYLOAD_SEED_EMAIL:-${ADMIN_EMAIL}}" \
  ADMIN_PASSWORD="${PAYLOAD_SEED_PASSWORD:-${ADMIN_PASSWORD}}" \
  PAYLOAD_SEED_EMAIL="${PAYLOAD_SEED_EMAIL:-${ADMIN_EMAIL}}" \
  PAYLOAD_SEED_PASSWORD="${PAYLOAD_SEED_PASSWORD:-${ADMIN_PASSWORD}}" \
    pnpm exec tsx src/scripts/ensure-admin.ts
fi

echo "Starting storefront..."
cd /app
HOSTNAME=0.0.0.0 PORT=3000 exec node apps/storefront/server.js
