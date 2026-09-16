#!/usr/bin/env bash
# Dev shop app servers — run on the HOST (not inside Hermes).
#
# Started by: pnpm vulpy dev up
# Fox reaches these via host.docker.internal; Caddy / Fox Tailscale serve proxy here.
# Ports come from install / cloud rollout (VULPY_SHOP_PORT / VULPY_API_PORT).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="${VULPY_DEV_WORKSPACE:-${ROOT_DIR}}"
RUN_DIR="${WORKSPACE}/.tmp/dev"
LOG_FILE="${RUN_DIR}/dev.log"
MEDUSA_LOG="${RUN_DIR}/medusa.log"
STOREFRONT_LOG="${RUN_DIR}/storefront.log"
PID_FILE="${RUN_DIR}/dev.pid"
STATUS_FILE="${RUN_DIR}/status.json"
DESIRED_FILE="${RUN_DIR}/desired-state"
AGENT_SERVER_PID="${RUN_DIR}/agent-cmd-server.pid"
AGENT_SERVER_SCRIPT="${ROOT_DIR}/scripts/vulpy-agent-cmd-server.py"
AGENT_SERVER_LOG="${RUN_DIR}/agent-cmd-server.log"

# Load ports written by install (dev + hermes + root).
load_kv() {
  local file="$1" key="$2"
  [ -f "${file}" ] || return 0
  grep -E "^${key}=" "${file}" 2>/dev/null | head -1 | cut -d= -f2- || true
}

SHOP_PORT="${VULPY_SHOP_PORT:-$(load_kv "${ROOT_DIR}/environments/dev/.env" VULPY_SHOP_PORT)}"
SHOP_PORT="${SHOP_PORT:-$(load_kv "${ROOT_DIR}/environments/hermes/.env" HERMES_DEV_STOREFRONT_PORT)}"
SHOP_PORT="${SHOP_PORT:-3000}"

API_PORT="${VULPY_API_PORT:-$(load_kv "${ROOT_DIR}/environments/dev/.env" VULPY_API_PORT)}"
API_PORT="${API_PORT:-$(load_kv "${ROOT_DIR}/environments/hermes/.env" HERMES_DEV_MEDUSA_PORT)}"
API_PORT="${API_PORT:-9000}"

DB_HOST="${VULPY_DEV_DB_HOST:-127.0.0.1}"
DB_PORT="${VULPY_DEV_DB_PORT:-$(load_kv "${ROOT_DIR}/environments/dev/.env" POSTGRES_PORT)}"
DB_PORT="${DB_PORT:-5432}"
REDIS_PORT="${VULPY_DEV_REDIS_PORT:-$(load_kv "${ROOT_DIR}/environments/dev/.env" REDIS_PORT)}"
REDIS_PORT="${REDIS_PORT:-6379}"

cd "${WORKSPACE}"
mkdir -p "${RUN_DIR}"
# Lock fd for lifecycle serialization (see lock_dev). Opened once so a
# wake (stop+start) holds the lock for its whole run.
exec 9>"${RUN_DIR}/dev.lock"

export DATABASE_URL="${DATABASE_URL:-postgres://medusa:medusa@${DB_HOST}:${DB_PORT}/medusa}"
export PAYLOAD_DATABASE_URL="${PAYLOAD_DATABASE_URL:-postgres://medusa:medusa@${DB_HOST}:${DB_PORT}/payload}"
export DATABASE_URI="${DATABASE_URI:-${PAYLOAD_DATABASE_URL}}"
export REDIS_URL="${REDIS_URL:-redis://${DB_HOST}:${REDIS_PORT}}"
export PORT="${SHOP_PORT}"
export MEDUSA_PORT="${API_PORT}"
export PORT_MEDUSA="${API_PORT}"
# Do not export MEDUSA_BACKEND_URL into the shared turbo process: Medusa must keep the
# public/edge URL from apps/medusa-backend/.env (Vite allowedHosts + admin SPA). Storefront
# uses loopback via apps/storefront/.env (set by install).
export ALLOWED_DEV_ORIGINS="${ALLOWED_DEV_ORIGINS:-${VULPY_DEV_ALLOWED_ORIGINS:-}}"
export HOSTNAME="${HOSTNAME:-127.0.0.1}"

