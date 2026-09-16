#!/usr/bin/env bash
# hermes-rebuild-bridge.sh --wait mode tests.
#
# Standalone: bash scripts/tests/hermes-rebuild-bridge-wait.sh
#
# Covers the queued/waiter flow added for the hermes.rebuild.wait bridge
# command: queue when a WebUI session is active, timeout without launching,
# launch when idle, and the unchanged no-arg behavior.
#
# Isolation: every case runs with DATA_DIR pointed at a fresh mktemp -d
# (absolute path → honored by scripts/lib/project-env.sh) and VULPY_ENV_FILE
# pinned to /dev/null so environments/*.env cannot re-point DATA_DIR at a real
# install. assert_sessions_dir_isolated() re-sources project-env.sh with the
# same env vars the bridge uses and proves a root .env cannot clobber the temp
# DATA_DIR — if it ever does, the suite exits loudly BEFORE touching anything.
# The detached waiter processes spawned by the queue path are tracked by the
# exact pid printed in the queued message and killed in cleanup — never a
# global pkill (a real queued waiter could be running on a production host).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRIDGE="scripts/hermes-rebuild-bridge.sh"

FAILED=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

# ---------------------------------------------------------------------------
# W2: prove the temp DATA_DIR is honored end to end. scripts/lib/project-env.sh
# sources a root .env unconditionally; if that file sets DATA_DIR, the per-case
# temp override would be lost and the suite could touch the REAL sessions dir.
# VULPY_ENV_FILE=/dev/null only neutralizes environments/*.env (`-f /dev/null`
# is false), so the root .env is the remaining clobber source. Replicate the
# bridge's source step (same env vars) in a subshell and compare the resolved
# DATA_DIR before any case touches its sessions dir.
# ---------------------------------------------------------------------------
assert_sessions_dir_isolated() {
  local expected="$1" resolved
  resolved="$(
    cd "${ROOT}"
    DATA_DIR="${expected}" VULPY_ENV_FILE=/dev/null VULPY_ENV=hermes \
      bash -c 'source scripts/lib/project-env.sh >/dev/null 2>&1; printf "%s" "${DATA_DIR}"'
  )"
  if [ "${resolved}" != "${expected}" ]; then
    echo "FATAL: DATA_DIR resolved to '${resolved}', expected '${expected}' — a root .env (${ROOT}/.env) or env file is overriding it; refusing to run (never touch real session data)" >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# W3: waiter cleanup tracks the EXACT pid the bridge prints in the queued
# message. Never pkill globally — a real queued waiter could be running on a
# production host. If the pid cannot be parsed, warn and leave it alone.
# ---------------------------------------------------------------------------
WAITER_PIDS=()
LAST_WAITER_PID=""

# Appends the waiter pid to WAITER_PIDS (must be called in the MAIN shell —
# inside $(...) it would run in a subshell and the append would be lost) and
# stores it in LAST_WAITER_PID. Warns and returns 1 when unparseable.
record_waiter_pid() {
  local msg="$1" pid
  pid="$(sed -n 's/.*waiter pid: \([0-9][0-9]*\).*/\1/p' <<<"${msg}" | head -1)"
  if [ -z "${pid}" ]; then
    echo "WARNING: could not parse waiter pid from queued message; leaving any waiter untouched (no pkill): ${msg}" >&2
    LAST_WAITER_PID=""
    return 1
  fi
  WAITER_PIDS+=("${pid}")
  LAST_WAITER_PID="${pid}"
}

waiter_gone() {
  # $1: waiter pid (empty → read-only pgrep fallback, never a kill)
  local pid="$1"
  if [ -n "${pid}" ]; then
    ! ps -p "${pid}" >/dev/null 2>&1
  else
    ! pgrep -f 'hermes-rebuild-bridge[.]sh --wait' >/dev/null 2>&1
  fi
}

