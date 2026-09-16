#!/usr/bin/env bash
# Optional local Matomo (Compose profile) — same idea as Hermes.
# Not started by pnpm dev / db:up.
#
# Usage:
#   pnpm db:matomo:up      # start + bootstrap + write storefront .env
#   pnpm db:matomo:down    # stop Matomo services
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# shellcheck source=scripts/lib/project-env.sh
source "${ROOT_DIR}/scripts/lib/project-env.sh"

COMPOSE="${ROOT_DIR}/scripts/compose.sh"
ACTION="${1:-up}"
HOST_PORT="${MATOMO_HOST_PORT:-8081}"
SHOP_URL="${MATOMO_SHOP_URL:-http://localhost:3000}"
MATOMO_URL="http://localhost:${HOST_PORT}"
ADMIN_USER="${MATOMO_ADMIN_USER:-admin}"
ADMIN_PASS="${MATOMO_ADMIN_PASSWORD:-supersecret}"
ADMIN_EMAIL="${MATOMO_ADMIN_EMAIL:-admin@example.com}"
DB_PASS="${MATOMO_DB_PASSWORD:-matomo}"

case "${ACTION}" in
  down|stop)
    echo "Stopping Matomo profile services..."
    "${COMPOSE}" --profile matomo stop matomo-archive matomo matomo-db || true
    echo "Matomo stopped. Storefront NEXT_PUBLIC_MATOMO_* left as-is (clear them to disable tracker)."
    exit 0
    ;;
  up|start) ;;
  *)
    echo "Usage: $0 [up|down]" >&2
    exit 1
    ;;
esac

export MATOMO_HOST_PORT="${HOST_PORT}"
export MATOMO_DB_PASSWORD="${DB_PASS}"
export MATOMO_DB_ROOT_PASSWORD="${MATOMO_DB_ROOT_PASSWORD:-matomo-root}"

echo "Starting Matomo (profile=matomo, UI ${MATOMO_URL})..."
echo "Matomo files: ${MATOMO_DATA_DIR}"
echo "MariaDB data: ${MATOMO_DB_DATA_DIR}"
"${COMPOSE}" --profile matomo up -d matomo-db matomo matomo-archive

echo "Waiting for Matomo..."
for _ in $(seq 1 60); do
  if "${COMPOSE}" --profile matomo exec -T matomo php -r "exit(@fsockopen('127.0.0.1', 80) ? 0 : 1);" 2>/dev/null; then
    break
  fi
  sleep 2
done

# Image bumps leave stale files in the bind-mounted volume (entrypoint only seeds once).
COMPOSE="${COMPOSE}" COMPOSE_ARGS="--profile matomo" \
  bash "${ROOT_DIR}/scripts/deploy/matomo/sync-app-files.sh"

"${COMPOSE}" --profile matomo cp \
  "${ROOT_DIR}/scripts/deploy/matomo/bootstrap.php" \
  matomo:/tmp/vulpy-matomo-bootstrap.php

echo "Bootstrapping Matomo (idempotent)..."
# Run as www-data so config/tmp stay writable by Apache (exec defaults to root).
set +e
BOOTSTRAP_JSON="$(
  "${COMPOSE}" --profile matomo exec -T -u www-data \
    -e "MATOMO_DB_HOST=matomo-db" \
    -e "MATOMO_DB_USER=matomo" \
    -e "MATOMO_DB_PASSWORD=${DB_PASS}" \
    -e "MATOMO_DB_NAME=matomo" \
    -e "MATOMO_DB_TABLES_PREFIX=matomo_" \
    -e "MATOMO_DOMAIN=localhost:${HOST_PORT}" \
    -e "SHOP_URL=${SHOP_URL}" \
    -e "SITE_NAME=${COMPOSE_PROJECT_NAME:-Shop}" \
    -e "MATOMO_ADMIN_USER=${ADMIN_USER}" \
    -e "MATOMO_ADMIN_PASSWORD=${ADMIN_PASS}" \
    -e "MATOMO_ADMIN_EMAIL=${ADMIN_EMAIL}" \
    -e "MATOMO_RAW_VISIT_RETENTION_MONTHS=13" \
    -e "MATOMO_ASSUME_SECURE=0" \
    matomo php -d display_errors=1 -d log_errors=1 /tmp/vulpy-matomo-bootstrap.php 2>&1
)"
BOOTSTRAP_RC=$?
set -e
if [ "${BOOTSTRAP_RC}" -ne 0 ]; then
  echo "${BOOTSTRAP_JSON}" >&2
  echo "Matomo bootstrap failed (exit ${BOOTSTRAP_RC})" >&2
  exit "${BOOTSTRAP_RC}"
fi

echo "${BOOTSTRAP_JSON}"
SITE_ID="$(printf '%s' "${BOOTSTRAP_JSON}" | sed -n 's/.*"siteId":\([0-9][0-9]*\).*/\1/p')"
if [ -z "${SITE_ID}" ]; then
  echo "Failed to parse siteId from bootstrap output" >&2
  exit 1
fi

STORE_ENV="${ROOT_DIR}/apps/storefront/.env"
# shellcheck source=scripts/deploy/lib/env-file.sh
source "${ROOT_DIR}/scripts/deploy/lib/env-file.sh"
if [ -f "${STORE_ENV}" ]; then
  env_file_set "${STORE_ENV}" NEXT_PUBLIC_MATOMO_URL "${MATOMO_URL}"
  env_file_set "${STORE_ENV}" NEXT_PUBLIC_MATOMO_SITE_ID "${SITE_ID}"
  echo "Wrote NEXT_PUBLIC_MATOMO_URL / NEXT_PUBLIC_MATOMO_SITE_ID to apps/storefront/.env"
else
  echo "No apps/storefront/.env — add:"
  echo "  NEXT_PUBLIC_MATOMO_URL=${MATOMO_URL}"
  echo "  NEXT_PUBLIC_MATOMO_SITE_ID=${SITE_ID}"
fi

cat <<EOF

Matomo is ready.
  UI:       ${MATOMO_URL}  (login ${ADMIN_USER} / ${ADMIN_PASS})
  Tracker:  ${MATOMO_URL}  site id ${SITE_ID}

Restart the storefront so Next picks up env (stop/start pnpm dev), then:
  1. Open ${SHOP_URL}
  2. Accept cookies
  3. DevTools → Network: matomo.js / matomo.php
  4. Matomo → Visitors (may need a minute + archive)

Stop later: pnpm db:matomo:down
EOF