require_node() {
  # VULPY_DEV_NODE lets the operator pin the dev runtime (e.g. a Node 22 LTS
  # binary at /opt/node22/bin/node) when the host default node is too new for
  # the pinned Next version. The override takes priority; fall back to PATH.
  local node_cmd=""
  if [ -n "${VULPY_DEV_NODE:-}" ]; then
    if [ -x "${VULPY_DEV_NODE}" ]; then
      node_cmd="${VULPY_DEV_NODE}"
    else
      echo "[dev] ERROR: VULPY_DEV_NODE is set but not executable: ${VULPY_DEV_NODE}" >&2
      exit 1
    fi
  elif command -v node >/dev/null 2>&1; then
    node_cmd="node"
  else
    echo "[dev] ERROR: node is not available on the host." >&2
    echo "[dev]   Install Node 22 LTS (recommended for this storefront stack) or" >&2
    echo "[dev]   set VULPY_DEV_NODE=/path/to/node22/bin/node." >&2
    exit 1
  fi
  # Resolve to an absolute path so PATH changes (pnpm re-execs) keep working.
  if command -v realpath >/dev/null 2>&1; then
    node_cmd="$(realpath "${node_cmd}")"
  fi
  export VULPY_DEV_NODE_RESOLVED="${node_cmd}"
  # Make the resolved node win for child processes (turbo/pnpm/next spawn via
  # `env node` in their shebangs). Prepending its dir to PATH covers every
  # re-exec without touching the rest of the environment.
  export PATH="$(dirname "${node_cmd}"):${PATH}"
}

wait_for_postgres() {
  echo "[dev] Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
  local i=0
  until node -e "
    const net = require('net');
    const s = net.connect(${DB_PORT}, '${DB_HOST}');
    s.on('connect', () => process.exit(0));
    s.on('error', () => process.exit(1));
    setTimeout(() => process.exit(1), 2000);
  " 2>/dev/null; do
    sleep 2
    i=$((i + 2))
    if [ "${i}" -ge 120 ]; then
      echo "[dev] ERROR: PostgreSQL is not reachable. Run: pnpm vulpy dev up" >&2
      exit 1
    fi
  done
}

# Write .tmp/dev/status.json — readable by Fox without ps/docker.
write_status() {
  local state="$1"
  local pid="${2:-}"
  # Keep the desired-state marker in sync (default: keep current desired value).
  case "${state}" in
    starting|running|degraded) set_desired running ;;
    stopped)                   set_desired stopped ;;
  esac
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat > "${STATUS_FILE}" <<JSON
{
  "state": "${state}",
  "pid": ${pid:-null},
  "shop_port": ${SHOP_PORT},
  "api_port": ${API_PORT},
  "db_host": "${DB_HOST}",
  "db_port": ${DB_PORT},
  "log": "${LOG_FILE}",
  "medusa_log": "${MEDUSA_LOG}",
  "storefront_log": "${STOREFRONT_LOG}",
  "updated_at": "${ts}"
}
JSON
}

# Desired state: what SHOULD be running, from the operator's last explicit
# lifecycle action. Watchdog reads this instead of guessing intent.
set_desired() {
  mkdir -p "${RUN_DIR}" 2>/dev/null || true
  if [ "$1" != "$(get_desired)" ]; then
    printf '%s\n' "$1" > "${DESIRED_FILE}" 2>/dev/null || true
    chmod 664 "${DESIRED_FILE}" 2>/dev/null || true
  fi
}

get_desired() {
  local v=""
  [ -f "${DESIRED_FILE}" ] && v="$(head -c 16 "${DESIRED_FILE}" 2>/dev/null | tr -d '[:space:]')"
  case "${v}" in
    running) echo "running" ;;
    stopped) echo "stopped" ;;
    *) echo "unknown" ;;
  esac
}

port_is_listening() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
}