kill_waiter() {
  local pid="$1" i
  if ! ps -p "${pid}" >/dev/null 2>&1; then return 0; fi
  kill "${pid}" 2>/dev/null || true
  for i in $(seq 1 20); do
    ps -p "${pid}" >/dev/null 2>&1 || return 0
    sleep 0.25
  done
  echo "WARNING: waiter pid ${pid} still alive after SIGTERM; leaving it (no pkill)" >&2
}

cleanup_waiters() {
  local pid
  for pid in "${WAITER_PIDS[@]+"${WAITER_PIDS[@]}"}"; do
    kill_waiter "${pid}"
  done
  WAITER_PIDS=()
}

TMP="$(mktemp -d)"
trap 'cleanup_waiters; rm -rf "${TMP}"' EXIT

# ---------------------------------------------------------------------------
# Case A — --wait queues when a session is active.
# ---------------------------------------------------------------------------
echo "== Case A: --wait queues when a session is active =="
{
  d="${TMP}/case-a"
  mkdir -p "${d}"
  assert_sessions_dir_isolated "${d}"
  mkdir -p "${d}/state/webui/sessions"
  touch "${d}/state/webui/sessions/live.json"
  marker="${d}/marker"
  out="$(cd "${ROOT}" && DATA_DIR="${d}" VULPY_ENV_FILE=/dev/null \
    HERMES_REBUILD_CMD="touch ${marker}" HERMES_REBUILD_MAX_WAIT_MIN=0 \
    ACTIVE_WINDOW_MIN=15 bash "${BRIDGE}" --wait 2>&1)" && rc=0 || rc=$?
  [ "${rc}" -eq 0 ] || fail "Case A: expected exit 0, got ${rc}: ${out}"
  grep -q "queued" <<<"${out}" || fail "Case A: expected 'queued' in output: ${out}"
  record_waiter_pid "${out}" || true
  a_pid="${LAST_WAITER_PID}"
  [ ! -e "${marker}" ] || fail "Case A: marker must NOT exist right after queueing"
  if [ "${FAILED}" = 0 ]; then pass "Case A"; fi
}

# ---------------------------------------------------------------------------
# Case B — waiter times out cleanly (max wait 0 + active session).
# ---------------------------------------------------------------------------
echo "== Case B: waiter times out cleanly (max wait 0, active session) =="
{
  d="${TMP}/case-b"
  mkdir -p "${d}"
  assert_sessions_dir_isolated "${d}"
  mkdir -p "${d}/state/webui/sessions"
  touch "${d}/state/webui/sessions/live.json"
  marker="${d}/marker"
  cleanup_waiters
  out="$(cd "${ROOT}" && DATA_DIR="${d}" VULPY_ENV_FILE=/dev/null \
    HERMES_REBUILD_CMD="touch ${marker}" HERMES_REBUILD_MAX_WAIT_MIN=0 \
    ACTIVE_WINDOW_MIN=15 bash "${BRIDGE}" --wait 2>&1)" && rc=0 || rc=$?
  [ "${rc}" -eq 0 ] || fail "Case B: queue call should exit 0, got ${rc}: ${out}"
  record_waiter_pid "${out}" || true
  b_pid="${LAST_WAITER_PID}"

  # Wait for the waiter to write its timeout line (max wait 0 → quick).
  wlog=""
  for _ in $(seq 1 40); do
    wlog="$(ls -t "${d}"/logs/hermes-rebuild-wait-*.log 2>/dev/null | head -1 || true)"
    if [ -n "${wlog}" ] && grep -q "NOT launching" "${wlog}" 2>/dev/null; then break; fi
    sleep 0.25
  done
  [ -n "${wlog}" ] || fail "Case B: waiter log never appeared"
  if [ -n "${wlog}" ]; then
    grep -q "NOT launching" "${wlog}" || fail "Case B: waiter log lacks the timeout line: $(cat "${wlog}")"
    grep -q "exit 2" "${wlog}" || fail "Case B: waiter log lacks the exit 2 marker: $(cat "${wlog}")"
  fi
  [ ! -e "${marker}" ] || fail "Case B: marker must never appear (timeout must not launch)"
  # The waiter must actually be gone (it exited 2).
  for _ in $(seq 1 40); do
    waiter_gone "${b_pid}" && break
    sleep 0.25
  done
  waiter_gone "${b_pid}" || fail "Case B: waiter still running after timeout"
  if [ "${FAILED}" = 0 ]; then pass "Case B"; fi
}

