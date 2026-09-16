#!/usr/bin/env bash
set -euo pipefail

cd /app/apps/medusa-backend

if [ ! -f public/admin/index.html ] && [ -f .medusa/server/public/admin/index.html ]; then
  echo "Installing admin build into public/admin..."
  mkdir -p public
  rm -rf public/admin
  cp -a .medusa/server/public/admin public/admin
fi

echo "Waiting for PostgreSQL..."
until pg_isready -h "${POSTGRES_HOST:-postgres}" -U "${POSTGRES_USER:-medusa}" -d medusa >/dev/null 2>&1; do
  sleep 1
done

echo "Running Medusa migrations..."
npx medusa db:migrate

if [ "${SEED_ON_START:-0}" = "1" ]; then
  echo "Seeding Medusa..."
  npx medusa exec ./src/scripts/seed.ts
fi

# Idempotent admin from install credentials (ADMIN_EMAIL / ADMIN_PASSWORD).
if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  echo "Ensuring Medusa admin ${ADMIN_EMAIL}..."
  npx medusa exec ./src/scripts/ensure-admin.ts
fi

if [ "${SYNC_PUBLISHABLE_KEY:-0}" = "1" ] && [ -n "${DEPLOY_ENV_FILE:-}" ]; then
  echo "Syncing publishable key to ${DEPLOY_ENV_FILE}..."
  DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE}" npx medusa exec ./src/scripts/print-publishable-key.ts write-env
fi

echo "Starting Medusa..."
if [ "${WARM_SHOP_CATALOG_CACHE:-1}" = "1" ]; then
  (
    sleep "${WARM_SHOP_CATALOG_DELAY_SEC:-45}"
    echo "Warming shop catalog cache..."
    npx medusa exec ./src/scripts/warm-shop-catalog-cache.ts || true
  ) &
fi

exec npx medusa start
