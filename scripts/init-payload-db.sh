#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/lib/project-env.sh
source "${ROOT_DIR}/scripts/lib/project-env.sh"

compose_psql() {
  "${ROOT_DIR}/scripts/compose.sh" exec -T postgres psql -U medusa -d postgres "$@"
}

wait_postgres_accepting_queries() {
  # pg_isready can return ready while the postmaster still rejects queries
  # ("the database system is starting up"). Wait for a real SELECT.
  local attempt=0
  local max_attempts="${VULPY_PG_WAIT_ATTEMPTS:-60}"
  until compose_psql -tAc "SELECT 1" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "${attempt}" -ge "${max_attempts}" ]; then
      echo "PostgreSQL did not become ready for queries in time." >&2
      return 1
    fi
    sleep 1
  done
}

if ! "${ROOT_DIR}/scripts/compose.sh" ps postgres --status running -q 2>/dev/null | grep -q .; then
  echo "Starting PostgreSQL..."
  "${ROOT_DIR}/scripts/compose.sh" up -d postgres
fi

wait_postgres_accepting_queries

EXISTS="$(compose_psql -tAc "SELECT 1 FROM pg_database WHERE datname='payload'" 2>/dev/null | tr -d '[:space:]' || true)"

if [ "${EXISTS}" = "1" ]; then
  echo "Database 'payload' already exists."
  exit 0
fi

echo "Creating database 'payload'..."
attempt=0
max_create_attempts="${VULPY_PG_CREATE_ATTEMPTS:-30}"
while true; do
  create_rc=0
  create_out="$(compose_psql -c "CREATE DATABASE payload;" 2>&1)" || create_rc=$?
  if [ "${create_rc}" -eq 0 ]; then
    echo "Database 'payload' created."
    exit 0
  fi
  if printf '%s' "${create_out}" | grep -qiE 'already exists'; then
    echo "Database 'payload' already exists."
    exit 0
  fi
  if printf '%s' "${create_out}" | grep -qiE 'starting up|not yet accepting'; then
    attempt=$((attempt + 1))
    if [ "${attempt}" -ge "${max_create_attempts}" ]; then
      printf '%s\n' "${create_out}" >&2
      exit "${create_rc}"
    fi
    sleep 1
    continue
  fi
  printf '%s\n' "${create_out}" >&2
  exit "${create_rc}"
done