ensure_workspace_readable() {
  # Turbo's input-hash walk aborts with a cryptic "I/O error: Permission denied"
  # when ANY file in the repo is unreadable by the dev user — typically files
  # created by the Hermes container agent (uid 999, tight modes). Detect and
  # auto-heal before spawning turbo so `dev wake/up` self-recovers.
  local unreadable
  unreadable="$(
    find "${WORKSPACE}" \( \
      -path '*/node_modules' -o -path '*/.pnpm-store' -o \
      -path '*/.next' -o -path '*/.medusa' -o -path '*/.data' -o \
      -path '*/.turbo' -o -path '*/.git/objects' -o -path '*/coverage' -o \
      -path '*/environments/*.env' -o -path '*/environments/*/.env' -o \
      -path '*/agent-cmds/resp' -o -path '*/.hermes' \
    \) -prune -o \
    \( -type d \( ! -readable -o ! -executable \) -o -type f ! -readable \) -print \
    2>/dev/null | head -20 || true
  )"
  if [ -n "${unreadable}" ]; then
    echo "[dev] WARN: unreadable paths (usually agent-created uid-999 files):"
    echo "${unreadable}" | sed 's/^/    /' | head -10
    echo "[dev] Auto-healing workspace ownership (repair-ownership) ..."
    if bash "${ROOT_DIR}/scripts/vulpy.sh" hermes repair-ownership >/dev/null 2>&1; then
      echo "[dev] Ownership repair OK"
    else
      echo "[dev] WARN: auto-repair failed — run on the host: pnpm vulpy hermes repair-ownership" >&2
    fi
  fi
}

status() {
  local pid=""
  if [ -f "${PID_FILE}" ]; then
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  fi
  if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
    if port_is_listening "${SHOP_PORT}" && port_is_listening "${API_PORT}"; then
      # TCP alone false-positives when orphaned tasks hold the ports while the
      # app is actually dead — wake would print "Already running" and do
      # nothing. When curl is available require a live /health (2xx/3xx).
      if command -v curl >/dev/null 2>&1; then
        local code
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
          "http://127.0.0.1:${SHOP_PORT}/health" 2>/dev/null || echo 000)"
        case "${code}" in
          2*|3*)
            echo "running (pid ${pid}) shop=:${SHOP_PORT} api=:${API_PORT}"
            return 0
            ;;
          *)
            echo "stale/partial (pid ${pid}) shop=:${SHOP_PORT} api=:${API_PORT} — /health not responding (http ${code})"
            return 1
            ;;
        esac
      fi
      echo "running (pid ${pid}) shop=:${SHOP_PORT} api=:${API_PORT}"
      return 0
    fi
    echo "stale/partial (pid ${pid}) shop=:${SHOP_PORT} api=:${API_PORT} — one or more app ports are not listening"
    return 1
  fi
  echo "stopped"
  return 1
}

stop_workspace_dev_procs() {
  # Tree-kill every dev-stack process scoped to this workspace. Turbo spawns
  # medusa/storefront tasks in SEPARATE process groups, so killing the setsid
  # leader's pgid alone orphans them holding ports 13100/19100 — the next start
  # then dies with EADDRINUSE. Walk /proc and scope by cwd so one tenant can
  # never stop another tenant (same pattern as the old stop_workspace_turbo).
  # Cwd matches the workspace OR any subdirectory of it (a stale `medusa start`
  # often runs with cwd apps/medusa-backend, not the repo root).
  local proc pid cmdline cwd
  local -a targets=()
  for proc in /proc/[0-9]*; do
    cwd="$(readlink "${proc}/cwd" 2>/dev/null || true)"
    case "${cwd}" in
      "${WORKSPACE}"|"${WORKSPACE}"/*) ;;
      *) continue ;;
    esac
    cmdline="$(tr '\0' ' ' <"${proc}/cmdline" 2>/dev/null || true)"
    case "${cmdline}" in
      *turbo*|*next*|*medusa*|*cli.js*|*watch-design*)
        pid="${proc##*/}"
        [ "${pid}" = "$$" ] && continue
        targets+=("${pid}")
        kill "${pid}" 2>/dev/null || true
        ;;
    esac
  done
  if [ "${#targets[@]}" -gt 0 ]; then
    sleep 3   # grace period for graceful shutdown
    for pid in "${targets[@]}"; do
      kill -0 "${pid}" 2>/dev/null && kill -9 "${pid}" 2>/dev/null || true
    done
  fi
}

wait_ports_free() {
  # After stop, wait until both app ports are released so the next start
  # cannot die with EADDRINUSE.
  local i=0
  while [ "${i}" -lt 15 ]; do
    if ! port_is_listening "${SHOP_PORT}" && ! port_is_listening "${API_PORT}"; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  echo "[dev] WARN: ports :${SHOP_PORT}/:${API_PORT} still busy after stop" >&2
  return 1
}

