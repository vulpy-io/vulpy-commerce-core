#!/usr/bin/env bash
# hermes-rebuild-bridge.sh — guarded, detached Hermes container rebuild.
#
# Bridge target for the agent-cmd whitelist commands `hermes.rebuild` and
# `hermes.rebuild.wait` (scripts/vulpy-agent-cmd-server.py). The agent-cmd
# server kills commands after 300 s, and a container rebuild takes minutes —
# so this wrapper only performs the guard checks, then launches the real
# rebuild DETACHED (setsid: its own session/process group), which the
# server's killpg timeout cannot reach.
#
# --wait mode (hermes.rebuild.wait):
#   Instead of refusing when a WebUI session is active, the bridge QUEUES: it
#   spawns a DETACHED waiter (setsid) that polls the session dir every 30 s
#   and launches the rebuild itself once the idle window opens. The immediate
#   call returns fast (exit 0, "queued — ..."); the waiting happens in the
#   detached host-side process, so no external watcher is needed.
#   If the idle window never opens within HERMES_REBUILD_MAX_WAIT_MIN minutes
#   (default 60), the waiter gives up (exit 2) and NEVER launches.
#   A queued rebuild lives in a HOST-SIDE DETACHED PROCESS: a host reboot or
#   agent-cmd server restart drops it silently and the rebuild never fires.
#   If you need a guarantee across reboots, run the host command yourself
#   (bash scripts/vulpy-hermes-rebuild.sh --force) or re-queue after boot.
#   The queued message prints the waiter pid — track it with `ps -p <pid>`.
#
# Guards (hard — no bypass flag):
#   1. Active WebUI session: if ANY file under ${DATA_DIR}/state/webui/sessions/
#      was modified within ACTIVE_WINDOW_MIN (default 15) minutes, a chat is
#      live — rebuilding would kill it. Without --wait: refuse (exit 1).
#      With --wait: queue instead (see above).
#   2. Double launch: if a vulpy-hermes-rebuild.sh process is already running,
#      refuse (exit 1). Both the immediate path and the waiter re-check this
#      right before launching.
#
# The real rebuild (scripts/vulpy-hermes-rebuild.sh --force) tees its full
# output to ${DATA_DIR}/logs/hermes-rebuild-*.log, mounted as
# /data/logs/hermes-rebuild-*.log inside the container (Fox-readable).
# The waiter logs its decisions to
# ${DATA_DIR}/logs/hermes-rebuild-wait-<ts>.log, mounted as
# /data/logs/hermes-rebuild-wait-<ts>.log (Fox-readable).
#
# Env overrides (testing / operator only):
#   ACTIVE_WINDOW_MIN            active-session window in minutes (default 15)
#   HERMES_REBUILD_CMD           command launched instead of the real rebuild
#                                (sandbox tests only — do NOT set in production)
#   HERMES_REBUILD_MAX_WAIT_MIN  how long the --wait waiter polls for the idle
#                                window before giving up (default 60; 0 = give
#                                up immediately — used by the tests)
#   HERMES_REBUILD_WAIT_MODE     internal: set to 1 by the immediate call when
#                                spawning the detached waiter; the waiter uses
#                                it to enter its polling loop and to make sure
#                                it never re-queues itself
#   HERMES_REBUILD_WAIT_LOG      internal: log path the waiter writes its
#                                decisions to (set by the immediate call so the
#                                queued message and the waiter log agree)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export VULPY_ENV=hermes
# shellcheck source=scripts/lib/project-env.sh
source "${ROOT_DIR}/scripts/lib/project-env.sh"

SESSIONS_DIR="${DATA_DIR}/state/webui/sessions"
ACTIVE_WINDOW_MIN="${ACTIVE_WINDOW_MIN:-15}"

# ---------------------------------------------------------------------------
# Args: --wait queues instead of refusing when a session is active.
# ---------------------------------------------------------------------------
WAIT_MODE=0
if [ "${1:-}" = "--wait" ]; then
  WAIT_MODE=1
  shift
fi

# ---------------------------------------------------------------------------
# Guard 1: is a WebUI session truly active?
# A live chat keeps writing its <session-id>.json, _index.json and journal
# entries, so any file touched within the window means an active session.
# NOTE: -mmin -N = "newer than N minutes" (GNU find's bare `-mmin N` means
# age rounded up to exactly N minutes — a fresh file matches -mmin 1, not
# -mmin 15, so the bare form would never detect a live chat).
# ---------------------------------------------------------------------------
session_active() {
  [ -d "${SESSIONS_DIR}" ] && \
    find "${SESSIONS_DIR}" -type f -mmin -"${ACTIVE_WINDOW_MIN}" -print -quit 2>/dev/null | grep -q .
}

