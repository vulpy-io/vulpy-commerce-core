#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# shellcheck source=scripts/lib/project-env.sh
source "${ROOT_DIR}/scripts/lib/project-env.sh"
# shellcheck source=scripts/lib/ensure-postgres-permissions.sh
source "${ROOT_DIR}/scripts/lib/ensure-postgres-permissions.sh"

_ensure_postgres_data_permissions

echo "=== Pre-wipe backup ==="
bash "${ROOT_DIR}/scripts/db-backup.sh" --label pre-reset || {
  echo "WARNING: backup failed — refusing to wipe. Fix Postgres or delete manually." >&2
  exit 1
}

"${ROOT_DIR}/scripts/compose.sh" down
rm -rf "${POSTGRES_DATA_DIR}"
mkdir -p "${POSTGRES_DATA_DIR}"
"${ROOT_DIR}/scripts/compose.sh" up -d postgres redis

echo "Waiting for PostgreSQL..."
until "${ROOT_DIR}/scripts/compose.sh" exec -T postgres pg_isready -U medusa -d medusa >/dev/null 2>&1; do
  sleep 1
done

bash "${ROOT_DIR}/scripts/init-payload-db.sh"
echo "Database reset complete."