# ---------------------------------------------------------------------------
# Case C — --wait with no active session launches immediately.
# ---------------------------------------------------------------------------
echo "== Case C: --wait with no active session launches immediately =="
{
  d="${TMP}/case-c"
  mkdir -p "${d}"
  assert_sessions_dir_isolated "${d}"
  mkdir -p "${d}/state/webui/sessions"
  marker="${d}/marker"
  cleanup_waiters
  out="$(cd "${ROOT}" && DATA_DIR="${d}" VULPY_ENV_FILE=/dev/null \
    HERMES_REBUILD_CMD="touch ${marker}" bash "${BRIDGE}" --wait 2>&1)" && rc=0 || rc=$?
  [ "${rc}" -eq 0 ] || fail "Case C: expected exit 0, got ${rc}: ${out}"
  grep -q "started:" <<<"${out}" || fail "Case C: expected 'started:' in output: ${out}"
  ok=0
  for _ in $(seq 1 20); do
    [ -e "${marker}" ] && { ok=1; break; }
    sleep 0.25
  done
  [ "${ok}" = 1 ] || fail "Case C: marker never appeared (launch did not run)"
  if [ "${FAILED}" = 0 ]; then pass "Case C"; fi
}

# ---------------------------------------------------------------------------
# Case D — no-arg behavior unchanged.
# ---------------------------------------------------------------------------
echo "== Case D: no-arg behavior unchanged =="
{
  # D1: active session → refusal, exit 1, and the resolved sessions dir must
  # be the TEMP dir (safety: the bridge must never operate on the real data
  # dir — the refusal's "active file" line proves where SESSIONS_DIR resolved).
  d="${TMP}/case-d1"
  mkdir -p "${d}"
  assert_sessions_dir_isolated "${d}"
  mkdir -p "${d}/state/webui/sessions"
  touch "${d}/state/webui/sessions/live.json"
  cleanup_waiters
  out="$(cd "${ROOT}" && DATA_DIR="${d}" VULPY_ENV_FILE=/dev/null \
    ACTIVE_WINDOW_MIN=15 bash "${BRIDGE}" 2>&1)" && rc=0 || rc=$?
  [ "${rc}" -eq 1 ] || fail "Case D1: expected exit 1, got ${rc}: ${out}"
  grep -q "REFUSING" <<<"${out}" || fail "Case D1: expected REFUSING: ${out}"
  grep -q "${d}/state/webui/sessions" <<<"${out}" \
    || fail "Case D1: sessions dir resolved OUTSIDE the temp DATA_DIR (safety)"

  # D2: idle → detached launch + marker.
  d2="${TMP}/case-d2"
  mkdir -p "${d2}"
  assert_sessions_dir_isolated "${d2}"
  mkdir -p "${d2}/state/webui/sessions"
  marker2="${d2}/marker"
  cleanup_waiters
  out="$(cd "${ROOT}" && DATA_DIR="${d2}" VULPY_ENV_FILE=/dev/null \
    HERMES_REBUILD_CMD="touch ${marker2}" bash "${BRIDGE}" 2>&1)" && rc=0 || rc=$?
  [ "${rc}" -eq 0 ] || fail "Case D2: expected exit 0, got ${rc}: ${out}"
  grep -q "started:" <<<"${out}" || fail "Case D2: expected 'started:' in output: ${out}"
  ok=0
  for _ in $(seq 1 20); do
    [ -e "${marker2}" ] && { ok=1; break; }
    sleep 0.25
  done
  [ "${ok}" = 1 ] || fail "Case D2: marker never appeared"
  if [ "${FAILED}" = 0 ]; then pass "Case D"; fi
}

