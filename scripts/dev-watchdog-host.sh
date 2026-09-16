#!/usr/bin/env bash
# dev-watchdog-host.sh — host-side health watchdog for the dev shop (systemd timer).
#
# Silent when healthy; intervenes with `pnpm vulpy dev wake` when the storefront
# is dead while status claims running (wedged boot / crashed process / poisoned
# .next — the wrapper's auto-clear handles the cache).
#
# Runs on the HOST as the store user, so it survives container restarts AND host
# reboots (unlike an in-container Hermes cron job). Timer: vulpy-watchdog.timer.
#
# Usage: dev-watchdog-host.sh [checkout-dir]   (default: repo root of this script)

# INSTALL on a host (as root) — materialize the unit placeholders:
#   sudo install -o <user> -g <user> -m 755 scripts/dev-watchdog-host.sh <checkout>/scripts/
#   sudo install -m 644 scripts/systemd/vulpy-watchdog.service /etc/systemd/system/vulpy-watchdog.service
#   sudo install -m 644 scripts/systemd/vulpy-watchdog.timer   /etc/systemd/system/vulpy-watchdog.timer
#   sudo sed -i \
#     -e 's|__CHECKOUT__|<checkout>|g' \
#     -e 's|__USER__|<user>|g' \
#     -e 's|__SCRIPT__|<checkout>/scripts/dev-watchdog-host.sh|g' \
#     /etc/systemd/system/vulpy-watchdog.service
#   # Tenant resource ceilings (optional — skip for "no ceiling" behavior):
#   #   source <checkout>/.env and export VULPY_APP_ID, then:
#   #   TL_ENV=/etc/vulpy/tenant-limits-${VULPY_APP_ID}.env
#   #   sudo sed -i -e "s|__MEMORY_MAX__|$(grep ^DEV_MEM_MAX_MB= $TL_ENV | cut -d= -f2)M|g" \
#   #                -e "s|__MEMORY_HIGH__|$(grep ^DEV_MEM_HIGH_MB= $TL_ENV | cut -d= -f2)M|g" \
#   #                -e "s|__CPU_QUOTA__|$(grep ^DEV_CPU_QUOTA_PERCENT= $TL_ENV | cut -d= -f2)%|g" \
#   #     /etc/systemd/system/vulpy-watchdog.service
#   #   Without a manifest, delete the three directive lines instead:
#   #   sudo sed -i -e '/__MEMORY_MAX__/d' -e '/__MEMORY_HIGH__/d' -e '/__CPU_QUOTA__/d' \
#   #     /etc/systemd/system/vulpy-watchdog.service
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now vulpy-watchdog.timer
#
# Prefer the automated path: `bash scripts/install-reboot-survival.sh --user <user>`
# materializes the same units (including limits) from deploy/systemd templates.
#
set -uo pipefail

CHECKOUT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
STATUS_FILE="${CHECKOUT}/.tmp/dev/status.json"
LOG_FILE="${CHECKOUT}/.tmp/dev/watchdog.log"
STALE_AFTER_SECONDS="${STALE_AFTER_SECONDS:-300}"   # ignore boots younger than this
PROBE_TIMEOUT="${PROBE_TIMEOUT:-10}"

log() { printf '%s [watchdog] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "${LOG_FILE}" 2>/dev/null || true; }

# Desired state — what SHOULD be running per the operator's last explicit
# lifecycle action (written by dev-app-server.sh on every up/down).
DESIRED_STATE="$(head -c 16 "${CHECKOUT}/.tmp/dev/desired-state" 2>/dev/null | tr -d '[:space:]')"
case "${DESIRED_STATE}" in running|stopped) ;; *) DESIRED_STATE="unknown" ;; esac

if [ ! -f "${STATUS_FILE}" ]; then
  # No status file: .tmp was wiped (reboot cleanup, host reinstall) or the dev
  # stack never ran here. Revive ONLY when the shop should be up. Use `dev up`
  # (not wake): it also brings up Postgres/Redis when those containers are
  # down, and no-ops servers that are already running.
  if [ "${DESIRED_STATE}" = "running" ]; then
    log "intervening: desired=running but no status file (reboot or wipe) — dev up"
    if cd "${CHECKOUT}" && timeout 300 pnpm vulpy dev up >> "${LOG_FILE}" 2>&1; then
      log "dev up ok"
    else
      log "dev up rc=$?"
    fi
  fi
  exit 0
