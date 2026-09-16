#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/lib/project-env.sh
source "${ROOT_DIR}/scripts/lib/project-env.sh"

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  echo ""
  echo "Stopping database..."
  "${ROOT_DIR}/scripts/compose.sh" down --remove-orphans
  exit "$code"
}

trap cleanup EXIT INT TERM

echo "Starting database (project: ${PROJECT_NAME})..."
"${ROOT_DIR}/scripts/compose.sh" up -d --remove-orphans postgres redis

echo "Waiting for PostgreSQL..."
until "${ROOT_DIR}/scripts/compose.sh" exec -T postgres pg_isready -U medusa -d medusa >/dev/null 2>&1; do
  sleep 1
done

echo "Ensuring Payload database exists..."
bash scripts/init-payload-db.sh

echo "Starting dev servers..."
# Workspace plugins are linked via pnpm; do not run medusa plugin:develop (needs yalc).
turbo run dev
