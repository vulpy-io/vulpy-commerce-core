#!/usr/bin/env bash
# Host-level Hermes / Fox lifecycle (one agent for all instances).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# shellcheck source=scripts/lib/install-helpers.sh
source "${ROOT_DIR}/scripts/lib/install-helpers.sh"

usage() {
  cat <<'EOF'
Usage:
  pnpm vulpy hermes up
  pnpm vulpy hermes down
  pnpm vulpy hermes status
  pnpm vulpy hermes doctor
  pnpm vulpy hermes logs
  pnpm vulpy hermes repair-ownership [user]

Hermes is host-scoped (not tied to a commerce instance). It reaches instances on
Docker network vulpy-agent as medusa-<env> / storefront-<env>.

After `up`, ownership of the checkout is restored with a **pruned** chown
(Fox’s stock `chown -R /app/workspace` is neutralized — it would walk node_modules).
On AWS (EC2/Lightsail), `up` also best-effort applies the IMDS lock so Fox cannot
read the instance IAM role via metadata.
EOF
}

ACTION="${1:-}"
if [ -n "${ACTION}" ]; then
  shift
fi
OWNER_HINT="${1:-}"
# Back-compat: ignore a trailing env name for lifecycle commands.
if [ -n "${OWNER_HINT}" ] && [[ "${ACTION}" =~ ^(up|down|status|logs|doctor)$ ]]; then
  echo "NOTE: Hermes is host-scoped; ignoring instance argument '${OWNER_HINT}'." >&2
  OWNER_HINT=""
fi

if [ -z "${ACTION}" ]; then
  usage >&2
  exit 1
fi

compose() {
  bash "${ROOT_DIR}/scripts/hermes-compose.sh" "$@"
}

# ---------------------------------------------------------------------------
# Agent command server — host-side Unix socket server that lets Fox send
# lifecycle commands (dev up/down/restart) without Docker socket access.
# The server script lives at scripts/vulpy-agent-cmd-server.py and the
# PID file + socket are written under .tmp/.
# ---------------------------------------------------------------------------
AGENT_SERVER_SCRIPT="${ROOT_DIR}/scripts/vulpy-agent-cmd-server.py"
AGENT_SERVER_PID="${ROOT_DIR}/.tmp/dev/agent-cmd-server.pid"
AGENT_SERVER_LOG="${ROOT_DIR}/.tmp/dev/agent-cmd-server.log"

agent_server_start() {
  if [ ! -f "${AGENT_SERVER_SCRIPT}" ]; then
    echo "WARN: agent command server script not found: ${AGENT_SERVER_SCRIPT}" >&2
    return 0
  fi
  mkdir -p "${ROOT_DIR}/.tmp/dev"
  if [ -f "${AGENT_SERVER_PID}" ] && kill -0 "$(cat "${AGENT_SERVER_PID}")" 2>/dev/null; then
    echo "Agent command server already running (pid $(cat "${AGENT_SERVER_PID}"))."
    return 0
  fi
  echo "Starting agent command server (drop dir: agent-cmds/)..."
  python3 "${AGENT_SERVER_SCRIPT}" >> "${AGENT_SERVER_LOG}" 2>&1 &
  local spid=$!
  echo "${spid}" > "${AGENT_SERVER_PID}"
  sleep 1
  if kill -0 "${spid}" 2>/dev/null; then
    echo "Agent command server started (pid ${spid})."
  else
    echo "WARN: agent command server exited immediately — check ${AGENT_SERVER_LOG}" >&2
    rm -f "${AGENT_SERVER_PID}"
  fi
}

