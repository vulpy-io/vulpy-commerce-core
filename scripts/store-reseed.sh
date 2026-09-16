#!/usr/bin/env bash
# Recreate the local dev databases, then rebuild the minimal + demo store state.
# This is intentionally destructive; use only against the selected dev checkout.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required." >&2
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required." >&2
  exit 1
fi

# Prefer this checkout's Compose project. COMPOSE_PROJECT_NAME is normally set by
# the environment; when it is unavailable, the working_dir label is the checkout
# identity. In both cases require the postgres service label.
compose_project_name="${COMPOSE_PROJECT_NAME:-}"
if [ -n "${compose_project_name}" ]; then
  compose_postgres_candidates="$(docker ps \
    --filter "label=com.docker.compose.project=${compose_project_name}" \
    --filter 'label=com.docker.compose.service=postgres' \
    --filter 'ancestor=postgres:16-alpine' \
    --format '{{.ID}}' || true)"
else
  compose_postgres_candidates="$(docker ps \
    --filter "label=com.docker.compose.project.working_dir=${ROOT_DIR}" \
    --filter 'label=com.docker.compose.service=postgres' \
    --filter 'ancestor=postgres:16-alpine' \
    --format '{{.ID}}' || true)"
fi
mapfile -t compose_postgres_ids <<< "${compose_postgres_candidates}"
if [ "${#compose_postgres_ids[@]}" -eq 1 ] && [ -n "${compose_postgres_ids[0]}" ]; then
  POSTGRES_CONTAINER="${compose_postgres_ids[0]}"
else
  # A fallback is safe only when the host has exactly one matching PostgreSQL
  # container. Multiple candidates are an operator error, not a reason to guess.
  generic_postgres_candidates="$(docker ps --filter 'ancestor=postgres:16-alpine' --format '{{.ID}}\t{{.Names}}' || true)"
  mapfile -t generic_postgres_rows <<< "${generic_postgres_candidates}"
  if [ "${#generic_postgres_rows[@]}" -eq 1 ] && [ -n "${generic_postgres_rows[0]}" ]; then
    POSTGRES_CONTAINER="${generic_postgres_rows[0]%%$'\t'*}"
  else
    echo "Could not uniquely select this checkout's PostgreSQL container (working_dir=${ROOT_DIR}, service=postgres). Candidates:" >&2
    if [ "${#generic_postgres_rows[@]}" -eq 0 ] || [ -z "${generic_postgres_rows[0]}" ]; then
      echo "  (none; expected running postgres:16-alpine)" >&2
    else
      printf '  %s\n' "${generic_postgres_rows[@]}" >&2
    fi
    exit 1
  fi
fi
POSTGRES_NAME="$(docker inspect --format '{{.Name}}' "${POSTGRES_CONTAINER}" | sed 's#^/##')"
DB_IDENTITY="$(docker exec "${POSTGRES_CONTAINER}" psql -At -U medusa -d postgres -c "SELECT current_database() || '/' || current_user;" | tr -d '\n')"
printf 'Selected PostgreSQL container: %s (%s)\n' "${POSTGRES_NAME}" "${POSTGRES_CONTAINER}"
printf 'PostgreSQL DB identity: %s\n' "${DB_IDENTITY}"
if ! curl -fsS --connect-timeout 3 -X POST -o /dev/null "http://localhost:3000/api/dev/ready"; then
  echo "Storefront is not running at http://localhost:3000; start pnpm dev before reseeding." >&2
  exit 1
fi

echo "=== Step 1/8: Reset Medusa and Payload databases ==="
docker exec "${POSTGRES_CONTAINER}" psql -v ON_ERROR_STOP=1 -U medusa -d postgres <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname IN ('medusa', 'payload') AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS medusa;
DROP DATABASE IF EXISTS payload;
CREATE DATABASE medusa OWNER medusa;
CREATE DATABASE payload OWNER medusa;
SQL

echo "=== Step 2/8: Medusa migrations ==="
pnpm --filter @apps/medusa-backend exec medusa db:migrate

echo "=== Step 3/8: Seed minimal Medusa catalog ==="
pnpm --filter @apps/medusa-backend seed:minimal

echo "=== Step 4/8: Seed demo catalog ==="
pnpm --filter @apps/medusa-backend seed:demo

echo "=== Step 5/8: Sync categories to Payload ==="
pnpm --filter @apps/medusa-backend sync-categories-to-payload
echo "=== Step 6/8: Sync products to Payload ==="
pnpm --filter @apps/medusa-backend sync-products-to-payload

echo "=== Step 7/8: Seed editorial Payload content ==="
pnpm --filter @apps/storefront seed

echo "=== Step 8/8: Verify rebuilt store summary ==="
medusa_count="$(docker exec "${POSTGRES_CONTAINER}" psql -At -U medusa -d medusa -c "SELECT (SELECT count(*) FROM product), (SELECT count(*) FROM product_category);" | tr -d '[:space:]')"
payload_count="$(docker exec "${POSTGRES_CONTAINER}" psql -At -U medusa -d payload -c "SELECT (SELECT count(*) FROM pages), (SELECT count(*) FROM category_content), (SELECT count(*) FROM product_content);" | tr -d '[:space:]')"
if grep -Eq '^MEDUSA_PUBLISHABLE_KEY=[^[:space:]]+' apps/storefront/.env 2>/dev/null; then
  publishable_key="set"
else
  publishable_key="missing"
fi
printf 'Medusa products/categories: %s\n' "${medusa_count}"
printf 'Payload pages/categories/products: %s\n' "${payload_count}"
printf 'Publishable key: %s\n' "${publishable_key}"
echo "Store reseed complete."
