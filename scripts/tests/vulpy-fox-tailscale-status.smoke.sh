#!/usr/bin/env bash
# Smoke test for scripts/vulpy-fox-tailscale-status.sh (agent-cmd bridge ts.status).
#
# The helper is a READ-ONLY probe: it prints a compact status line of the
# Fox Tailscale sidecar via vulpy_fox_tailscale_status_line() from
# scripts/lib/install-helpers.sh and never mutates anything.
#
# This test runs WITHOUT Docker (CI / dev boxes): in that environment the
# sidecar cannot exist, so the valid, expected answer is "sidecar-not-running".
# We assert the output is one of the documented status shapes — never empty,
# never an error stack — so the contract stays stable whether docker exists or
# not.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPER="${ROOT_DIR}/scripts/vulpy-fox-tailscale-status.sh"

PASS=0
FAIL=0

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "${expected}" = "${actual}" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: ${label}" >&2
    echo "  expected: ${expected}" >&2
    echo "  actual:   ${actual}" >&2
  fi
}

# --- syntax gate -------------------------------------------------------------
if bash -n "${HELPER}"; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  echo "FAIL: bash -n ${HELPER}" >&2
fi

# --- output contract ---------------------------------------------------------
out="$(bash "${HELPER}" 2>/dev/null || true)"
if [ -z "${out}" ]; then
  FAIL=$((FAIL + 1))
  echo "FAIL: helper produced empty output (always prints a status line)" >&2
else
  case "${out}" in
    sidecar-not-running|up|up\ *|needs-login\ *|starting)
      PASS=$((PASS + 1))
      echo "ok: status line '${out}'"
      ;;
    *)
      FAIL=$((FAIL + 1))
      echo "FAIL: unexpected status line: '${out}'" >&2
      ;;
  esac
fi

# --- no writes ---------------------------------------------------------------
# The helper must never create/modify files. Snapshot the tracked tree's
# writable surface is heavy; instead assert it exits 0 and produces no stderr
# (a mutation would print to stderr via install-helpers).
if stderr="$(bash "${HELPER}" 2>&1 >/dev/null)"; then
  if [ -z "${stderr}" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: helper wrote to stderr: ${stderr}" >&2
  fi
else
  FAIL=$((FAIL + 1))
  echo "FAIL: helper exited non-zero" >&2
fi

echo
echo "vulpy-fox-tailscale-status smoke: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" = "0" ] || exit 1
exit 0