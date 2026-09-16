#!/usr/bin/env bash
# Contract test for the stale-state cleanup in scripts/vulpy-hermes-rebuild.sh
# (2026-08-16 incident: interrupted rebuilds leave half-removed containers +
# stale sidecars that kill BOTH the deploy `compose up` AND the rollback).
#
# Runs the real cleanup_stale_containers() function (extracted verbatim from
# the rebuild script) against a MOCKED docker binary — no daemon required.
# Verifies the safety invariants:
#   - never removes the CURRENT hermes container (id match)
#   - never removes a RUNNING container
#   - removes stale sidecars (exited/created) of the compose project only
#   - waits out a stuck "removing" hermes container, then force-removes
#   - idempotent: second run removes nothing new
#   - attempts to drop a dangling project network
#
# Run: bash scripts/tests/hermes-rebuild-cleanup.test.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="${ROOT}/scripts/vulpy-hermes-rebuild.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

FAILS=0
pass() { echo "  ok: $1"; }
fail() { echo "  FAIL: $1" >&2; FAILS=$((FAILS + 1)); }

# ---------------------------------------------------------------------------
# Extract a top-level function verbatim from the rebuild script.
# Functions end at the first line that is exactly "}" (col 0).
# ---------------------------------------------------------------------------
extract_fn() {
  awk -v fn="$1" '
    index($0, fn "() {") == 1 { p = 1 }
    p { print }
    p && $0 == "}" { exit }
  ' "$SRC"
}

cleanup_fn="$(extract_fn cleanup_stale_containers)"
compose_retry_fn="$(extract_fn compose_up_retry)"
if [ -z "${cleanup_fn}" ] || [ -z "${compose_retry_fn}" ]; then
  echo "FATAL: could not extract helper functions from ${SRC}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Mock docker. State file lines: "ID NAME STATE PROJECT".
#   ps -a --filter label=com.docker.compose.project=X → lines with project X
#   ps -a --filter id=ID                             → that line (once)
#   rm -f ID                                         → drop the line, log it
#   network rm NAME                                  → log it
# A state of "removing" disappears on the first id-filtered ps (models the
# daemon finishing a stuck removal on its own).
# ---------------------------------------------------------------------------
mkdir -p "${TMP}/bin"
cat > "${TMP}/bin/docker" <<'MOCK'
#!/usr/bin/env bash
STATE="$FAKE_DOCKER_STATE"
LOG="$FAKE_DOCKER_LOG"
echo "docker $*" >> "$LOG"
case "$1" in
  ps)
    label=""; id=""
    for a in "$@"; do
      case "$a" in
        label=*) label="${a#label=}"; label="${label#*=}" ;;  # strip the label KEY (com.docker.compose.project=)
        id=*)    id="${a#id=}" ;;
      esac
    done
    if [ -n "$id" ]; then
      line="$(grep "^${id} " "$STATE" || true)"
      if [ -n "$line" ]; then
        state="$(echo "$line" | awk '{print $3}')"
        if [ "$state" = "removing" ]; then
          grep -v "^${id} " "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
        fi
        echo "$line" | awk '{print $1" "$2" "$3}'
      fi
      exit 0
    fi
    if [ -n "$label" ]; then
      awk -v p="$label" '$4 == p {print $1" "$2" "$3}' "$STATE"
    else
      awk '{print $1" "$2" "$3}' "$STATE"
    fi
    ;;
  rm)
    id="${3:-}"
    grep -v "^${id} " "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
    echo "rm ok: $id" >> "$LOG"
    ;;
  network)
    echo "network rm ok: ${3:-}" >> "$LOG"
    ;;
  *)
    echo "mock: unhandled $*" >> "$LOG"
    ;;
esac
MOCK
chmod +x "${TMP}/bin/docker"

run_cleanup() {
  local state_file="$1"
  local log_file="$2"
  local current="${3:-}"
  local out_file="$4"
  FAKE_DOCKER_STATE="${state_file}" FAKE_DOCKER_LOG="${log_file}" \
    COMPOSE_PROJECT_NAME="vulpy-commerce-hermes" CURRENT_CONTAINER_ID="${current}" \
    PATH="${TMP}/bin:${PATH}" bash -c "${cleanup_fn}
cleanup_stale_containers" > "${out_file}" 2>&1
}

rm_lines() { # docker log -> lines of successful container rm (not network rm)
  grep "^rm ok:" "$1" || true
}

