#!/usr/bin/env bash
# Shared project and environment paths for Docker Compose and scripts.
# Source from other scripts: source "$(dirname "$0")/lib/project-env.sh"
set -euo pipefail

_project_env_root() {
  if [ -n "${ROOT_DIR:-}" ]; then
    printf '%s\n' "${ROOT_DIR}"
    return
  fi
  local dir
  dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  while [ "${dir}" != "/" ]; do
    if [ -f "${dir}/docker-compose.yml" ]; then
      printf '%s\n' "${dir}"
      return
    fi
    dir="$(dirname "${dir}")"
  done
  echo "Could not find repo root (docker-compose.yml)" >&2
  exit 1
}

ROOT_DIR="$(_project_env_root)"
export ROOT_DIR

# Keep existing installations working: root .env is loaded first, then the
# selected environment file overrides it. New installations should use
# environments/<name>/.env.
if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

VULPY_ENV="${VULPY_ENV:-dev}"
export VULPY_ENV

if [ -n "${VULPY_ENV_FILE:-}" ]; then
  ENV_FILE="${VULPY_ENV_FILE}"
elif [ "${VULPY_ENV}" = "live" ] && [ -f "${ROOT_DIR}/deploy/.env" ] && [ ! -f "${ROOT_DIR}/environments/live/.env" ]; then
  # Legacy production compatibility.
  ENV_FILE="${ROOT_DIR}/deploy/.env"
else
  ENV_FILE="${ROOT_DIR}/environments/${VULPY_ENV}/.env"
fi

if [[ "${ENV_FILE}" != /* ]]; then
  ENV_FILE="${ROOT_DIR}/${ENV_FILE}"
fi
export VULPY_ENV_FILE="${ENV_FILE}"

if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

BASE_PROJECT_NAME="${VULPY_PROJECT_NAME:-$(basename "${ROOT_DIR}")}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-${BASE_PROJECT_NAME}-${VULPY_ENV}}"
export COMPOSE_PROJECT_NAME="${PROJECT_NAME}"
export PROJECT_NAME

if [[ "${DATA_DIR:-.data/${VULPY_ENV}}" = /* ]]; then
  export DATA_DIR="${DATA_DIR}"
else
  export DATA_DIR="${ROOT_DIR}/${DATA_DIR:-.data/${VULPY_ENV}}"
fi

_is_non_posix_fs() {
  local path="$1"
  if ! command -v findmnt >/dev/null 2>&1; then
    return 1
  fi
  findmnt -T "${path}" -no FSTYPE 2>/dev/null | grep -qE 'fuseblk|ntfs|exfat|vfat'
}

if [ -n "${POSTGRES_DATA_DIR:-}" ]; then
  export POSTGRES_DATA_DIR
elif _is_non_posix_fs "${ROOT_DIR}"; then
  export POSTGRES_DATA_DIR="${HOME}/.local/share/${PROJECT_NAME}/postgres"
else
  export POSTGRES_DATA_DIR="${DATA_DIR}/postgres"
fi

if [ -n "${REDIS_DATA_DIR:-}" ]; then
  export REDIS_DATA_DIR
elif _is_non_posix_fs "${ROOT_DIR}"; then
  # Redis RDB snapshots fail on NTFS/exFAT (MISCONF stop-writes-on-bgsave-error).
  export REDIS_DATA_DIR="${HOME}/.local/share/${PROJECT_NAME}/redis"
else
  export REDIS_DATA_DIR="${DATA_DIR}/redis"
fi

if [ -n "${HERMES_DATA_DIR:-}" ]; then
  export HERMES_DATA_DIR
elif [ "${VULPY_ENV}" = "hermes" ]; then
  # Host-level agent: Fox /data is the hermes environment data dir (not nested …/hermes/hermes).
  if _is_non_posix_fs "${ROOT_DIR}"; then
    export HERMES_DATA_DIR="${HOME}/.local/share/${PROJECT_NAME}"
  else
    export HERMES_DATA_DIR="${DATA_DIR}"
  fi
elif _is_non_posix_fs "${ROOT_DIR}"; then
  # Hermes (Qdrant/mem0) needs a POSIX filesystem on NTFS hosts.
  export HERMES_DATA_DIR="${HOME}/.local/share/${PROJECT_NAME}/hermes"
else
  export HERMES_DATA_DIR="${DATA_DIR}/hermes"
fi

if [ -n "${MATOMO_DB_DATA_DIR:-}" ]; then
  export MATOMO_DB_DATA_DIR
elif _is_non_posix_fs "${ROOT_DIR}"; then
  # MariaDB needs POSIX (same constraint as Postgres/Redis on NTFS hosts).
  export MATOMO_DB_DATA_DIR="${HOME}/.local/share/${PROJECT_NAME}/matomo-db"
else
  export MATOMO_DB_DATA_DIR="${DATA_DIR}/matomo-db"
fi

if [ -n "${MATOMO_DATA_DIR:-}" ]; then
  export MATOMO_DATA_DIR
elif _is_non_posix_fs "${ROOT_DIR}"; then
  # Matomo (www-data) needs writable tmp/config on a POSIX filesystem.
  export MATOMO_DATA_DIR="${HOME}/.local/share/${PROJECT_NAME}/matomo"
else
  export MATOMO_DATA_DIR="${DATA_DIR}/matomo"
fi

mkdir -p \
  "${POSTGRES_DATA_DIR}" \
  "${REDIS_DATA_DIR}" \
  "${HERMES_DATA_DIR}" \
  "${MATOMO_DB_DATA_DIR}" \
  "${MATOMO_DATA_DIR}" \
  "${DATA_DIR}/medusa-static" \
  "${DATA_DIR}/payload-media" \
  "${DATA_DIR}/storefront-cache" \
  "${DATA_DIR}/caddy" \
  "${DATA_DIR}/caddy-config"
