#!/usr/bin/env bash
# Wipe local databases, re-migrate, seed Medusa + Payload, and sync Medusa catalog to Payload.
#
# Usage:
#   pnpm db:reseed
#   ./scripts/db-reseed.sh --skip-payload-sync   # skip Medusa→Payload sync
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

SKIP_PAYLOAD_SYNC=0
for arg in "$@"; do
  case "${arg}" in
    --skip-payload-sync) SKIP_PAYLOAD_SYNC=1 ;;
    -h|--help)
      echo "Usage: $0 [--skip-payload-sync]"
      exit 0
      ;;
    *)
      echo "Unknown option: ${arg}" >&2
      exit 1
      ;;
  esac
done

# shellcheck source=scripts/lib/project-env.sh
source "${ROOT_DIR}/scripts/lib/project-env.sh"
# shellcheck source=scripts/lib/ensure-postgres-permissions.sh
source "${ROOT_DIR}/scripts/lib/ensure-postgres-permissions.sh"
# shellcheck source=scripts/lib/read-env-var.sh
source "${ROOT_DIR}/scripts/lib/read-env-var.sh"
# shellcheck source=scripts/lib/stop-port.sh
source "${ROOT_DIR}/scripts/lib/stop-port.sh"

MEDUSA_ENV_FILE="${ROOT_DIR}/apps/medusa-backend/.env"
PAYLOAD_SYNC_API_KEY="$(
  read_env_var "${MEDUSA_ENV_FILE}" "PAYLOAD_SYNC_API_KEY" 2>/dev/null || true
)"
export PAYLOAD_SYNC_API_KEY

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required." >&2
  exit 1
fi

wait_for_http() {
  local url="$1"
  local label="$2"
  local max_seconds="${3:-180}"
  local elapsed=0

  echo "Waiting for ${label} (${url})..."
  while [ "${elapsed}" -lt "${max_seconds}" ]; do
    if curl -s -o /dev/null --connect-timeout 2 "${url}"; then
      echo "${label} is up."
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  echo "Timed out waiting for ${label}." >&2
  return 1
}

cleanup_storefront() {
  if [ -n "${STOREFRONT_PID:-}" ] && kill -0 "${STOREFRONT_PID}" 2>/dev/null; then
    echo "Stopping temporary storefront (pid ${STOREFRONT_PID})..."
    kill "${STOREFRONT_PID}" 2>/dev/null || true
    wait "${STOREFRONT_PID}" 2>/dev/null || true
  fi
  stop_process_on_port 3000 || true
}

ensure_storefront_dev_started() {
  local log_file="$1"
  local pid="$2"

  sleep 3
  if kill -0 "${pid}" 2>/dev/null; then
    return 0
  fi

  echo "Storefront dev failed to start." >&2
  if [ -f "${log_file}" ]; then
    tail -40 "${log_file}" >&2 || true
  fi
  return 1
}

echo "=== Step 1/7: Postgres data permissions ==="
_ensure_postgres_data_permissions

echo ""
echo "=== Step 2/7: Reset PostgreSQL (+ Redis up) ==="
bash "${ROOT_DIR}/scripts/db-reset.sh"

echo ""
echo "=== Step 2b/7: Pre-migrate backup ==="
bash "${ROOT_DIR}/scripts/db-backup.sh" --label pre-migrate || {
  echo "WARNING: backup failed — refusing to migrate. Fix Postgres or run manually." >&2
  exit 1
}

echo ""
echo "=== Step 3/7: Medusa migrations ==="
pnpm --filter @apps/medusa-backend exec medusa db:migrate

echo ""
echo "=== Step 4/7: Medusa seed ==="
pnpm --filter @apps/medusa-backend seed

echo ""
echo "=== Step 5/7: Medusa admin + publishable key ==="
if ! pnpm --filter @apps/medusa-backend add-user 2>/dev/null; then
  echo "Admin user already exists — skipping."
fi
pnpm --filter @apps/medusa-backend print-publishable-key

echo ""
echo "=== Step 6/7: Payload CMS seed + Medusa→Payload sync (temporary storefront) ==="
trap cleanup_storefront EXIT INT TERM
stop_process_on_port 3000
wait_for_port_free 3000 30
pnpm --filter @apps/storefront dev >/tmp/storefront-reseed.log 2>&1 &
STOREFRONT_PID=$!
ensure_storefront_dev_started /tmp/storefront-reseed.log "${STOREFRONT_PID}"
wait_for_http "http://localhost:3000" "Storefront" 180

pnpm --filter @apps/storefront seed

PAYLOAD_SYNC_API_KEY="$(
  read_env_var "${MEDUSA_ENV_FILE}" "PAYLOAD_SYNC_API_KEY" 2>/dev/null || true
)"
export PAYLOAD_SYNC_API_KEY

if [ "${SKIP_PAYLOAD_SYNC}" = "1" ]; then
  echo ""
  echo "Skipping Medusa→Payload sync (--skip-payload-sync)."
elif [ -z "${PAYLOAD_SYNC_API_KEY:-}" ]; then
  echo ""
  echo "PAYLOAD_SYNC_API_KEY is missing after Payload seed — skipping Medusa→Payload sync."
else
  pnpm --filter @apps/medusa-backend sync-categories-to-payload
  pnpm --filter @apps/medusa-backend sync-products-to-payload
fi

cleanup_storefront
trap - EXIT INT TERM

echo ""
echo "Reseed complete."
echo ""
echo "  pnpm dev"
echo "  Medusa admin: http://localhost:9000/app (admin@example.com / supersecret)"
echo "  Payload admin: http://localhost:3000/admin (admin@example.com / supersecret)"
