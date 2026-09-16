#!/usr/bin/env bash
# Compose wrapper for the host-level Hermes project (docker-compose.hermes.yml).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# shellcheck source=scripts/lib/install-helpers.sh
source "${ROOT_DIR}/scripts/lib/install-helpers.sh"

export VULPY_ENV=hermes
export VULPY_ENV_FILE="${ROOT_DIR}/environments/hermes/.env"

if [ ! -f "${VULPY_ENV_FILE}" ]; then
  if [ -f "${ROOT_DIR}/environments/hermes/.env.example" ]; then
    cp "${ROOT_DIR}/environments/hermes/.env.example" "${VULPY_ENV_FILE}"
    BASE="$(basename "${ROOT_DIR}")"
    vulpy_set_env_kv "${VULPY_ENV_FILE}" COMPOSE_PROJECT_NAME "${BASE}-hermes"
    echo "Created environments/hermes/.env from the example." >&2
  else
    echo "Missing environments/hermes/.env.example" >&2
    exit 1
  fi
fi

# Ensure the SearXNG secret exists before compose runs (idempotent — never
# regenerated when already set, value never echoed). The official image
# requires it; Fox's search sidecar is wired via SEARXNG_URL in the compose
# file and needs no API key.
if ! grep -qE '^SEARXNG_SECRET=.+' "${VULPY_ENV_FILE}" 2>/dev/null; then
  vulpy_set_env_kv "${VULPY_ENV_FILE}" SEARXNG_SECRET "$(vulpy_random_secret)"
  # mktemp-based write resets mode to 600; restore group rw (host file is
  # group-shared with the deploy group). Never leave a broken env file.
  chmod 660 "${VULPY_ENV_FILE}" 2>/dev/null || true
  echo "Generated SEARXNG_SECRET in environments/hermes/.env (value not shown)." >&2
fi

# shellcheck source=scripts/lib/project-env.sh
source "${ROOT_DIR}/scripts/lib/project-env.sh"

# SearXNG settings are generated locally from the shipped template. The
# generated file is deliberately ignored because it contains the per-install
# secret; creating it before Compose runs prevents Docker from turning the
# missing file mount into a directory.
SEARXNG_SETTINGS="${ROOT_DIR}/docker/searxng/settings.yml"
SEARXNG_TEMPLATE="${ROOT_DIR}/docker/searxng/settings.yml.template"
if [ ! -f "${SEARXNG_SETTINGS}" ]; then
  [ -f "${SEARXNG_TEMPLATE}" ] || {
    echo "Missing SearXNG settings template: ${SEARXNG_TEMPLATE}" >&2
    exit 1
  }
  tmp_settings="$(mktemp "${SEARXNG_SETTINGS}.tmp.XXXXXX")"
  sed "s/__SEARXNG_SECRET__/${SEARXNG_SECRET}/g" "${SEARXNG_TEMPLATE}" > "${tmp_settings}"
  chmod 600 "${tmp_settings}"
  mv "${tmp_settings}" "${SEARXNG_SETTINGS}"
  echo "Generated docker/searxng/settings.yml (value not shown)." >&2
fi

mkdir -p "${HERMES_DATA_DIR}"
# Mount-point dirs for named volume overlays (avoid Docker creating them as root).
mkdir -p \
  "${ROOT_DIR}/.data" \
  "${ROOT_DIR}/.turbo" \
  "${ROOT_DIR}/apps/storefront/.next" \
  "${ROOT_DIR}/apps/medusa-backend/.medusa" \
  "${ROOT_DIR}/environments/live" \
  "${ROOT_DIR}/environments/staging" \
  "${ROOT_DIR}/.tmp/dev" \
  "${ROOT_DIR}/agent-cmds/req" \
  "${ROOT_DIR}/agent-cmds/resp"
# agent-cmds/req/ is chowned to Fox by the entrypoint (Fox writes req files).
# agent-cmds/resp/ stays owned by the daemon user (daemon writes resp files).
# Both are created here before Fox starts so the bind-mount is always present.
chmod +x \
  "${ROOT_DIR}/scripts/hermes-fox-entrypoint.sh" \
  "${ROOT_DIR}/scripts/hermes-dev-server.sh" \
  "${ROOT_DIR}/scripts/hermes-tailscale-entrypoint.sh" \
  2>/dev/null || true
vulpy_ensure_agent_network

DOCKER=(docker)
if [ "${COMPOSE_SUDO:-0}" = "1" ]; then
  DOCKER=(sudo -E docker)
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "${ROOT_DIR}")-hermes}"

COMPOSE_FILES=(-f docker-compose.hermes.yml)
# VPS installs publish the in-container dev servers to the host loopback.
if [ "${HERMES_DEV_PORTS:-0}" = "1" ]; then
  COMPOSE_FILES+=(-f docker-compose.hermes-ports.yml)
fi
# Fox Tailscale sidecar (private MagicDNS + serve for agent/shop/API).
if [ "${HERMES_TAILSCALE:-0}" = "1" ]; then
  mkdir -p "${HERMES_DATA_DIR}/tailscale"
  COMPOSE_FILES+=(-f docker-compose.hermes-tailscale.yml)
fi

# Host-owned tenant limits override for Fox (service `hermes` only, from the
# tenant share's FOX split). The hermes-specific override never contains app
# services, so compose cannot merge phantom containers into this stack. Later
# -f files win — the tenant cannot raise the ceiling from their own files.
# shellcheck source=scripts/lib/tenant-limits.sh
source "${ROOT_DIR}/scripts/lib/tenant-limits.sh"
export VULPY_TENANT_LIMITS_OVERRIDE="${VULPY_TENANT_LIMITS_OVERRIDE:-$(vulpy_tl_hermes_compose_override_path 2>/dev/null || true)}"
TL_BASE_FILES=()
for _tl_f in "${COMPOSE_FILES[@]}"; do
  [ "${_tl_f}" = "-f" ] && continue
  TL_BASE_FILES+=("${_tl_f}")
done
TL_ARGS=()
read -ra TL_ARGS <<< "$(vulpy_tl_compose_args "${TL_BASE_FILES[@]}")" || true
COMPOSE_FILES+=("${TL_ARGS[@]}")

# Ensure the agent-command drop directory exists before Fox starts so the
# file-drop transport is available on first boot.
# req/ and resp/ are created above in the mkdir -p block.

exec "${DOCKER[@]}" compose \
  --project-name "${COMPOSE_PROJECT_NAME}" \
  --env-file "${VULPY_ENV_FILE}" \
  "${COMPOSE_FILES[@]}" \
  "$@"
