#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

OUTPUT="${1:-${ROOT_DIR}/.agent/generated-context.md}"
if [[ "${OUTPUT}" != /* ]]; then
  OUTPUT="${ROOT_DIR}/${OUTPUT}"
fi
mkdir -p "$(dirname "${OUTPUT}")"

read_value() {
  local file="$1"
  local key="$2"
  [ -f "${file}" ] || return 0
  grep -E "^${key}=" "${file}" | tail -1 | cut -d= -f2-
}

public_value() {
  local file="$1"
  shift
  local key value
  for key in "$@"; do
    value="$(read_value "${file}" "${key}")"
    if [ -n "${value}" ]; then
      printf '%s' "${value}"
      return
    fi
  done
}

tailscale_line() {
  # The Fox Tailscale sidecar runs in a sibling container — the local
  # `tailscale` CLI cannot reach its daemon's socket, so it always reports
  # "installed, not connected" even when the sidecar is up. Use the
  # authoritative bridge instead (see .hermes.md "Access model"):
  #   - inside the Fox container: agent-cmd ts.status (host bridge daemon)
  #   - on the host: scripts/vulpy-fox-tailscale-status.sh (read-only probe)
  local line=""
  if [ -f /.dockerenv ] && [ -f "${ROOT_DIR}/scripts/vulpy-agent-cmd.py" ]; then
    line="$(timeout 10 python3 "${ROOT_DIR}/scripts/vulpy-agent-cmd.py" ts.status --timeout 6 2>/dev/null || true)"
  elif [ -f "${ROOT_DIR}/scripts/vulpy-fox-tailscale-status.sh" ]; then
    line="$(bash "${ROOT_DIR}/scripts/vulpy-fox-tailscale-status.sh" 2>/dev/null || true)"
  fi
  [ -n "${line}" ] || line="unknown (tailscale bridge unavailable)"
  echo "${line}"
}

# Extract the Tailscale MagicDNS name ("up <dns>") from the bridge status, if up.
tailscale_dns() {
  local line
  line="$(tailscale_line)"
  case "${line}" in
    up\ *) printf '%s' "${line#up }" ;;
    *) printf '' ;;
  esac
}

HERMES_FILE="${ROOT_DIR}/environments/hermes/.env"
if [ ! -f "${HERMES_FILE}" ]; then
  HERMES_FILE="${ROOT_DIR}/environments/hermes/.env.example"
fi
HERMES_PORT="$(public_value "${HERMES_FILE}" HERMES_PORT)"
HERMES_BIND="$(public_value "${HERMES_FILE}" HERMES_BIND)"
HERMES_ACCESS="$(public_value "${HERMES_FILE}" HERMES_ACCESS)"
HERMES_DOMAIN="$(public_value "${HERMES_FILE}" HERMES_DOMAIN)"
HERMES_PORT="${HERMES_PORT:-8787}"
HERMES_BIND="${HERMES_BIND:-127.0.0.1}"
HERMES_ACCESS="${HERMES_ACCESS:-tailscale}"

{
  echo "# Vulpy Commerce runtime context"
  echo
  echo "Generated at: $(date -Iseconds)"
  echo "Repository: ${ROOT_DIR}"
  echo "Host Tailscale: $(tailscale_line)"
  echo
  echo "> This file contains public runtime context only. Secrets are intentionally omitted."
  echo
  echo "## Product agent (one Hermes for all instances)"
  echo
  echo "- Workspace (in Hermes): \`/app/workspace\`"
  echo "- Soul: \`.hermes/SOUL.md\`"
  echo "- Architecture: \`.hermes/ARCHITECTURE.md\`"
  echo "- Skills: \`.hermes/skills\`"
  echo "- Config: \`environments/hermes/.env\`"
  echo "- Fox UI (host bind): http://${HERMES_BIND}:${HERMES_PORT}"
  echo "- Hermes access: ${HERMES_ACCESS}"
  if [ -n "${HERMES_DOMAIN}" ] && { [ "${HERMES_ACCESS}" = "public" ] || [ "${HERMES_ACCESS}" = "both" ]; }; then
    echo "- Fox UI (public): https://${HERMES_DOMAIN}"
  fi
  echo "- Docker network: \`vulpy-agent\`"
  echo "- Start/stop: \`pnpm vulpy hermes up|down|doctor\`"
  echo
  echo "## Current Environment"
  echo
  CURRENT_ENV_FILE="${ROOT_DIR}/.env-current"
  if [ -f "${CURRENT_ENV_FILE}" ]; then
    current_env="$(cat "${CURRENT_ENV_FILE}" | tr -d '[:space:]')"
    if [ -n "${current_env}" ]; then
      echo "- Active environment: \`${current_env}\`"
    else
      echo "- Active environment: \`dev\` (default, marker file was empty)"
    fi
  else
    echo "- Active environment: \`dev\` (default, no marker file found)"
  fi
  echo

  echo "## Instances"
  echo

  TS_DNS="$(tailscale_dns)"

  for directory in "${ROOT_DIR}"/environments/*; do
    [ -d "${directory}" ] || continue
    name="$(basename "${directory}")"
    [ "${name}" = "hermes" ] && continue
    file="${directory}/.env"
    example="${directory}/.env.example"
    selected="${file}"
    config_state="ready"
    if [ ! -f "${selected}" ]; then
      selected="${example}"
      config_state="example-only"
    fi

    compose_project="$(public_value "${selected}" COMPOSE_PROJECT_NAME)"
    data_dir="$(public_value "${selected}" DATA_DIR)"
    shop_url="$(public_value "${selected}" STOREFRONT_URL NEXT_PUBLIC_SERVER_URL)"
    api_url="$(public_value "${selected}" MEDUSA_BACKEND_URL VITE_MEDUSA_BACKEND_URL)"
    shop_domain="$(public_value "${selected}" SHOP_DOMAIN)"
    api_domain="$(public_value "${selected}" API_DOMAIN)"
    matomo_domain="$(public_value "${selected}" MATOMO_DOMAIN)"

    # Host-facing ports only — container-internal ports stay fixed per service.
    # Resolution order: instance env -> hermes env fallback -> stock default.
    shop_port="$(public_value "${selected}" VULPY_SHOP_PORT)"
    [ -z "${shop_port}" ] && shop_port="$(public_value "${HERMES_FILE}" HERMES_DEV_STOREFRONT_PORT)"
    shop_port="${shop_port:-3000}"
    api_port="$(public_value "${selected}" VULPY_API_PORT)"
    [ -z "${api_port}" ] && api_port="$(public_value "${HERMES_FILE}" HERMES_DEV_MEDUSA_PORT)"
    api_port="${api_port:-9000}"
    postgres_port="$(public_value "${selected}" POSTGRES_PORT)"
    postgres_port="${postgres_port:-5432}"
    redis_port="$(public_value "${selected}" REDIS_PORT)"
    redis_port="${redis_port:-6379}"
    matomo_port="$(public_value "${selected}" MATOMO_HOST_PORT)"

    # dev: prefer the live dev-daemon status when fresh — it is the runtime truth.
    runtime_state=""
    if [ "${name}" = "dev" ]; then
      status_file="${ROOT_DIR}/.tmp/dev/status.json"
      if [ -f "${status_file}" ] && find "${status_file}" -mmin -10 2>/dev/null | grep -q .; then
        runtime_state="$(grep -oE '"state"[[:space:]]*:[[:space:]]*"[^"]*"' "${status_file}" | head -1 | cut -d'"' -f4 || true)"
        runtime_port="$(grep -oE '"shop_port"[[:space:]]*:[[:space:]]*[0-9]+' "${status_file}" | head -1 | grep -oE '[0-9]+$' || true)"
        [ -n "${runtime_port}" ] && shop_port="${runtime_port}"
        runtime_port="$(grep -oE '"api_port"[[:space:]]*:[[:space:]]*[0-9]+' "${status_file}" | head -1 | grep -oE '[0-9]+$' || true)"
        [ -n "${runtime_port}" ] && api_port="${runtime_port}"
      fi
    fi

    if [ -z "${shop_url}" ] && [ -n "${shop_domain}" ]; then
      shop_url="https://${shop_domain}"
    fi
    if [ -z "${api_url}" ] && [ -n "${api_domain}" ]; then
      api_url="https://${api_domain}"
    fi
    if [ "${name}" = "dev" ]; then
      shop_url="${shop_url:-http://localhost:${shop_port}}"
      api_url="${api_url:-http://localhost:${api_port}}"
    fi

    echo "### ${name}"
    echo
    echo "- Configuration: ${config_state}"
    echo "- Compose project: ${compose_project:-$(basename "${ROOT_DIR}")-${name}}"
    echo "- Data directory: ${data_dir:-.data/${name}}"
    echo "- Storefront: ${shop_url:-not configured}"
    echo "- Medusa API/admin: ${api_url:-not configured}"
    if [ -n "${matomo_domain}" ]; then
      echo "- Matomo: https://${matomo_domain}"
    fi
    ports_line="- Ports (host): shop=${shop_port} api=${api_port} postgres=${postgres_port} redis=${redis_port}"
    [ -n "${matomo_port}" ] && ports_line="${ports_line} matomo=${matomo_port}"
    echo "${ports_line}"
    # Operator-facing links — the agent should hand these to the operator,
    # NEVER host.docker.internal / docker-internal hostnames (those only work
    # from inside the Fox container). Tailscale MagicDNS links are emitted
    # when the sidecar is up (one of the operator-link families); the access
    # mode section below decides which family the agent actually hands over.
    ts_shop=""
    ts_api=""
    if [ -n "${TS_DNS}" ]; then
      ts_shop="https://${TS_DNS}:${shop_port}"
      ts_api="https://${TS_DNS}:${api_port}"
    fi
    echo "- Operator links:"
    if [ -n "${ts_shop}" ]; then
      echo "  - Tailscale storefront: ${ts_shop}"
      echo "  - Tailscale Medusa admin: ${ts_api}/app"
      echo "  - Tailscale Payload admin: ${ts_shop}/admin"
    fi
    if [ -n "${shop_url}" ] && [ "${shop_url}" != "http://localhost:${shop_port}" ] && [ "${shop_url}" != "http://127.0.0.1:${shop_port}" ]; then
      echo "  - Public storefront: ${shop_url}"
    fi
    if [ -n "${api_url}" ] && [ "${api_url}" != "http://localhost:${api_port}" ] && [ "${api_url}" != "http://127.0.0.1:${api_port}" ]; then
      echo "  - Public Medusa admin: ${api_url}/app"
    fi
    if [ "${name}" = "dev" ]; then
      echo "  - Local storefront: http://localhost:${shop_port}"
      echo "  - Local Medusa admin: http://localhost:${api_port}/app"
    fi
    if [ "${name}" = "dev" ]; then
      if [ -n "${runtime_state}" ]; then
        echo "- Dev runtime: ${runtime_state} (status.json)"
      fi
      echo "- From Hermes (host processes): http://host.docker.internal:${api_port} , http://host.docker.internal:${shop_port}"
    else
      # L5: the compose-internal medusa-<env>/storefront-<env> hostnames are
      # NOT reachable from Fox's network — emit the host-gateway port form.
      echo "- From Hermes (via host gateway): http://host.docker.internal:${api_port} , http://host.docker.internal:${shop_port}"
    fi
    echo
  done

  echo "## Environment Status"
  echo ""
  echo "| Env | Storefront | Medusa | Status |"
  echo "|-----|-----------|--------|--------|"

  for directory in "${ROOT_DIR}"/environments/*; do
    [ -d "${directory}" ] || continue
    env_name="$(basename "${directory}")"
    [ "${env_name}" = "hermes" ] && continue
    [ "${env_name}" = "edge" ] && continue

    env_selected="${directory}/.env"
    if [ ! -f "${env_selected}" ]; then
      env_selected="${directory}/.env.example"
    fi
    if [ ! -f "${env_selected}" ]; then
      echo "| ${env_name} | - | - | not configured |"
      continue
    fi

    # Read ports (same resolution as above)
    es_shop_port="$(public_value "${env_selected}" VULPY_SHOP_PORT)"
    [ -z "${es_shop_port}" ] && es_shop_port="$(public_value "${HERMES_FILE}" HERMES_DEV_STOREFRONT_PORT)"
    es_shop_port="${es_shop_port:-3000}"
    es_api_port="$(public_value "${env_selected}" VULPY_API_PORT)"
    [ -z "${es_api_port}" ] && es_api_port="$(public_value "${HERMES_FILE}" HERMES_DEV_MEDUSA_PORT)"
    es_api_port="${es_api_port:-9000}"

    # Probe ports via host.docker.internal (Fox is in container, apps on host)
    es_shop_status="down"
    es_api_status="down"
    curl -sf --max-time 2 "http://host.docker.internal:${es_shop_port}/" >/dev/null 2>&1 && es_shop_status="up"
    curl -sf --max-time 2 "http://host.docker.internal:${es_api_port}/health" >/dev/null 2>&1 && es_api_status="up"

    if [ "${es_shop_status}" = "up" ] && [ "${es_api_status}" = "up" ]; then
      es_status="✓ running"
    elif [ "${es_shop_status}" = "up" ] || [ "${es_api_status}" = "up" ]; then
      es_status="⚠ partial"
    else
      es_status="○ stopped"
    fi

    echo "| ${env_name} | :${es_shop_port} (${es_shop_status}) | :${es_api_port} (${es_api_status}) | ${es_status} |"
  done

  echo ""

  cat <<'RULES'
## Agent defaults

- One Hermes serves all instances; always name the target instance.
- Treat `dev` as the default target for code and content changes.
- Never modify or deploy `live` unless the user explicitly names live or approves deployment.
- Run `pnpm vulpy env doctor <instance>` before environment operations.
- Run `pnpm vulpy hermes doctor` for the host-level agent.
- Customer / hosting install: `pnpm vulpy install` (optional bootstrap-host for deploy user).
- Future OSS single-install uses the same path with N=1 instance.
- Medusa owns commerce data; Payload owns editorial content; the storefront presents both.
- Use Payload MCP for supported editorial changes rather than direct database edits.
- Do not print, copy, or commit values from environment files.
RULES
  echo
  cat <<'EOF'
## Access mode (operator-facing links)

- The current session's access mode wins for operator-facing links:
  tailscale -> ts.net links, public -> public links, local -> localhost links.
  The WebUI auto-detects it and injects it into EVERY agent run.
- If no session access mode is known, offer the Tailscale / public / local
  links from the "Operator links" blocks above WITHOUT guessing which the
  operator can reach.
- Do NOT assume Tailscale just because the sidecar is up — the operator may
  be on the public edge or localhost in this session.
- NEVER `host.docker.internal` or docker-internal hostnames (those only work
  from inside the Fox container).
EOF
  echo
} > "${OUTPUT}"

echo "Generated ${OUTPUT}"
