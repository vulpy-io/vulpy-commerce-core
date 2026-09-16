#!/usr/bin/env bash
# dev-watchdog-cron.sh — in-container dev stack watchdog (no_agent cron script).
#
# Installed to /data/data/hermes/scripts/dev-watchdog.sh by the entrypoint on
# every container boot. The cron job is registered as:
#   hermes cron create "every 10m" --name dev-storefront-watchdog \
#     --no-agent --script dev-watchdog.sh --deliver local
#
# Behaviour:
#   - Silent exit 0 unless state=running AND health probe fails (empty stdout
#     = Hermes delivers nothing to the operator).
#   - Probes host.docker.internal:<shop_port> — dev servers run on the HOST;
#     container-local 127.0.0.1 is always unreachable (different network ns).
#   - On dead stack: logs to .tmp/dev/watchdog-cron.log, fires dev.wake via
#     vulpy-agent-cmd.py (agent-cmd daemon detaches properly and holds).
#   - exit 0 on successful wake; exit 1 only if recovery fails (operator alert).
#
# Env overrides (for testing — safe against a live stack):
#   STATUS_FILE         path to dev status JSON   (default: .tmp/dev/status.json)
#   PROBE_URL           HTTP URL to health-check   (default: host.docker.internal:<port>/health)
#   STALE_AFTER_SECONDS min age before intervention (default: 300)
#   AGENT_CMD           path to agent-cmd script   (default: scripts/vulpy-agent-cmd.py)
#
# Architecture note: this is Layer 2 of a two-layer watchdog:
#   Layer 1: host systemd timer (vulpy-watchdog.timer) — probes + wakes via
#            pnpm vulpy dev wake. Known weakness: wake subprocess can die
#            ~70s after start (detachment hypothesis, unconfirmed — see
#            .hermes/skills/vulpy-environment-operations references).
#   Layer 2: this cron — uses agent-cmd file-drop path which detaches reliably.

set -euo pipefail

WORKSPACE="/app/workspace"
cd "${WORKSPACE}" || exit 0

# ── Config (overridable for testing) ──────────────────────────────────────────
STATUS_FILE="${STATUS_FILE:-.tmp/dev/status.json}"
STALE_AFTER_SECONDS="${STALE_AFTER_SECONDS:-300}"
AGENT_CMD="${AGENT_CMD:-scripts/vulpy-agent-cmd.py}"
LOG_FILE=".tmp/dev/watchdog-cron.log"

# Derive shop port from status.json or fall back to 3000.
SHOP_PORT="$(python3 -c "
import json, sys
try:
    d = json.load(open('${STATUS_FILE}'))
    print(d.get('shop_port', 3000))
except Exception:
    print(3000)
" 2>/dev/null || echo 3000)"

PROBE_URL="${PROBE_URL:-http://host.docker.internal:${SHOP_PORT}/health}"

# ── Guard: only act if state=running and status is not stale ──────────────────
STATE="$(python3 -c "
import json, time, sys
try:
    d = json.load(open('${STATUS_FILE}'))
    state = d.get('state', '')
    ts = d.get('updated_at', '')
    if not state:
        sys.exit(1)
    # Check age — stale status file means the dev server may have died without
    # updating status; treat as not-our-problem (avoids double-intervention).
    import datetime
    if ts:
        age = time.time() - datetime.datetime.fromisoformat(ts.replace('Z','+00:00')).timestamp()
        if age > ${STALE_AFTER_SECONDS}:
            sys.exit(2)
    print(state)
except Exception:
    sys.exit(1)
" 2>/dev/null || true)"

[ "${STATE}" != "running" ] && exit 0   # stopped/stale/missing — not our problem

# ── Health probe ──────────────────────────────────────────────────────────────
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "${PROBE_URL}" 2>/dev/null || echo "000")"
[ "${HTTP_CODE}" = "200" ] && exit 0   # healthy — stay silent

# ── Stack is dead — intervene ─────────────────────────────────────────────────
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$(dirname "${LOG_FILE}")"
echo "[watchdog] ${TS} storefront down (state=running, ${PROBE_URL} -> ${HTTP_CODE}) — firing dev.wake via agent-cmd" | tee -a "${LOG_FILE}"

if python3 "${AGENT_CMD}" dev.wake 2>&1 | tee -a "${LOG_FILE}"; then
    echo "[watchdog] dev.wake dispatched — exit 0 (recovery in progress)" | tee -a "${LOG_FILE}"
    exit 0
else
    echo "[watchdog] ERROR: dev.wake failed — operator intervention required" | tee -a "${LOG_FILE}" >&2
    exit 1
fi