# ---------------------------------------------------------------------------
# Case E — duplicate-waiter guard refuses a second queue.
# ---------------------------------------------------------------------------
echo "== Case E: duplicate-waiter guard refuses a second queue =="
{
  d="${TMP}/case-e"
  mkdir -p "${d}"
  assert_sessions_dir_isolated "${d}"
  mkdir -p "${d}/state/webui/sessions"
  touch "${d}/state/webui/sessions/live.json"
  marker="${d}/marker"
  cleanup_waiters
  # First queue with the DEFAULT max wait so the waiter stays alive polling
  # and the second call can observe it (a max-wait-0 waiter exits before the
  # next call, which would make this test racy).
  out1="$(cd "${ROOT}" && DATA_DIR="${d}" VULPY_ENV_FILE=/dev/null \
    HERMES_REBUILD_CMD="touch ${marker}" ACTIVE_WINDOW_MIN=15 \
    bash "${BRIDGE}" --wait 2>&1)" && rc1=0 || rc1=$?
  [ "${rc1}" -eq 0 ] || fail "Case E: first queue should exit 0, got ${rc1}: ${out1}"
  grep -q "queued" <<<"${out1}" || fail "Case E: first queue should print 'queued': ${out1}"
  record_waiter_pid "${out1}" || true
  e_pid="${LAST_WAITER_PID}"

  # Second queue while the first waiter is alive → refusal (and $$ exclusion:
  # the second call's own argv also matches, but must not be counted).
  out2="$(cd "${ROOT}" && DATA_DIR="${d}" VULPY_ENV_FILE=/dev/null \
    HERMES_REBUILD_CMD="touch ${marker}" ACTIVE_WINDOW_MIN=15 \
    bash "${BRIDGE}" --wait 2>&1)" && rc2=0 || rc2=$?
  [ "${rc2}" -eq 1 ] || fail "Case E: duplicate queue should exit 1, got ${rc2}: ${out2}"
  grep -q "already queued" <<<"${out2}" || fail "Case E: expected 'already queued' refusal: ${out2}"
  [ ! -e "${marker}" ] || fail "Case E: marker must not exist while queued"
  # Cleanup: kill exactly the recorded waiter pid, then prove it exited.
  cleanup_waiters
  waiter_gone "${e_pid}" || fail "Case E: waiter still alive after cleanup kill"
  if [ "${FAILED}" = 0 ]; then pass "Case E"; fi
}

