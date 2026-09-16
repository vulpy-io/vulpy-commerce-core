#!/usr/bin/env bash
# Dump medusa + payload databases to .data/dev/backups/<timestamp>/.
#
# Usage:
#   pnpm db:backup                  # interactive
#   bash scripts/db-backup.sh       # same
#   bash scripts/db-backup.sh --label pre-migrate   # custom label in dir name
#   bash scripts/db-backup.sh --quiet               # no progress output
#   source-only mode: sets BACKUP_DIR (used by db-reset.sh / db-reseed.sh)
#
# Retention: keeps the 10 most recent backups; prunes older ones automatically.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# ── Resolve DATA_DIR without sourcing project-env.sh ─────────────────────────
# project-env.sh runs mkdir -p on all data dirs unconditionally; inside the Fox
# container those paths are shadowed by named volumes (not writable by uid 999).
# We only need DATA_DIR here, so read the env file directly.
_read_env_var() {
  local file="$1" key="$2"
  grep -E "^${key}=" "${file}" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'"
}

VULPY_ENV="${VULPY_ENV:-dev}"
ENV_FILE="${ROOT_DIR}/environments/${VULPY_ENV}/.env"
[ -f "${ENV_FILE}" ] || ENV_FILE="${ROOT_DIR}/.env"

_raw_data_dir="$(_read_env_var "${ENV_FILE}" DATA_DIR)"
if [ -z "${_raw_data_dir}" ]; then
  _raw_data_dir=".data/${VULPY_ENV}"
fi
if [[ "${_raw_data_dir}" = /* ]]; then
  DATA_DIR="${_raw_data_dir}"
else
  DATA_DIR="${ROOT_DIR}/${_raw_data_dir}"
fi

# Backups always go to <ROOT_DIR>/.backups — works from both host and the Fox
# container (the workspace bind-mount is writable by uid 999 at that path).
# .backups/ is gitignored.
_IN_CONTAINER=0
if [ -f /.dockerenv ]; then
  _IN_CONTAINER=1
fi
BACKUPS_ROOT="${ROOT_DIR}/.backups"

LABEL=""
QUIET=0
for arg in "$@"; do
  case "${arg}" in
    --label=*) LABEL="${arg#--label=}" ;;
    --label)   shift; LABEL="${1:-}" ;;
    --quiet)   QUIET=1 ;;
    -h|--help)
      echo "Usage: $0 [--label <name>] [--quiet]"
      exit 0
      ;;
  esac
done

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DIR_NAME="${TIMESTAMP}"
if [ -n "${LABEL}" ]; then
  # sanitise label: keep alphanumeric, dash, underscore
  LABEL_SAFE="$(echo "${LABEL}" | tr -cs 'a-zA-Z0-9_-' '-' | sed 's/-$//')"
  DIR_NAME="${TIMESTAMP}-${LABEL_SAFE}"
fi

BACKUP_DIR="${BACKUPS_ROOT}/${DIR_NAME}"
mkdir -p "${BACKUP_DIR}"

log() { [ "${QUIET}" = "1" ] || echo "$*"; }

log "=== DB backup: ${BACKUP_DIR} ==="

# ── Resolve connection ────────────────────────────────────────────────────────
# In container: use host.docker.internal; on host: use localhost
if [ "${_IN_CONTAINER}" = "1" ]; then
  PG_HOST="host.docker.internal"
else
  PG_HOST="127.0.0.1"
fi

PG_PORT="${POSTGRES_PORT:-5432}"
PG_USER="${POSTGRES_USER:-medusa}"
export PGPASSWORD="${POSTGRES_PASSWORD:-medusa}"

# ── Wait for Postgres to be ready ────────────────────────────────────────────
log "Checking Postgres connectivity..."
TIMEOUT=20
ELAPSED=0
until pg_isready -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" >/dev/null 2>&1; do
  if [ "${ELAPSED}" -ge "${TIMEOUT}" ]; then
    echo "ERROR: Postgres not ready at ${PG_HOST}:${PG_PORT} after ${TIMEOUT}s — aborting backup." >&2
    exit 1
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

# ── Dump both databases ───────────────────────────────────────────────────────
dump_db() {
  local db="$1"
  local out="${BACKUP_DIR}/${db}.dump"
  log "  Dumping '${db}' → ${out} ..."
  pg_dump \
    -h "${PG_HOST}" \
    -p "${PG_PORT}" \
    -U "${PG_USER}" \
    -Fc \
    --no-password \
    "${db}" \
    > "${out}"
  local sz
  sz="$(du -sh "${out}" | cut -f1)"
  log "  '${db}' done — ${sz}"
}

dump_db medusa
dump_db payload

# ── Write manifest ────────────────────────────────────────────────────────────
cat > "${BACKUP_DIR}/manifest.txt" <<EOF
timestamp: ${TIMESTAMP}
label: ${LABEL:-<none>}
host: ${PG_HOST}
medusa: ${BACKUP_DIR}/medusa.dump
payload: ${BACKUP_DIR}/payload.dump
EOF

log ""
log "Backup complete: ${BACKUP_DIR}"
log "  medusa.dump  $(du -sh "${BACKUP_DIR}/medusa.dump" | cut -f1)"
log "  payload.dump $(du -sh "${BACKUP_DIR}/payload.dump" | cut -f1)"

# ── Retention: keep 10 most recent, prune the rest ───────────────────────────
KEEP=10
if [ -d "${BACKUPS_ROOT}" ]; then
  mapfile -t ALL_BACKUPS < <(find "${BACKUPS_ROOT}" -mindepth 1 -maxdepth 1 -type d | sort)
  TOTAL="${#ALL_BACKUPS[@]}"
  if [ "${TOTAL}" -gt "${KEEP}" ]; then
    PRUNE_COUNT=$((TOTAL - KEEP))
    log "Pruning ${PRUNE_COUNT} old backup(s) (keeping ${KEEP})..."
    for OLD in "${ALL_BACKUPS[@]:0:${PRUNE_COUNT}}"; do
      log "  rm ${OLD}"
      rm -rf "${OLD}"
    done
  fi
fi

# Export for callers that source this script
export BACKUP_DIR