refuse_active_session() {
  local active_file
  active_file="$(find "${SESSIONS_DIR}" -type f -mmin -"${ACTIVE_WINDOW_MIN}" -print -quit 2>/dev/null || true)"
  echo "hermes-rebuild-bridge: REFUSING rebuild — active WebUI session detected." >&2
  echo "  active file: ${active_file}" >&2
  echo "  window: ${ACTIVE_WINDOW_MIN} min (any session file touched within this window counts as live)" >&2
  echo "  host-side manual command: bash ${ROOT_DIR}/scripts/vulpy-hermes-rebuild.sh --force" >&2
}

# ---------------------------------------------------------------------------
# Guard 2: is a rebuild already running (no double launch)?
# Anchored to ".sh " or ".sh<end>" so the pattern cannot match an unrelated
# process that merely mentions the script name in its command line (e.g. a
# shell running a diagnostic grep, or the requesting agent's own argv).
# ---------------------------------------------------------------------------
rebuild_running() {
  pgrep -f 'vulpy-hermes-rebuild\.sh( |$)' >/dev/null 2>&1
}

refuse_double_launch() {
  echo "hermes-rebuild-bridge: REFUSING rebuild — a rebuild is already running." >&2
  echo "  check: pgrep -af vulpy-hermes-rebuild.sh" >&2
}