lock_dev() {
  # Serialize lifecycle ops: two concurrent wake cycles (watchdog timer +
  # agent-cmd server) must not race stop/start. The lock fd is opened once at
  # the top of the script and held for the whole run; flock -n fails fast if
  # another dev lifecycle op is in progress.
  if ! flock -n 9; then
    echo "[dev] another dev lifecycle op is in progress" >&2
    exit 1
  fi
}

stop() {
  lock_dev
  if [ -f "${PID_FILE}" ]; then
    local pid
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
      echo "[dev] Stopping host dev servers (pid ${pid})..."
      # New launches store the setsid process-group leader. The direct kill is a
      # compatibility fallback for older PID files that tracked only the logger.
      kill -- -"${pid}" 2>/dev/null || kill "${pid}" 2>/dev/null || true
      sleep 2
    fi
    rm -f "${PID_FILE}"
  fi
  stop_workspace_dev_procs
  wait_ports_free || true
  write_status "stopped"
}

# ---------------------------------------------------------------------------
# Agent command server — provides Fox container control over host processes.
# ---------------------------------------------------------------------------
agent_server_start() {
  if [ ! -f "${AGENT_SERVER_SCRIPT}" ]; then
    echo "[dev] WARN: agent command server script not found: ${AGENT_SERVER_SCRIPT}" >&2
    return 0
  fi
  if [ -f "${AGENT_SERVER_PID}" ] && kill -0 "$(cat "${AGENT_SERVER_PID}")" 2>/dev/null; then
    echo "[dev] Agent command server already running (pid $(cat "${AGENT_SERVER_PID}"))."
    return 0
  fi
  echo "[dev] Starting agent command server (socket: .tmp/vulpy-agent-cmd.sock)..."
  python3 "${AGENT_SERVER_SCRIPT}" >> "${AGENT_SERVER_LOG}" 2>&1 &
  local spid=$!
  echo "${spid}" > "${AGENT_SERVER_PID}"
  # Brief check that it didn't die immediately
  sleep 1
  if kill -0 "${spid}" 2>/dev/null; then
    echo "[dev] Agent command server started (pid ${spid})."
  else
    echo "[dev] WARN: Agent command server exited immediately — check ${AGENT_SERVER_LOG}" >&2
    rm -f "${AGENT_SERVER_PID}"
  fi
}

agent_server_stop() {
  if [ -f "${AGENT_SERVER_PID}" ]; then
    local spid
    spid="$(cat "${AGENT_SERVER_PID}")"
    if kill -0 "${spid}" 2>/dev/null; then
      echo "[dev] Stopping agent command server (pid ${spid})..."
      kill "${spid}" 2>/dev/null || true
      sleep 1
    fi
    rm -f "${AGENT_SERVER_PID}"
  fi
  # Remove the socket so Fox gets a clean error if it tries while server is down
  rm -f "${ROOT_DIR}/.tmp/vulpy-agent-cmd.sock"
}

