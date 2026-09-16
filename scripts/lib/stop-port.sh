#!/usr/bin/env bash
# Find PIDs listening on a TCP port (best-effort across lsof / fuser / ss).

pids_on_port() {
  local port="$1"
  local found=""

  if command -v lsof >/dev/null 2>&1; then
    found="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
    if [ -z "${found}" ]; then
      found="$(lsof -ti :"${port}" 2>/dev/null || true)"
    fi
  fi

  if [ -z "${found}" ] && command -v fuser >/dev/null 2>&1; then
    found="$(
      fuser "${port}"/tcp 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+$' || true
    )"
  fi

  if [ -z "${found}" ] && command -v ss >/dev/null 2>&1; then
    found="$(
      ss -tlnp 2>/dev/null |
        grep -E ":${port}[[:space:]]" |
        sed -n 's/.*pid=\([0-9]*\).*/\1/p' || true
    )"
  fi

  if [ -n "${found}" ]; then
    echo "${found}" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//'
  fi
}

# Stop processes bound to a TCP port. Exits 1 if the port stays in use.
stop_process_on_port() {
  local port="$1"
  local attempt=0
  local pids=""

  while [ "${attempt}" -lt 6 ]; do
    pids="$(pids_on_port "${port}")"
    if [ -z "${pids}" ]; then
      return 0
    fi

    if [ "${attempt}" -eq 0 ]; then
      echo "Stopping existing process(es) on port ${port}: ${pids}"
    fi

    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 2

    pids="$(pids_on_port "${port}")"
    if [ -z "${pids}" ]; then
      return 0
    fi

    # shellcheck disable=SC2086
    kill -9 ${pids} 2>/dev/null || true
    sleep 1
    attempt=$((attempt + 1))
  done

  pids="$(pids_on_port "${port}")"
  if [ -n "${pids}" ]; then
    echo "Could not free port ${port} (still in use by: ${pids})." >&2
    echo "Stop the dev server manually (pnpm dev) and run db:reseed again." >&2
    return 1
  fi
}

wait_for_port_free() {
  local port="$1"
  local max_seconds="${2:-30}"
  local elapsed=0
  local pids=""

  while [ "${elapsed}" -lt "${max_seconds}" ]; do
    pids="$(pids_on_port "${port}")"
    if [ -z "${pids}" ]; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "Port ${port} is still in use after ${max_seconds}s." >&2
  return 1
}