# ---------------------------------------------------------------------------
# Case F — Guard 2 (double launch) refusal, immediate path + waiter re-check.
# The fake rebuild is a background process whose argv looks like
# vulpy-hermes-rebuild.sh (exec -a renames the sleep; same pid, so $! is the
# pid to kill).
# ---------------------------------------------------------------------------
echo "== Case F: Guard 2 (double launch) refusal =="
{
  fake_rebuild_pid=""

  start_fake_rebuild() {
    bash -c 'exec -a vulpy-hermes-rebuild.sh sleep 120' &
    fake_rebuild_pid=$!
  }

  stop_fake_rebuild() {
    if [ -n "${fake_rebuild_pid}" ] && ps -p "${fake_rebuild_pid}" >/dev/null 2>&1; then
      kill "${fake_rebuild_pid}" 2>/dev/null || true
      wait "${fake_rebuild_pid}" 2>/dev/null || true
    fi
    fake_rebuild_pid=""
  }

  # F1: no-arg bridge with a rebuild already running → explicit exit 1,
  # REFUSING, no "started:" (W1: `if ! launch_rebuild; then exit 1`).
  d1="${TMP}/case-f1"
  mkdir -p "${d1}"
  assert_sessions_dir_isolated "${d1}"
  start_fake_rebuild
  out="$(cd "${ROOT}" && DATA_DIR="${d1}" VULPY_ENV_FILE=/dev/null \
    ACTIVE_WINDOW_MIN=15 bash "${BRIDGE}" 2>&1)" && rc=0 || rc=$?
  stop_fake_rebuild
  [ "${rc}" -eq 1 ] || fail "Case F1: expected exit 1, got ${rc}: ${out}"
  grep -q "REFUSING" <<<"${out}" || fail "Case F1: expected REFUSING: ${out}"
  grep -q "already running" <<<"${out}" || fail "Case F1: expected double-launch refusal: ${out}"
  grep -q "started:" <<<"${out}" && fail "Case F1: must NOT print 'started:'"
  if [ "${FAILED}" = 0 ]; then pass "Case F1"; fi

  # F2: --wait with an IDLE sessions dir still goes through the immediate
  # path's launch_rebuild → Guard 2 → explicit exit 1.
  d2="${TMP}/case-f2"
  mkdir -p "${d2}"
  assert_sessions_dir_isolated "${d2}"
  mkdir -p "${d2}/state/webui/sessions"
  start_fake_rebuild
  out="$(cd "${ROOT}" && DATA_DIR="${d2}" VULPY_ENV_FILE=/dev/null \
    ACTIVE_WINDOW_MIN=15 bash "${BRIDGE}" --wait 2>&1)" && rc=0 || rc=$?
  stop_fake_rebuild
  [ "${rc}" -eq 1 ] || fail "Case F2: expected exit 1, got ${rc}: ${out}"
  grep -q "REFUSING" <<<"${out}" || fail "Case F2: expected REFUSING: ${out}"
  grep -q "already running" <<<"${out}" || fail "Case F2: expected double-launch refusal: ${out}"
  grep -q "started:" <<<"${out}" && fail "Case F2: must NOT print 'started:'"
  if [ "${FAILED}" = 0 ]; then pass "Case F2"; fi

  # F3: waiter-side Guard 2 re-check. Queue with a FRESH session file (active
  # → the waiter queues), start the fake rebuild AFTER queueing, then age the
  # session file past the idle window so the waiter sees idle — its Guard 2
  # re-check must refuse and exit 1 without launching. Whether the waiter's
  # first poll sees the fresh file (sleeps 30 s, refuses on the second poll)
  # or the already-aged file (refuses on the first poll), it must converge on
  # the same refusal.
  d3="${TMP}/case-f3"
  mkdir -p "${d3}"
  assert_sessions_dir_isolated "${d3}"
  mkdir -p "${d3}/state/webui/sessions"
  touch "${d3}/state/webui/sessions/live.json"
  marker="${d3}/marker"
  out3="$(cd "${ROOT}" && DATA_DIR="${d3}" VULPY_ENV_FILE=/dev/null \
    HERMES_REBUILD_CMD="touch ${marker}" ACTIVE_WINDOW_MIN=15 \
    bash "${BRIDGE}" --wait 2>&1)" && rc3=0 || rc3=$?
  [ "${rc3}" -eq 0 ] || fail "Case F3: queue call should exit 0, got ${rc3}: ${out3}"
  grep -q "queued" <<<"${out3}" || fail "Case F3: expected 'queued': ${out3}"
  record_waiter_pid "${out3}" || true
  f3_pid="${LAST_WAITER_PID}"
  start_fake_rebuild
  # Age the session file so the waiter's next poll sees idle.
  touch -d '20 minutes ago' "${d3}/state/webui/sessions/live.json"

  # The waiter refuses within its first poll (aged file) or after its 30 s
  # sleep (second poll) — give it up to ~50 s.
  wlog3=""
  for _ in $(seq 1 200); do
    wlog3="$(ls -t "${d3}"/logs/hermes-rebuild-wait-*.log 2>/dev/null | head -1 || true)"
    if [ -n "${wlog3}" ] && grep -q "a rebuild started meanwhile" "${wlog3}" 2>/dev/null; then break; fi
    sleep 0.25
  done
  [ -n "${wlog3}" ] || fail "Case F3: waiter log never appeared"
  grep -q "a rebuild started meanwhile" "${wlog3}" || fail "Case F3: wait log lacks the Guard-2 refusal: $(cat "${wlog3}")"
  grep -q "REFUSING rebuild — a rebuild is already running" "${wlog3}" || fail "Case F3: wait log lacks the Guard-2 REFUSING line: $(cat "${wlog3}")"
  grep -q "NOT launching (exit 1)" "${wlog3}" || fail "Case F3: wait log lacks the exit 1 marker: $(cat "${wlog3}")"
  [ ! -e "${marker}" ] || fail "Case F3: marker must not exist (Guard 2 refused the launch)"
  # The waiter must actually be gone (it exited 1).
  for _ in $(seq 1 40); do
    waiter_gone "${f3_pid}" && break
    sleep 0.25
  done
  waiter_gone "${f3_pid}" || fail "Case F3: waiter still running after Guard-2 refusal"
  stop_fake_rebuild
  if [ "${FAILED}" = 0 ]; then pass "Case F3"; fi
}

