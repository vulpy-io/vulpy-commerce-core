#!/usr/bin/env bash
# Bootstrap a new shop from this template: env files, deps, DB, migrate, seed, admin, publishable key.
#
# Usage:
#   pnpm bootstrap              # same as ./scripts/init-project.sh
#   ./scripts/init-project.sh   # full bootstrap
#   ./scripts/init-project.sh --env-only  # only copy .env files
set -euo pipefail

# Ensure all generated files (env copies, lock files, etc.) are group-writable
# so both the host user and the Fox container agent (foxinthebox) can edit them
# without permission errors. Fixes: https://github.com/vulpy-io/vulpy-commerce-pro-private/issues/1
umask 002

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ENV_ONLY=0
for arg in "$@"; do
  case "${arg}" in
    --env-only) ENV_ONLY=1 ;;
    -h|--help)
      echo "Usage: $0 [--env-only]"
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

if [ ! -f "${ROOT_DIR}/.env" ]; then
  cp "${ROOT_DIR}/.env.example" "${ROOT_DIR}/.env"
  # Keep the generated root env aligned with the selected environment. The
  # first project-env load defaults dev to .data/dev, but a plain .env.example
  # says .data; without this pin bootstrap and the subsequent `pnpm dev` can
  # start against different Postgres/Redis bind mounts.
  sed -i "s|^DATA_DIR=.*|DATA_DIR=.data/${VULPY_ENV}|" "${ROOT_DIR}/.env"
  echo "Created .env"
fi

if [ ! -f "${ROOT_DIR}/apps/medusa-backend/.env" ]; then
  cp "${ROOT_DIR}/apps/medusa-backend/.env.template" "${ROOT_DIR}/apps/medusa-backend/.env"
  echo "Created apps/medusa-backend/.env"
fi

if [ ! -f "${ROOT_DIR}/apps/storefront/.env" ]; then
  cp "${ROOT_DIR}/apps/storefront/.env.example" "${ROOT_DIR}/apps/storefront/.env"
  echo "Created apps/storefront/.env"
fi

if ! grep -q '^COMPOSE_PROJECT_NAME=.' "${ROOT_DIR}/.env" 2>/dev/null; then
  if grep -q '^COMPOSE_PROJECT_NAME=' "${ROOT_DIR}/.env"; then
    sed -i "s/^COMPOSE_PROJECT_NAME=.*/COMPOSE_PROJECT_NAME=${PROJECT_NAME}/" "${ROOT_DIR}/.env"
  fi
fi

echo ""
echo "Project: ${PROJECT_NAME}"
echo "Data directory: ${DATA_DIR}"
echo "Postgres data: ${POSTGRES_DATA_DIR}"

if [ "${ENV_ONLY}" = "1" ]; then
  echo ""
  echo "Env files ready. Run without --env-only to bootstrap the database."
  exit 0
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install it first: https://pnpm.io/installation" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for database bootstrap." >&2
  exit 1
fi

echo ""
echo "Installing dependencies..."
pnpm install

echo ""
echo "Starting PostgreSQL and Redis..."
"${ROOT_DIR}/scripts/compose.sh" up -d postgres redis

echo "Waiting for PostgreSQL..."
until "${ROOT_DIR}/scripts/compose.sh" exec -T postgres pg_isready -U medusa -d medusa >/dev/null 2>&1; do
  sleep 1
done

echo "Ensuring Payload database exists..."
bash "${ROOT_DIR}/scripts/init-payload-db.sh"

echo "Running Medusa migrations..."
pnpm --filter @apps/medusa-backend exec medusa db:migrate

echo "Seeding Medusa (idempotent)..."
pnpm --filter @apps/medusa-backend seed

echo "Creating Medusa admin user (ADMIN_EMAIL / ADMIN_PASSWORD, defaults admin@example.com)..."
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}" \
ADMIN_PASSWORD="${ADMIN_PASSWORD:-supersecret}" \
  pnpm --filter @apps/medusa-backend ensure-admin

echo "Writing publishable API key to apps/storefront/.env..."
pnpm --filter @apps/medusa-backend print-publishable-key

echo ""
echo "Bootstrap complete."
echo ""
echo "Next steps:"
echo "  pnpm dev"
echo "  # In another terminal while dev is running:"
echo "  pnpm --filter @apps/storefront seed   # Payload CMS content"
echo ""
echo "Medusa admin: http://localhost:9000/app (admin@example.com / supersecret)"
echo "Production: see TEMPLATE.md and deploy/README.md"