fi

read_state() {
  local s
  s="$(python3 -c "
import json, time, sys
d = json.load(open('${STATUS_FILE}'))
u = d.get('updated_at','')
try:
    age = time.time() - time.mktime(time.strptime(u, '%Y-%m-%dT%H:%M:%SZ'))
except Exception:
    age = 0
print(d.get('state','stopped'), int(age), d.get('shop_port',3000))
")" || exit 0
  STATE="${s%% *}"
  AGE="${s#* }"; AGE="${AGE%% *}"
  SHOP_PORT="${s##* }"
}

read_state
if [ "${STATE}" != "running" ]; then
  # Desired-state aware revival: state != running is normally an explicit
  # operator stop — stay out of the way. But when desired=running, a dead or
  # partial stack is a crash (or a post-reboot false "stopped"), not intent.
  # `dev up` (not wake) also restarts Postgres/Redis if those containers died,
  # and no-ops for servers already running.
  if [ "${DESIRED_STATE}" = "running" ]; then
    log "intervening: desired=running but state=${STATE} (crash or post-reboot) — dev up"
    if cd "${CHECKOUT}" && timeout 300 pnpm vulpy dev up >> "${LOG_FILE}" 2>&1; then
      log "dev up ok"
    else
      log "dev up FAILED (rc=$?)"
    fi
  fi
  exit 0   # deliberately stopped or unknown history — don't fight the operator
fi
[ "${AGE}" -lt "${STALE_AFTER_SECONDS}" ] && exit 0   # still booting — give it time

# Memory guard (tenant resource limits): when the storefront's next-server RSS
# exceeds its ceiling (STORE_MEM_MAX_MB from the root-generated limits env),
# restart the dev stack via dev-app-server.sh restart (NOT `dev wake` — wake
# refuses with "[dev] Already running" while the stack is up). No limits env =
# no-op (backwards compatible). Silent when healthy.
# shellcheck source=scripts/lib/tenant-limits.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/tenant-limits.sh" 2>/dev/null || true
vulpy_tl_watchdog_memory_guard "${CHECKOUT}" "${LOG_FILE}" || true

# Companion containers (Fox/Hermes + edge) belong to this checkout via Compose
# labels and survive host reboots through restart policies — but a mid-flight
# `docker stop` (accident, scripted teardown, OOM killer) leaves them down
# FOREVER on boxes like the demo hosts where nobody replays bring-up. When the
# shop should be up, revive OUR OWN stopped CORE containers with `docker start`
# (reuses their existing config; no compose env context needed). Allowlist by
# compose service: Matomo dev containers are optional and may be legitimately
# stopped — they are NOT auto-revived. Containers that don't exist yet are
# skipped (fresh installs use vulpy hermes/edge up).
if [ "${DESIRED_STATE}" = "running" ] && command -v docker >/dev/null 2>&1; then
  COMPANIONS="$(docker ps -a \
    --filter "label=com.docker.compose.project.working_dir=${CHECKOUT}" \
    --format '{{.Names}}\t{{.State}}\t{{.Label "com.docker.compose.service"}}' 2>/dev/null || true)"
  if [ -n "${COMPANIONS}" ]; then
    while IFS=$'\t' read -r cname cstate csvc; do
      [ -n "${cname}" ] || continue
      case "${csvc}" in
        hermes|searxng|edge|postgres|redis) ;;   # core companions only
        *) continue ;;
      esac
      if [ "${cstate}" != "running" ]; then
        log "intervening: container ${cname} (${csvc}) is ${cstate} while desired=running — docker start"
        docker start "${cname}" >> "${LOG_FILE}" 2>&1 \
          || log "docker start ${cname} FAILED"
      fi
    done <<< "${COMPANIONS}"
  fi
fi

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time "${PROBE_TIMEOUT}" \
  "http://127.0.0.1:${SHOP_PORT}/health" 2>/dev/null || echo 000)"
[ "${code}" = "200" ] && exit 0                 # healthy — stay silent

log "intervening: storefront :${SHOP_PORT} dead while state=running (age ${AGE}s) — dev wake"
if cd "${CHECKOUT}" && timeout 300 pnpm vulpy dev wake >> "${LOG_FILE}" 2>&1; then
  log "dev wake ok"
else
  log "dev wake FAILED (rc=$?)"
fi
exit 0