# ---------------------------------------------------------------------------
# Case G — S2: non-numeric HERMES_REBUILD_MAX_WAIT_MIN is refused by the
# waiter with a clear message (no arithmetic crash, no launch).
# ---------------------------------------------------------------------------
echo "== Case G: invalid max-wait budget refused =="
{
  d="${TMP}/case-g"
  mkdir -p "${d}"
  assert_sessions_dir_isolated "${d}"
  mkdir -p "${d}/state/webui/sessions"
  touch "${d}/state/webui/sessions/live.json"
  marker="${d}/marker"
  out="$(cd "${ROOT}" && DATA_DIR="${d}" VULPY_ENV_FILE=/dev/null \
    HERMES_REBUILD_CMD="touch ${marker}" HERMES_REBUILD_MAX_WAIT_MIN=banana \
    ACTIVE_WINDOW_MIN=15 bash "${BRIDGE}" --wait 2>&1)" && rc=0 || rc=$?
  [ "${rc}" -eq 0 ] || fail "Case G: queue call should exit 0, got ${rc}: ${out}"
  grep -q "queued" <<<"${out}" || fail "Case G: expected 'queued': ${out}"
  record_waiter_pid "${out}" || true
  g_pid="${LAST_WAITER_PID}"

  wlog=""
  for _ in $(seq 1 40); do
    wlog="$(ls -t "${d}"/logs/hermes-rebuild-wait-*.log 2>/dev/null | head -1 || true)"
    if [ -n "${wlog}" ] && grep -q "invalid HERMES_REBUILD_MAX_WAIT_MIN" "${wlog}" 2>/dev/null; then break; fi
    sleep 0.25
  done
  [ -n "${wlog}" ] || fail "Case G: waiter log never appeared"
  if [ -n "${wlog}" ]; then
    grep -q "invalid HERMES_REBUILD_MAX_WAIT_MIN 'banana'" "${wlog}" \
      || fail "Case G: log lacks the invalid-budget line: $(cat "${wlog}")"
    grep -q "exit 1" "${wlog}" || fail "Case G: log lacks the exit 1 marker: $(cat "${wlog}")"
  fi
  [ ! -e "${marker}" ] || fail "Case G: marker must not exist (refused, not launched)"
  # The waiter must actually be gone (it exited 1).
  for _ in $(seq 1 40); do
    waiter_gone "${g_pid}" && break
    sleep 0.25
  done
  waiter_gone "${g_pid}" || fail "Case G: waiter still running after refusal"
  if [ "${FAILED}" = 0 ]; then pass "Case G"; fi
}

# ---------------------------------------------------------------------------
if [ "${FAILED}" = 0 ]; then
  echo "ALL PASS: hermes-rebuild-bridge-wait"
  exit 0
fi
echo "SOME FAILED"
exit 1