# --- Scenario A: mixed leftovers -------------------------------------------
echo "Scenario A: mixed leftovers (stale sidecars + running + foreign)"
A_STATE="${TMP}/a.state"
cat > "$A_STATE" <<'EOF'
cur1 vulpy-commerce-hermes-hermes-1 running vulpy-commerce-hermes
stale1 vulpy-commerce-hermes-searxng-1 exited vulpy-commerce-hermes
stale2 vulpy-commerce-hermes-tailscale-1 created vulpy-commerce-hermes
run1 vulpy-commerce-hermes-watchdog-1 running vulpy-commerce-hermes
other1 other-project-app-1 exited other-project
EOF
A_LOG="${TMP}/a.log"
A_OUT="${TMP}/a.out"
run_cleanup "$A_STATE" "$A_LOG" "cur1" "$A_OUT"

removed="$(rm_lines "$A_LOG")"
echo "$removed" | grep -q "stale1" && pass "removed stale searxng" || fail "did not remove stale searxng"
echo "$removed" | grep -q "stale2" && pass "removed stale tailscale" || fail "did not remove stale tailscale"
echo "$removed" | grep -q "other1" && fail "removed a foreign-project container" || pass "left foreign-project container alone"
grep -q "keeping current hermes container vulpy-commerce-hermes-hermes-1" "$A_OUT" && pass "kept current hermes (id match)" || fail "current hermes was not explicitly kept"
grep -q "keeping running container vulpy-commerce-hermes-watchdog-1" "$A_OUT" && pass "kept running non-hermes container" || fail "running container was not kept"
grep -q "network rm ok: vulpy-commerce-hermes_default" "$A_LOG" && pass "attempted dangling-network cleanup" || fail "network cleanup missing"

# Idempotence: second run removes nothing new
A_LOG2="${TMP}/a2.log"
A_OUT2="${TMP}/a2.out"
run_cleanup "$A_STATE" "$A_LOG2" "cur1" "$A_OUT2"
if [ -z "$(rm_lines "$A_LOG2")" ]; then
  pass "second run is a no-op"
else
  fail "second run removed containers again: $(rm_lines "$A_LOG2")"
fi

# --- Scenario B: stuck hermes removal --------------------------------------
echo "Scenario B: old hermes stuck in Removing"
B_STATE="${TMP}/b.state"
cat > "$B_STATE" <<'EOF'
oldh vulpy-commerce-hermes-hermes-1 removing vulpy-commerce-hermes
stale3 vulpy-commerce-hermes-searxng-1 exited vulpy-commerce-hermes
EOF
B_LOG="${TMP}/b.log"
B_OUT="${TMP}/b.out"
run_cleanup "$B_STATE" "$B_LOG" "cur2" "$B_OUT"   # current hermes is elsewhere/new

grep -q "waiting for stuck removal: vulpy-commerce-hermes-hermes-1 (oldh)" "$B_OUT" \
  && pass "waited for stuck hermes removal" || fail "did not wait for stuck hermes removal"
grep -q "rm ok: oldh" "$B_LOG" && pass "force-removed leftover hermes after wait" || fail "leftover hermes not force-removed"
grep -q "rm ok: stale3" "$B_LOG" && pass "removed stale searxng alongside" || fail "stale searxng not removed"
# oldh must be gone from state
grep -q "^oldh " "$B_STATE" && fail "stuck hermes still in state after cleanup" || pass "stuck hermes gone from state"

# --- Scenario C: current hermes must survive even if non-running -----------
echo "Scenario C: current hermes kept even when exited"
C_STATE="${TMP}/c.state"
cat > "$C_STATE" <<'EOF'
cur1 vulpy-commerce-hermes-hermes-1 exited vulpy-commerce-hermes
EOF
C_LOG="${TMP}/c.log"
C_OUT="${TMP}/c.out"
run_cleanup "$C_STATE" "$C_LOG" "cur1" "$C_OUT"
if [ -z "$(rm_lines "$C_LOG")" ]; then
  pass "current hermes never removed despite exited state"
else
  fail "current hermes was removed: $(rm_lines "$C_LOG")"
fi

# --- Static wiring checks ---------------------------------------------------
echo "Static wiring: helpers defined + called in deploy and rollback paths"
grep -q "^cleanup_stale_containers() {" "$SRC" && pass "cleanup_stale_containers defined" || fail "cleanup_stale_containers missing"
grep -q "^compose_up_retry() {" "$SRC" && pass "compose_up_retry defined" || fail "compose_up_retry missing"
n="$(grep -c "cleanup_stale_containers" "$SRC")"
[ "${n}" -ge 3 ] && pass "cleanup called in both paths (${n} refs)" || fail "cleanup refs ${n} (<3: def + deploy + rollback)"
n="$(grep -c "compose_up_retry" "$SRC")"
[ "${n}" -ge 3 ] && pass "compose_up_retry used in both paths (${n} refs)" || fail "compose_up_retry refs ${n} (<3)"

# --- Summary ----------------------------------------------------------------
echo ""
if [ "${FAILS}" -eq 0 ]; then
  echo "ALL PASS"
  exit 0
fi
echo "${FAILS} FAILURE(S)" >&2
exit 1
