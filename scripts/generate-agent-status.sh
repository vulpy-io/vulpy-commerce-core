#!/usr/bin/env bash
# generate-agent-status.sh — live health snapshot written to .agent/status.md
#
# Called by:
#   pnpm vulpy agent status
#
# Output: .agent/status.md  (no secrets; safe to read from Fox)
#
# Works from inside OR outside the Hermes container.
# When run inside Fox, host dev services are reached via host.docker.internal.
# When run on the host, services are reached via 127.0.0.1.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

OUTPUT="${1:-${ROOT_DIR}/.agent/status.md}"
if [[ "${OUTPUT}" != /* ]]; then
  OUTPUT="${ROOT_DIR}/${OUTPUT}"
fi
mkdir -p "$(dirname "${OUTPUT}")"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ts() { date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u; }

# Detect whether we are running inside the Hermes Fox container.
in_hermes() {
  [ -f /etc/hermes-container ] || [ "${HERMES_CONTAINER:-}" = "1" ] || \
    [ -f /.dockerenv ] && grep -q hermes /proc/1/cgroup 2>/dev/null || \
    { [ -f /.dockerenv ] && [ "${HOSTNAME:-}" != "" ] && \
      grep -qE 'hermes|fox' <(hostname 2>/dev/null) 2>/dev/null; } || \
    { [ -f /.dockerenv ] && \
      [ "$(cat /proc/1/comm 2>/dev/null)" != "bash" ]; }
}

# Determine the host to probe for dev services.
# Inside Hermes → host.docker.internal; on host → 127.0.0.1
dev_host() {
  if [ -f /.dockerenv ]; then
    echo "host.docker.internal"
  else
    echo "127.0.0.1"
  fi
}

# TCP probe via Python (available in both Fox and on host).
# Returns "up <latency>ms" or "down: <error>" — single line, no newline in output.
probe_tcp() {
  local host="$1" port="$2"
  local out
  out="$(python3 "${ROOT_DIR}/scripts/check-ports.py" "${host}" "${port}" 2>/dev/null | \
    python3 -c "
import json,sys
try:
    data = json.load(sys.stdin)
    r = data['results'][0]
    if r['ok']:
        print(f\"up ({r['latency_ms']}ms)\", end='')
    else:
        err = r.get('error','unknown').replace('\n',' ').replace('\r','')
        print(f\"down \u2014 {err}\", end='')
except Exception as e:
    print(f\"down \u2014 parse error: {e}\", end='')
" 2>/dev/null)" || true
  echo "${out:-down — probe error}"
}

# HTTP health probe — tries /health first, falls back to /
probe_http() {
  local url="$1"
  local result
  result="$(curl -sf --max-time 4 -o /dev/null -w "%{http_code}" "${url}/health" 2>/dev/null || true)"
  if [ -z "${result}" ] || [ "${result}" = "000" ]; then
    result="$(curl -sf --max-time 4 -o /dev/null -w "%{http_code}" "${url}" 2>/dev/null || true)"
  fi
  case "${result}" in
    2*|3*) echo "http ${result}" ;;
    ""|000) echo "no response" ;;
    *) echo "http ${result}" ;;
  esac
}

# Read last N lines of a log file, stripping ANSI escapes.
tail_log() {
  local file="$1" lines="${2:-20}"
  if [ -f "${file}" ]; then
    tail -n "${lines}" "${file}" | sed 's/\x1b\[[0-9;]*m//g'
  else
    echo "(no log yet)"
  fi
}

# Load a key from a .env file (no secrets — only public keys passed explicitly).
load_kv() {
  local file="$1" key="$2"
  [ -f "${file}" ] || return 0
  grep -E "^${key}=" "${file}" 2>/dev/null | head -1 | cut -d= -f2- || true
}

# ---------------------------------------------------------------------------
# Gather data
# ---------------------------------------------------------------------------

GENERATED_AT="$(ts)"
DEV_HOST="$(dev_host)"
RUN_DIR="${ROOT_DIR}/.tmp/dev"
STATUS_FILE="${RUN_DIR}/status.json"
LOG_FILE="${RUN_DIR}/dev.log"
MEDUSA_LOG="${RUN_DIR}/medusa.log"
STOREFRONT_LOG="${RUN_DIR}/storefront.log"

# Dev ports (from status.json or env defaults)
if [ -f "${STATUS_FILE}" ]; then
  DEV_STATE="$(python3 -c "import json,sys; d=json.load(open('${STATUS_FILE}')); print(d.get('state','unknown'))" 2>/dev/null || echo "unknown")"
  DEV_PID="$(python3 -c "import json,sys; d=json.load(open('${STATUS_FILE}')); print(d.get('pid') or 'none')" 2>/dev/null || echo "none")"
  SHOP_PORT="$(python3 -c "import json,sys; d=json.load(open('${STATUS_FILE}')); print(d.get('shop_port',3000))" 2>/dev/null || echo "3000")"
  API_PORT="$(python3 -c "import json,sys; d=json.load(open('${STATUS_FILE}')); print(d.get('api_port',9000))" 2>/dev/null || echo "9000")"
  DB_HOST="$(python3 -c "import json,sys; d=json.load(open('${STATUS_FILE}')); print(d.get('db_host','127.0.0.1'))" 2>/dev/null || echo "127.0.0.1")"
  DB_PORT="$(python3 -c "import json,sys; d=json.load(open('${STATUS_FILE}')); print(d.get('db_port',5432))" 2>/dev/null || echo "5432")"
  STATUS_UPDATED="$(python3 -c "import json,sys; d=json.load(open('${STATUS_FILE}')); print(d.get('updated_at','?'))" 2>/dev/null || echo "?")"
else
  DEV_STATE="unknown (no status.json — run pnpm vulpy dev up)"
  DEV_PID="none"
  SHOP_PORT="$(load_kv "${ROOT_DIR}/environments/dev/.env" VULPY_SHOP_PORT)"; SHOP_PORT="${SHOP_PORT:-3000}"
  API_PORT="$(load_kv "${ROOT_DIR}/environments/dev/.env" VULPY_API_PORT)"; API_PORT="${API_PORT:-9000}"
  DB_HOST="127.0.0.1"
  DB_PORT="$(load_kv "${ROOT_DIR}/environments/dev/.env" POSTGRES_PORT)"; DB_PORT="${DB_PORT:-5432}"
  STATUS_UPDATED="n/a"
fi

# Agent command drop directory state
AGENT_REQ_DIR="${ROOT_DIR}/agent-cmds/req"
AGENT_RESP_DIR="${ROOT_DIR}/agent-cmds/resp"
AGENT_SERVER_PID_FILE="${ROOT_DIR}/.tmp/dev/agent-cmd-server.pid"
if [ -d "${AGENT_REQ_DIR}" ] && [ -d "${AGENT_RESP_DIR}" ]; then
  AGENT_DROP_STATE="✅ READY (req/ resp/)"
else
  AGENT_DROP_STATE="❌ NOT FOUND — host must run: pnpm vulpy hermes up"
fi
if [ -f "${AGENT_SERVER_PID_FILE}" ]; then
  AGENT_SERVER_PID_VAL="$(cat "${AGENT_SERVER_PID_FILE}" 2>/dev/null || echo "?")"
else
  AGENT_SERVER_PID_VAL="none"
fi

# TCP + HTTP probes (run concurrently via background jobs)
probe_storefront_tcp=""
probe_medusa_tcp=""
probe_postgres_tcp=""
probe_storefront_http=""
probe_medusa_http=""

probe_storefront_tcp="$(probe_tcp "${DEV_HOST}" "${SHOP_PORT}")"
probe_medusa_tcp="$(probe_tcp "${DEV_HOST}" "${API_PORT}")"
probe_postgres_tcp="$(probe_tcp "${DB_HOST}" "${DB_PORT}")"
probe_storefront_http="$(probe_http "http://${DEV_HOST}:${SHOP_PORT}")"
probe_medusa_http="$(probe_http "http://${DEV_HOST}:${API_PORT}")"

# Log sizes
log_size_combined="$(wc -l < "${LOG_FILE}" 2>/dev/null || echo 0)"
log_size_medusa="$(wc -l < "${MEDUSA_LOG}" 2>/dev/null || echo 0)"
log_size_storefront="$(wc -l < "${STOREFRONT_LOG}" 2>/dev/null || echo 0)"

# ---------------------------------------------------------------------------
# Compose environment probes (staging/live)
# Only attempted when docker is available (host context).
# ---------------------------------------------------------------------------

compose_section() {
  local name="$1"
  local env_log_dir="${ROOT_DIR}/.tmp/${name}"
  # When docker is available, check container status.
  if command -v docker >/dev/null 2>&1; then
    local project
    project="$(load_kv "${ROOT_DIR}/environments/${name}/.env" COMPOSE_PROJECT_NAME 2>/dev/null || echo "")"
    project="${project:-vulpy-commerce-${name}}"
    local running
    running="$(docker compose -p "${project}" ps --format json 2>/dev/null | \
      python3 -c "
import json,sys
lines=[l for l in sys.stdin.read().splitlines() if l.strip()]
services=[]
for l in lines:
  try:
    s=json.loads(l)
    services.append(f\"{s.get('Name','?')} [{s.get('State','?')}]\")
  except: pass
print(', '.join(services) if services else 'no containers')
" 2>/dev/null || echo "docker query failed")"
    echo "- Containers: ${running}"

    # Fetch recent logs from running containers into .tmp/<env>/ so Fox can read them.
    mkdir -p "${env_log_dir}"
    for svc in medusa storefront; do
      local lf="${env_log_dir}/${svc}.log"
      docker compose -p "${project}" logs --no-log-prefix --tail=500 "${svc}" \
        > "${lf}" 2>/dev/null || true
      local sz; sz="$(wc -l < "${lf}" 2>/dev/null || echo 0)"
      echo "- ${svc} log: .tmp/${name}/${svc}.log (${sz} lines, last fetch: $(ts))"
    done
  else
    echo "- Containers: (docker not available in this context)"
    # Fox path: show files if they were previously fetched by a host run.
    if [ -d "${env_log_dir}" ]; then
      for svc in medusa storefront; do
        local lf="${env_log_dir}/${svc}.log"
        if [ -f "${lf}" ]; then
          local sz; sz="$(wc -l < "${lf}" 2>/dev/null || echo 0)"
          echo "- ${svc} log: .tmp/${name}/${svc}.log (${sz} lines — run 'pnpm vulpy agent status' on the host to refresh)"
        else
          echo "- ${svc} log: not yet fetched (run 'pnpm vulpy agent status' on the host)"
        fi
      done
    else
      echo "- Logs: .tmp/${name}/ does not exist yet"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Write output
# ---------------------------------------------------------------------------

# Disk usage (Fox container) — computed BEFORE the here-doc so the
# assignments actually execute (inside the here-doc they would be emitted
# as markdown text and HERMES_DISK_ROOT would stay unbound under set -u).
HERMES_DISK_ROOT="${HERMES_WORKSPACE_PATH:-/app/workspace}"
DISK_ROOT_USAGE=$(df -h "${HERMES_DISK_ROOT}" 2>/dev/null | tail -1 | awk '{print $3 " / " $2 " (" $5 " used)"}' || echo "n/a")
DISK_ROOT_AVAIL=$(df -h "${HERMES_DISK_ROOT}" 2>/dev/null | tail -1 | awk '{print $4}' || echo "?")
WORKSPACE_SIZE=$(du -sh "${HERMES_DISK_ROOT}" 2>/dev/null | cut -f1 || echo "n/a")
NODE_MODULES_SIZE=$(du -sh "${HERMES_DISK_ROOT}/node_modules" 2>/dev/null | cut -f1 || echo "n/a")
DATA_DIR_SIZE=$(du -sh "${HERMES_DISK_ROOT}/.data" 2>/dev/null | cut -f1 || echo "n/a")
LOG_DIR_SIZE=$(du -sh "${HERMES_DISK_ROOT}/.tmp" 2>/dev/null | cut -f1 || echo "n/a")

{
cat <<HEADER
# Vulpy Commerce — Agent Status
Generated at: ${GENERATED_AT}
Context: $([ -f /.dockerenv ] && echo "Hermes Fox container" || echo "host")

> Read-only snapshot. No secrets. Run \`pnpm vulpy agent status\` to refresh.

---

## Dev environment

| Field | Value |
|-------|-------|
| State | ${DEV_STATE} |
| PID | ${DEV_PID} |
| Status updated | ${STATUS_UPDATED} |
| Storefront port | ${SHOP_PORT} |
| Medusa port | ${API_PORT} |
| Postgres host:port | ${DB_HOST}:${DB_PORT} |

### TCP reachability (from $([ -f /.dockerenv ] && echo "Fox container" || echo "host"))

| Service | TCP | HTTP |
|---------|-----|------|
| Storefront :${SHOP_PORT} | ${probe_storefront_tcp} | ${probe_storefront_http} |
| Medusa :${API_PORT} | ${probe_medusa_tcp} | ${probe_medusa_http} |
| Postgres :${DB_PORT} | ${probe_postgres_tcp} | — |

### Log files

| File | Lines | Path |
|------|-------|------|
| combined | ${log_size_combined} | .tmp/dev/dev.log |
| medusa | ${log_size_medusa} | .tmp/dev/medusa.log |
| storefront | ${log_size_storefront} | .tmp/dev/storefront.log |

### Disk usage (Fox container)

| Path | Size | Notes |
|-----|------|-------|
| Root partition | ${DISK_ROOT_USAGE} | ${DISK_ROOT_AVAIL} avail |
| workspace | ${WORKSPACE_SIZE} | bind mount |
| node_modules | ${NODE_MODULES_SIZE} | build cache |
| .data | ${DATA_DIR_SIZE} | docker volumes |
| .tmp | ${LOG_DIR_SIZE} | logs |

### Agent command server

| Field | Value |
|-------|-------|
| Request dir (Fox-owned) | ${AGENT_REQ_DIR} |
| Response dir (daemon-owned) | ${AGENT_RESP_DIR} |
| Status | ${AGENT_DROP_STATE} |
| Server PID | ${AGENT_SERVER_PID_VAL} |
| How to use (from Fox) | \`pnpm vulpy agent cmd <cmd>\` |
| How to start (on host) | \`pnpm vulpy hermes up\` |
| Scope | dev.up/down/restart/wake/sleep, dev.status, dev.logs*, status |

**Allowed commands:**
- \`dev.up\` / \`dev.down\` / \`dev.restart\` / \`dev.wake\` / \`dev.sleep\`
- \`dev.status\` / \`dev.logs\` / \`dev.logs-medusa\` / \`dev.logs-storefront\`
- \`status\`

> env.* and hermes.* commands are human-only — not available to Fox.

### Last 20 lines — medusa.log

\`\`\`
HEADER

tail_log "${MEDUSA_LOG}" 20

cat <<STOREFRONT_HEADER
\`\`\`

### Last 20 lines — storefront.log

\`\`\`
STOREFRONT_HEADER

tail_log "${STOREFRONT_LOG}" 20

echo '```'

# Staging / live sections (host only; in Hermes these show log mount state)
for env_name in staging live; do
  env_dir="${ROOT_DIR}/environments/${env_name}"
  if [ -d "${env_dir}" ]; then
    echo ""
    echo "---"
    echo ""
    echo "## ${env_name} environment"
    echo ""
    compose_section "${env_name}"
  fi
done

} > "${OUTPUT}"

echo "Agent status written to: ${OUTPUT}"