agent_server_stop() {
  if [ -f "${AGENT_SERVER_PID}" ]; then
    local spid
    spid="$(cat "${AGENT_SERVER_PID}")"
    if kill -0 "${spid}" 2>/dev/null; then
      echo "Stopping agent command server (pid ${spid})..."
      kill "${spid}" 2>/dev/null || true
      sleep 1
    fi
    rm -f "${AGENT_SERVER_PID}"
  fi
  # Clean up any leftover response files (daemon owns resp/; req/ is Fox-owned).
  rm -f "${ROOT_DIR}/agent-cmds/resp"/*.resp.json \
        "${ROOT_DIR}/agent-cmds/resp"/*.tmp \
        2>/dev/null || true
}

# Who should own the bind-mounted workspace after Fox chown.
# Prefer the real process user — nested `sudo -u app` still inherits SUDO_USER
# from the outer cloud login (ubuntu), which must not steal the tree.
vulpy_hermes_workspace_owner() {
  if [ -n "${OWNER_HINT:-}" ]; then
    printf '%s' "${OWNER_HINT}"
    return 0
  fi
  if [ "$(id -u)" -ne 0 ]; then
    printf '%s' "$(id -un)"
    return 0
  fi
  printf '%s' "${SUDO_USER:-${USER:-root}}"
}

case "${ACTION}" in
  up)
    echo "Starting host-level Hermes..."
    # Pre-flight: if any security-gated file has changed since checksums were
    # last generated, the container will crash-loop. Warn loudly and abort so
    # the operator reviews the change before deciding to regenerate.
    # Auto-regen would silently accept agent-modified entrypoint files —
    # defeating the gate. Require explicit: python3 scripts/generate-checksums.py > scripts/.vulpy-security-checksums
    if [ -f "${ROOT_DIR}/scripts/generate-checksums.py" ] && \
       [ -f "${ROOT_DIR}/scripts/.vulpy-security-checksums" ]; then
      FRESH_CHECKSUMS="$(python3 "${ROOT_DIR}/scripts/generate-checksums.py" 2>/dev/null || true)"
      if [ -n "${FRESH_CHECKSUMS}" ]; then
        CURRENT_SORTED="$(grep -v '^#' "${ROOT_DIR}/scripts/.vulpy-security-checksums" | sort)"
        FRESH_SORTED="$(echo "${FRESH_CHECKSUMS}" | grep -v '^#' | sort)"
        if [ "${FRESH_SORTED}" != "${CURRENT_SORTED}" ]; then
          echo "[vulpy] ERROR: Security checksums are stale — one or more gated files changed."
          echo "[vulpy]        Review the diff, then regenerate if the change is intentional:"
          echo "[vulpy]          cd ${ROOT_DIR}"
          echo "[vulpy]          git diff scripts/hermes-fox-entrypoint.sh scripts/vulpy-agent-cmd-server.py \\"
          echo "[vulpy]                   docker-compose.hermes.yml docker-compose.edge.yml \\"
          echo "[vulpy]                   deploy/Caddyfile.dev deploy/Caddyfile.internal"
          echo "[vulpy]          python3 scripts/generate-checksums.py > scripts/.vulpy-security-checksums"
          echo "[vulpy]          pnpm vulpy hermes up"
          echo "[vulpy] Aborting to prevent a crash-loop. Fix checksums first."
          exit 1
        fi
      fi
    fi
    # All services in the active compose set (Hermes + optional Tailscale sidecar).
    # `up -d hermes` alone skips the sidecar even when HERMES_TAILSCALE=1.
    # --- Auto-rebuild on stale image (VULPY_HERMES_AUTO_REBUILD, default on) ---
    # If the image fingerprint differs from the current sources, rebuild FIRST
    # so `up` never starts a stale container. `vulpy-hermes-rebuild.sh` has its
    # own backup/rollback safety. Opt out with VULPY_HERMES_AUTO_REBUILD=0.
    if [ "${VULPY_HERMES_AUTO_REBUILD:-1}" != "0" ]; then
      # shellcheck source=scripts/lib/hermes-build-fingerprint.sh
      source "${ROOT_DIR}/scripts/lib/hermes-build-fingerprint.sh"
      if vulpy_hermes_needs_rebuild "${ROOT_DIR}"; then
        echo "[vulpy] Image is up to date (fingerprint match) — skipping rebuild."
      else
        echo "[vulpy] Image is STALE or unstamped — rebuilding before up (set VULPY_HERMES_AUTO_REBUILD=0 to skip)..."
        bash "${ROOT_DIR}/scripts/vulpy-hermes-rebuild.sh" --force
      fi
    fi
    compose up -d
    # Fox entrypoint may chown the bind mount (including environments/*.env).
    # Restore ownership before sourcing env for wait/status helpers.
    vulpy_repair_workspace_ownership "${ROOT_DIR}" "$(vulpy_hermes_workspace_owner)" || true
    # Host writes to HERMES_DATA_DIR (e.g. hermes.env) must not leave Fox unable
    # to save onboarding / API keys / settings.
    vulpy_fix_running_hermes_data_perms || true
    # shellcheck source=scripts/lib/project-env.sh
    export VULPY_ENV=hermes
    export VULPY_ENV_FILE="${ROOT_DIR}/environments/hermes/.env"
    source "${ROOT_DIR}/scripts/lib/project-env.sh"
    vulpy_wait_hermes_ready 180 || true
    # The container entrypoint performs the boot-time recursive repair. The
    # host-side repair above is deliberately limited to /data/config, so a
    # second pass here only adds lifecycle latency and is unnecessary.
    vulpy_repair_workspace_ownership "${ROOT_DIR}" "$(vulpy_hermes_workspace_owner)" || true
    # Apply default ACLs on every up, not only explicit repair-ownership. This
    # keeps Fox-created skills writable by the host/code-server user on clean
    # installs and after container recreates.
    vulpy_apply_workspace_acls "${ROOT_DIR}" 999 "$(vulpy_hermes_workspace_owner)" || true
    # AWS only: block instance metadata so Fox cannot use the VM IAM role.
    vulpy_imds_firewall_apply_best_effort || true
    # Ensure the agent role profiles exist inside Fox. Provisioning runs once;
    # on later boots this is a no-op that only restores missing wrapper scripts
    # (~/.local/bin is an image-layer path wiped on rebuild) — local per-profile
    # edits (config.yaml, SOUL.md) are preserved. Safe to re-run on every hermes up.
    compose exec -T hermes bash /app/workspace/scripts/setup-agent-profiles.sh \
      2>/dev/null && echo "Agent profiles: ok" \
      || echo "Warning: agent profiles not created (Fox may not have mounted workspace yet)"
    echo "Fox UI: http://${HERMES_BIND:-127.0.0.1}:${HERMES_PORT:-8787}"
    echo "Workspace inside container: /app/workspace"
    echo "Agent network aliases: medusa-<env>:9000 , storefront-<env>:3000"
    # Start the host-side agent command server so Fox can send lifecycle
    # commands (dev up/down/restart) via the agent-cmds/ file-drop directory.
    agent_server_start || true
    ;;
  repair-ownership|fix-ownership)
    export VULPY_ENV=hermes
    export VULPY_ENV_FILE="${ROOT_DIR}/environments/hermes/.env"
    if [ -f "${VULPY_ENV_FILE}" ]; then
      # shellcheck source=scripts/lib/project-env.sh
      source "${ROOT_DIR}/scripts/lib/project-env.sh"
    fi
    vulpy_repair_workspace_ownership "${ROOT_DIR}" "$(vulpy_hermes_workspace_owner)"
    # Belt-and-suspenders: apply default ACLs so future Fox-written files are
    # permanently group-readable regardless of umask changes in the container.
    vulpy_apply_workspace_acls "${ROOT_DIR}" 999 "$(vulpy_hermes_workspace_owner)" || true
    ;;
  down)
    echo "Stopping host-level Hermes..."
    # Stop the agent command server before bringing down the container.
    agent_server_stop || true
    compose down --remove-orphans || {
      compose stop || true
      compose rm -f || true
    }
    ;;
  status)
    compose ps
    ;;
  logs)
    compose logs -f
    ;;
  doctor)
    export VULPY_ENV=hermes
    export VULPY_ENV_FILE="${ROOT_DIR}/environments/hermes/.env"
    if [ ! -f "${VULPY_ENV_FILE}" ]; then
      echo "Missing ${VULPY_ENV_FILE} (will be created on hermes up)." >&2
    else
      # shellcheck source=scripts/lib/project-env.sh
      source "${ROOT_DIR}/scripts/lib/project-env.sh"
    fi
    echo "Hermes doctor — host-level agent"
    echo "Config: ${VULPY_ENV_FILE}"
    echo "HERMES_ACCESS=${HERMES_ACCESS:-tailscale}"
    echo "HERMES_BIND=${HERMES_BIND:-127.0.0.1}"
    echo "HERMES_PORT=${HERMES_PORT:-8787}"
    echo "HERMES_DOMAIN=${HERMES_DOMAIN:-}"
    echo "HERMES_IMAGE=${HERMES_IMAGE:-ghcr.io/fox-in-the-box-ai/cloud:stable}"
    echo "HERMES_DATA_DIR=${HERMES_DATA_DIR:-}"
    echo "Network: ${VULPY_AGENT_NETWORK:-vulpy-agent}"
    if docker network inspect "${VULPY_AGENT_NETWORK:-vulpy-agent}" >/dev/null 2>&1; then
      echo "Network status: present"
    else
      echo "Network status: missing (created on hermes up / env up)"
    fi
    if [ -f "${ROOT_DIR}/.hermes/SOUL.md" ]; then
      echo "SOUL.md: present"
    else
      echo "SOUL.md: MISSING" >&2
    fi
    if [ -f "${ROOT_DIR}/.hermes/ARCHITECTURE.md" ]; then
      echo "ARCHITECTURE.md: present"
    else
      echo "ARCHITECTURE.md: MISSING" >&2
    fi
    if [ -d "${ROOT_DIR}/.hermes/skills" ]; then
      echo "Skills: .hermes/skills"
    else
      echo "Skills: MISSING" >&2
    fi
    echo "Instances:"
    for directory in "${ROOT_DIR}"/environments/*; do
      [ -d "${directory}" ] || continue
      name="$(basename "${directory}")"
      [ "${name}" = "hermes" ] && continue
      if [ -f "${directory}/.env" ]; then
        echo "  - ${name}: ready → http://medusa-${name}:9000 http://storefront-${name}:3000"
      else
        echo "  - ${name}: example-only"
      fi
    done
    TS_STATE="$(vulpy_tailscale_status_line)"
    echo "Host Tailscale: ${TS_STATE}"
    TS_LOCK="$(vulpy_tailscale_firewall_status 2>/dev/null || echo off)"
    echo "Tailscale egress lock: ${TS_LOCK}"
    if [ "${TS_LOCK}" = "on" ]; then
      echo "Tip: with egress lock on, the host cannot curl Fox over Tailscale."
      echo "     Probe from inside the netns: docker exec <fox-sidecar> …"
      echo "     or: compose exec hermes-tailscale wget -qO- https://…"
    fi
    FOX_TS="$(vulpy_fox_tailscale_status_line 2>/dev/null || echo unavailable)"
    echo "Fox Tailscale: ${FOX_TS}"
    if vulpy_host_is_aws 2>/dev/null; then
      IMDS_LOCK="$(vulpy_imds_firewall_status 2>/dev/null || echo off)"
      echo "AWS host: yes"
      echo "IMDS lock: ${IMDS_LOCK} (VULPY_IMDS_LOCK=${VULPY_IMDS_LOCK:-1})"
      IMDS_HOST="$(vulpy_imds_probe_host 2>/dev/null || true)"
      echo "IMDS host probe: ${IMDS_HOST:-unknown}"
      IMDS_HERMES="$(vulpy_imds_probe_hermes 2>/dev/null || true)"
      echo "IMDS Hermes probe: ${IMDS_HERMES:-unknown}"
      if [ "${IMDS_HOST}" = "reachable" ] || [ "${IMDS_HERMES}" = "reachable" ]; then
        echo "WARN: AWS instance metadata is reachable — Fox/Bedrock may show" >&2
        echo "      'authenticated via OAuth' using the Lightsail/EC2 instance role." >&2
        echo "      Apply lock: sudo bash scripts/vulpy-imds-lock-apply.sh" >&2
        echo "      Or disable IMDS in AWS (Lightsail/EC2 metadata http_endpoint=disabled;" >&2
        echo "      ASG launch template metadata_options). Opt out: VULPY_IMDS_LOCK=0." >&2
      fi
    fi
    vulpy_tailscale_finish_status "${ROOT_DIR}" 2>/dev/null || true
    if echo "${FOX_TS}" | grep -qiE 'offline|stopped|needs login|unavailable'; then
      echo "Tip: if MagicDNS shows a stale/offline machine (e.g. name-1 after"
      echo "     rename collisions), remove it in Tailscale Machines admin:"
      echo "     https://login.tailscale.com/admin/machines"
      echo "     State dir: .data/hermes/tailscale (or HERMES_TS_STATE_DIR)."
    fi
    echo "HERMES_TAILSCALE=${HERMES_TAILSCALE:-0}"
    echo "TS_HOSTNAME=${TS_HOSTNAME:-}"
    if compose ps --status running hermes 2>/dev/null | grep -q hermes; then
      echo "Container: running"
      if compose exec -T hermes sh -c 'test -d /app/workspace && test -w /app/workspace'; then
        echo "Workspace mount: /app/workspace OK (writable)"
      else
        echo "Workspace mount: FAILED" >&2
        exit 1
      fi
    else
      echo "Container: not running (start with: pnpm vulpy hermes up)"
    fi
    compose config --quiet
    echo "Hermes configuration is valid."
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
