#!/usr/bin/env bash
# Ensure the host user can reset Postgres bind-mount data (often root-owned after Docker).
# Source after scripts/lib/project-env.sh

_ensure_postgres_data_permissions() {
  local dir="${POSTGRES_DATA_DIR}"
  local parent
  parent="$(dirname "${dir}")"

  mkdir -p "${parent}" 2>/dev/null || true

  if [ -e "${dir}" ] && [ -w "${dir}" ] && [ -O "${dir}" ]; then
    return 0
  fi

  if [ ! -e "${dir}" ] && [ -w "${parent}" ]; then
    mkdir -p "${dir}"
    return 0
  fi

  local target="${dir}"
  if [ -e "${dir}" ]; then
    target="${dir}"
  elif [ ! -w "${parent}" ]; then
    target="${parent}"
  else
    mkdir -p "${dir}"
    return 0
  fi

  echo ""
  echo "Postgres data directory is not writable by ${USER}:"
  echo "  ${target}"
  echo ""
  echo "Docker often leaves this owned by root. Reset requires:"
  echo "  sudo chown -R ${USER}:${USER} ${target}"
  echo ""

  if [ ! -t 0 ]; then
    echo "Not a TTY — cannot prompt for sudo. Run the chown command above, then retry." >&2
    exit 1
  fi

  read -r -p "Run sudo chown now? [y/N] " answer
  case "${answer}" in
    y|Y|yes|YES)
      sudo chown -R "${USER}:${USER}" "${target}"
      ;;
    *)
      echo "Aborted. Fix permissions manually and retry." >&2
      exit 1
      ;;
  esac

  if [ -e "${dir}" ] && [ ! -w "${dir}" ]; then
    echo "Still cannot write to ${dir}" >&2
    exit 1
  fi

  mkdir -p "${dir}"
}