start() {
  lock_dev
  require_node
  if status >/dev/null 2>&1; then
    echo "[dev] Already running. Use: $0 restart"
    return 0
  fi
  if [ -f "${PID_FILE}" ]; then
    echo "[dev] Cleaning stale or partial host dev process before restart..."
    stop
  fi
  ensure_workspace_readable
  # Port-squat guard: a process from a crashed/killed previous dev tree can
  # outlive its pid file and hold the app ports — turbo then dies at boot with
  # EADDRINUSE and the whole stack is down (seen live 2026-08-26: a prod-mode
  # `medusa start` orphan squatting :19100 killed every subsequent dev boot).
  # Clear our own leftovers first; if something FOREIGN still holds a port,
  # fail loudly instead of spawning a pipeline that cannot bind.
  if port_is_listening "${SHOP_PORT}" || port_is_listening "${API_PORT}"; then
    echo "[dev] Ports in use before start — clearing leftover dev processes..."
    stop_workspace_dev_procs
    wait_ports_free || {
      echo "[dev] ERROR: port(s) :${SHOP_PORT}/:${API_PORT} held by a foreign process" >&2
      echo "[dev] (not scoped to this workspace). Find it: sudo ss -tlnp | grep -E ':(${SHOP_PORT}|${API_PORT})'" >&2
      echo "[dev] Refusing to start into a port conflict — free the port and re-run." >&2
      exit 1
    }
  fi
  wait_for_postgres
  if [ ! -d "${WORKSPACE}/node_modules" ]; then
    echo "[dev] ERROR: node_modules missing — run pnpm install on the host first." >&2
    exit 1
  fi
  if [ -f "${ROOT_DIR}/.env" ]; then
    origins="$(grep -E '^ALLOWED_DEV_ORIGINS=' "${ROOT_DIR}/.env" | cut -d= -f2- || true)"
    if [ -n "${origins}" ]; then
      export ALLOWED_DEV_ORIGINS="${origins}"
      printf '%s\n' "${origins}" > "${RUN_DIR}/allowed-origins"
    fi
  fi

  write_status "starting"

  # Release the lifecycle lock BEFORE spawning the detached stack. The lock fd
  # (9) would otherwise be inherited by `setsid bash -c …`, making every later
  # stop/wake fail with "another dev lifecycle op is in progress" for as long
  # as the stack runs. The critical section (cleanup, port-free wait, spawn,
  # pid write) is already covered; after the spawn the new pipeline owns the
  # ports and a concurrent wake is equivalent to a normal restart.
  flock -u 9 2>/dev/null || true
  exec 9>&- 2>/dev/null || true

  echo "[dev] Starting host servers storefront=:${SHOP_PORT} medusa=:${API_PORT} (logs: ${LOG_FILE})..."
  # Turbo v2 resilience: on some installs the repo .turbo is root-owned
  # (install-time turbo run as root) and/or dev is spawned with an unwritable
  # HOME. Turbo writes its task cache + task logs under the cache dir and its
  # daemon state under $HOME — all three must be writable by the app user.
  if [ -d "${WORKSPACE}/.turbo" ] && [ ! -w "${WORKSPACE}/.turbo" ]; then
    mv "${WORKSPACE}/.turbo" "${WORKSPACE}/.turbo.orig-root-owned" 2>/dev/null || true
    mkdir -p "${WORKSPACE}/.turbo"
  fi
  export TURBO_CACHE_DIR="${TURBO_CACHE_DIR:-${WORKSPACE}/node_modules/.cache/turbo}"
  if [ -z "${HOME}" ] || [ ! -d "${HOME}" ] || [ ! -w "${HOME}" ]; then
    export HOME="${WORKSPACE}/.tmp/dev/home"
    mkdir -p "${HOME}"
  fi
  # The dev stack can be spawned with a stale XDG_RUNTIME_DIR left over from
  # another user's login session (e.g. /run/user/1000 while dev runs as uid
  # 1001). Turbo's daemon creates its socket there and dies with a path-less
  # "I/O error: Permission denied". Give dev processes their own runtime dir.
  export XDG_RUNTIME_DIR="${WORKSPACE}/.tmp/dev/xdg-runtime"
  mkdir -p "${XDG_RUNTIME_DIR}" && chmod 700 "${XDG_RUNTIME_DIR}"
  # CI=1 (inherited from the agent-server spawn env) makes turbo skip its
  # daemon and run in-process, which fails at task spawn with a path-less
  # "I/O error: Permission denied". The daemon path is the proven-working one.
  unset CI
  # Poisoned Turbopack cache guard: a crashed dev boot (Turbopack panic,
  # killed process, half-swapped tree) can leave .next/cache in a state where
  # EVERY subsequent boot wedges at "○ Compiling middleware ..." with no error.
  # The fix used to be a host-only `rm -rf apps/storefront/.next` — now the
  # wrapper (running as the store user, i.e. the .next owner) clears the
  # persistent cache itself on every start. Cheap, deterministic, and it makes
  # `agent cmd dev.restart` a self-healing recovery. Knob: VULPY_DEV_CLEAR_NEXT
  # = cache (default) | full | off.
  case "${VULPY_DEV_CLEAR_NEXT:-cache}" in
    full)
      rm -rf "${WORKSPACE}/apps/storefront/.next" 2>/dev/null \
        && echo "[dev] Cleared storefront .next (full)" \
        || echo "[dev] WARN: could not clear .next (host action may be needed)" >&2
      ;;
    off)
      ;;
    *)
      rm -rf "${WORKSPACE}/apps/storefront/.next/cache" 2>/dev/null \
        && echo "[dev] Cleared stale Turbopack cache (.next/cache)" \
        || echo "[dev] WARN: could not clear .next/cache (host action may be needed)" >&2
      ;;
  esac
  # Keep the complete turbo pipeline in one dedicated process group. The stored
  # PID is therefore the group leader, so restart/stop cannot hit another tenant.
  local awk_program
  awk_program='
    {
      print >> combined
      fflush(combined)
      if ($0 ~ /^@apps\/medusa-backend/) {
        print >> medusa_log
        fflush(medusa_log)
      } else if ($0 ~ /^@apps\/storefront/) {
        print >> storefront_log
        fflush(storefront_log)
      }
    }
  '
  setsid bash -c '
    set -o pipefail
    ./node_modules/.bin/turbo run dev --env-mode=loose 2>&1 |
      awk -v combined="$1" -v medusa_log="$2" -v storefront_log="$3" "$4"
  ' _ "${LOG_FILE}" "${MEDUSA_LOG}" "${STOREFRONT_LOG}" "${awk_program}" >/dev/null 2>&1 &

  local server_pid=$!
  echo "${server_pid}" > "${PID_FILE}"
  echo "[dev] Started (pid ${server_pid})."
  write_status "running" "${server_pid}"
}

