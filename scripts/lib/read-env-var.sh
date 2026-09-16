#!/usr/bin/env bash
# Read a single KEY=value from a dotenv file without sourcing (avoids glob/cron expansion).

read_env_var() {
  local file="$1"
  local key="$2"

  if [ ! -f "${file}" ]; then
    return 1
  fi

  local line
  line="$(
    grep -E "^[[:space:]]*${key}=" "${file}" 2>/dev/null | tail -1 || true
  )"

  if [ -z "${line}" ]; then
    return 1
  fi

  local value="${line#*=}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  if [ "${value#\"}" != "${value}" ] && [ "${value%\"}" != "${value}" ]; then
    value="${value#\"}"
    value="${value%\"}"
  elif [ "${value#\'}" != "${value}" ] && [ "${value%\'}" != "${value}" ]; then
    value="${value#\'}"
    value="${value%\'}"
  fi

  printf '%s' "${value}"
}