# ---------------------------------------------------------------------------
# launch_rebuild: Guard 2 re-check + detached launch + "started:" print.
# Shared by the immediate idle path and the waiter — no duplicated launch code.
# ---------------------------------------------------------------------------
launch_rebuild() {
  if rebuild_running; then
    refuse_double_launch
    return 1
  fi

  mkdir -p "${DATA_DIR}/logs"

  # Record the launch epoch BEFORE launching. The rebuild creates its own
  # timestamped log a few hundred milliseconds later; the LATEST_LOG
  # resolution below must only accept logs newer than this instant. Otherwise
  # a re-rebuild (logs already on disk) would resolve the PREVIOUS run's log
  # and Fox would tail the wrong run.
  local start_epoch
  start_epoch="$(date +%s)"

  # NOTE: the .out capture uses `>` (truncate per launch), not `>>`. It is NOT
  # a bootstrap-only capture: vulpy-hermes-rebuild.sh runs
  # `exec > >(tee -a LOG)`, which duplicates its full output to BOTH the
  # timestamped per-run log and this inherited stdout — so .out mirrors the
  # entire run, truncated per launch (bounded growth). The durable per-run
  # record is ${DATA_DIR}/logs/hermes-rebuild-<ts>.log; .out is just a
  # convenience mirror.
  if [ -n "${HERMES_REBUILD_CMD:-}" ]; then
    setsid bash -c "${HERMES_REBUILD_CMD}" \
      > "${DATA_DIR}/logs/hermes-rebuild-bridge.out" 2>&1 &
  else
    setsid bash "${ROOT_DIR}/scripts/vulpy-hermes-rebuild.sh" --force \
      > "${DATA_DIR}/logs/hermes-rebuild-bridge.out" 2>&1 &
  fi
  local pid=$!

  # Resolve the newest rebuild log created at/after the launch epoch
  # (race-free: a pre-launch log from a previous run can never match; the -1
  # slack covers a log created in the same second as START_EPOCH). Log names
  # are zero-padded timestamps (hermes-rebuild-YYYYMMDD-HHMMSS.log), so plain
  # `sort` is chronological and `tail -1` is the newest match. If the rebuild
  # has not created its log yet, print the honest fallback — never a stale log.
  local latest_log
  latest_log="$(find "${DATA_DIR}/logs" -maxdepth 1 -name 'hermes-rebuild-*.log' -newermt "@$((start_epoch - 1))" -print 2>/dev/null | sort | tail -1 || true)"
  if [ -n "${latest_log}" ]; then
    # map host path to in-container path for Fox
    echo "started: pid ${pid}; log: /data/logs/$(basename "${latest_log}")"
  else
    echo "started: pid ${pid}; log: /data/logs/hermes-rebuild-<ts>.log (not yet visible — the rebuild tees its own log)"
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Waiter mode (HERMES_REBUILD_WAIT_MODE=1): poll for the idle window, then
# launch. Runs as the detached setsid process spawned by the queue path below.
# This branch short-circuits BEFORE the queue path, so the waiter never
# re-queues itself even though its argv contains --wait.
# ---------------------------------------------------------------------------
if [ "${HERMES_REBUILD_WAIT_MODE:-}" = "1" ]; then
  MAX_WAIT_MIN="${HERMES_REBUILD_MAX_WAIT_MIN:-60}"
  if [ -n "${HERMES_REBUILD_WAIT_LOG:-}" ]; then
    WAIT_LOG="${HERMES_REBUILD_WAIT_LOG}"
  else
    WAIT_LOG="${DATA_DIR}/logs/hermes-rebuild-wait-$(date +%Y%m%d-%H%M%S).log"
  fi

  log() { echo "hermes-rebuild-wait: $*" >> "${WAIT_LOG}"; }

  mkdir -p "${DATA_DIR}/logs"
  # Refuse a non-numeric max-wait budget with a clear message instead of
  # aborting on the arithmetic error in the DEADLINE computation below.
  if ! [[ "${MAX_WAIT_MIN}" =~ ^[0-9]+$ ]]; then
    log "invalid HERMES_REBUILD_MAX_WAIT_MIN '${MAX_WAIT_MIN}' — refusing to wait (exit 1)"
    exit 1
  fi
  # Re-point our own stdout/stderr at the wait log in APPEND mode. The parent
  # spawns us with a non-append redirect (>), whose shared file offset would
  # let later stdout writes (e.g. launch_rebuild's "started:" line) OVERWRITE
  # earlier log lines from the start of the file.
  exec >> "${WAIT_LOG}" 2>&1
  log "waiter started (pid $$) — polling ${SESSIONS_DIR} every 30 s; idle window ${ACTIVE_WINDOW_MIN} min; max wait ${MAX_WAIT_MIN} min"

  # Deadline first: with a 0-minute budget any wait at all exceeds it, so the
  # waiter gives up immediately instead of sleeping and then failing (the
  # tests use HERMES_REBUILD_MAX_WAIT_MIN=0 to exercise the timeout fast).
  DEADLINE=$(( $(date +%s) + MAX_WAIT_MIN * 60 ))

  while :; do
    if [ "$(date +%s)" -ge "${DEADLINE}" ]; then
      log "giving up after ${MAX_WAIT_MIN} min — WebUI never idle for ${ACTIVE_WINDOW_MIN} min; NOT launching (exit 2)"
      exit 2
    fi

    if session_active; then
      log "session still active — sleeping 30 s"
      sleep 30
      continue
    fi

    # Idle window open — re-check Guard 2 before launching (a rebuild may
    # have started while we waited).
    if rebuild_running; then
      refuse_double_launch
      log "refusing — a rebuild started meanwhile (Guard 2); NOT launching (exit 1)"
      exit 1
    fi

    if launch_rebuild; then
      log "rebuild launched"
      exit 0
    fi
    log "launch failed (Guard 2) — NOT launching (exit 1)"
    exit 1
  done
fi

# ---------------------------------------------------------------------------
# Queue path: --wait + active session → spawn a detached waiter, exit 0 FAST.
# ---------------------------------------------------------------------------
if [ "${WAIT_MODE}" = "1" ] && session_active; then
  # Duplicate-waiter guard BEFORE queueing. Anchored to the --wait argv so it
  # only matches queued/active waiters. pgrep -f also sees OUR OWN argv (we
  # were invoked with --wait), so exclude the caller's own PID ($$).
  if pgrep -f 'hermes-rebuild-bridge\.sh --wait' | grep -v "^${$}$" | grep -q .; then
    echo "hermes-rebuild-bridge: REFUSING — a rebuild waiter is already queued." >&2
    echo "  check: pgrep -af hermes-rebuild-bridge.sh" >&2
    exit 1
  fi

  mkdir -p "${DATA_DIR}/logs"
  WAIT_LOG="${DATA_DIR}/logs/hermes-rebuild-wait-$(date +%Y%m%d-%H%M%S).log"

  # Detached waiter: own session (immune to the server's 300s killpg timeout),
  # stdout/stderr redirected to the wait log (host path). It inherits
  # HERMES_REBUILD_CMD (test seam) and writes its decisions to the SAME log
  # via HERMES_REBUILD_WAIT_LOG so the queued message below stays truthful.
  HERMES_REBUILD_WAIT_MODE=1 \
  HERMES_REBUILD_WAIT_LOG="${WAIT_LOG}" \
  HERMES_REBUILD_MAX_WAIT_MIN="${HERMES_REBUILD_MAX_WAIT_MIN:-60}" \
    setsid bash "${ROOT_DIR}/scripts/hermes-rebuild-bridge.sh" --wait \
      > "${WAIT_LOG}" 2>&1 &
  waiter_pid=$!

  # map host path to in-container path for Fox (same convention as LATEST_LOG);
  # the waiter pid lets operators track the queued rebuild (ps -p <pid>)
  echo "hermes-rebuild-bridge: queued — will rebuild when the WebUI has been idle for ${ACTIVE_WINDOW_MIN} min (max wait ${HERMES_REBUILD_MAX_WAIT_MIN:-60} min); log: /data/logs/$(basename "${WAIT_LOG}"); waiter pid: ${waiter_pid}"
  exit 0
fi

# ---------------------------------------------------------------------------
# Immediate path: no --wait (or --wait with no active session) — guard, then
# launch detached. Guard 2 surfaces as an EXPLICIT exit 1 (not a set -e side
# effect) so the refusal is self-documenting in any wrapper that checks $?.
# ---------------------------------------------------------------------------
if session_active; then
  refuse_active_session
  exit 1
fi

if ! launch_rebuild; then
  exit 1
fi
exit 0