# Wait for the storefront to actually finish booting. A poisoned Turbopack
# cache wedges AFTER "Ready" at "○ Compiling middleware" with no error — TCP is
# up, but every request hangs. We cannot tell that from the port alone, so we
# probe /health with a bounded timeout: a healthy boot answers within the
# window (cold boots take ~15-30s pulling the Payload schema), a wedged boot
# never answers.
wait_for_storefront_ready() {
  local deadline
  deadline=$(( $(date +%s) + 75 ))
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    if curl -fsS -m 5 -o /dev/null "http://127.0.0.1:${SHOP_PORT}/health" 2>/dev/null; then
      echo "[dev] Storefront ready (HTTP ${SHOP_PORT}/health OK)."
      return 0
    fi
    sleep 5
  done
  echo "[dev] Storefront did not become ready within 75s." >&2
  return 1
}

# Self-healing start: boot, and if the storefront wedges at middleware compile,
# clear the FULL .next (the poison lives outside .next/cache) and retry once.
# Knob: VULPY_DEV_STALL_GUARD=off skips the readiness wait (stub/sandbox envs
# where no real Next server can answer /health — e.g. the lifecycle test).
start_with_guard() {
  if [ "${VULPY_DEV_STALL_GUARD:-on}" != "on" ]; then
    start
    return $?
  fi
  start || return $?
  if ! wait_for_storefront_ready; then
    echo "[dev] Wedged boot detected — clearing full .next and retrying once..."
    stop
    VULPY_DEV_CLEAR_NEXT=full start
    if ! wait_for_storefront_ready; then
      echo "[dev] ERROR: storefront still not ready after full .next clear." >&2
      write_status "degraded"
      return 1
    fi
  fi
  return 0
}

case "${1:-start}" in
  start) start_with_guard ;;
  stop|sleep) stop ;;
  wake)
    stop
    start_with_guard
    ;;
  restart)
    stop
    start_with_guard
    ;;
  status) status ;;
  logs) tail -n 200 -f "${LOG_FILE}" ;;
  logs-medusa) tail -n 200 -f "${MEDUSA_LOG}" ;;
  logs-storefront) tail -n 200 -f "${STOREFRONT_LOG}" ;;
  agent-server)
    case "${2:-status}" in
      start)   agent_server_start ;;
      stop)    agent_server_stop  ;;
      restart) agent_server_stop; agent_server_start ;;
      status)
        if [ -f "${AGENT_SERVER_PID}" ] && kill -0 "$(cat "${AGENT_SERVER_PID}")" 2>/dev/null; then
          echo "running (pid $(cat "${AGENT_SERVER_PID}"))"
        else
          echo "stopped"
          exit 1
        fi
        ;;
      *) echo "Usage: $0 agent-server start|stop|restart|status" >&2; exit 1 ;;
    esac
    ;;
  *)
    echo "Usage: $0 start|stop|sleep|wake|restart|status|logs|logs-medusa|logs-storefront|agent-server" >&2
    exit 1
    ;;
esac
