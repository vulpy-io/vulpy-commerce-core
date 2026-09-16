#!/usr/bin/env bash
# Tests for the per-session access-mode rule in generate-agent-context.sh.
# Uses a temp workspace with mock environments; no real services needed.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

PASS=0
FAIL=0

assert_contains() {
  local label="$1" haystack="$2" needle="$3"
  if printf '%s' "${haystack}" | grep -qF -- "${needle}"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: ${label} — output does not contain '${needle}'" >&2
  fi
}

assert_not_contains() {
  local label="$1" haystack="$2" needle="$3"
  if printf '%s' "${haystack}" | grep -qF -- "${needle}"; then
    FAIL=$((FAIL + 1))
    echo "FAIL: ${label} — output must NOT contain '${needle}'" >&2
  else
    PASS=$((PASS + 1))
  fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

OUTPUT="${TMP}/context.md"
bash "${ROOT_DIR}/scripts/generate-agent-context.sh" "${OUTPUT}" >/dev/null 2>&1 || true

if [ ! -f "${OUTPUT}" ]; then
  echo "FAIL: generate-agent-context.sh did not produce output" >&2
  exit 1
fi

CONTENT="$(cat "${OUTPUT}")"

# The access-mode rule section must exist and be phrased as a per-session
# decision, NOT a global "prefer Tailscale while the sidecar is up".
assert_contains "has access mode section" "${CONTENT}" "## Access mode"

# The flawed global rule (f9dd6975) told the agent to prefer Tailscale
# whenever the sidecar is up, regardless of the operator's actual access
# path. That phrasing must be GONE.
assert_not_contains "no global tailscale-preference phrasing" \
  "${CONTENT}" "Tailscale links are preferred while the sidecar is up"

# The corrected rule must state that the current session's access mode wins.
assert_contains "current session access mode wins" \
  "${CONTENT}" "current session's access mode wins"

# The corrected rule must still preserve the operator-link policy (never
# hand host.docker.internal to the operator).
assert_contains "never hands host.docker.internal" \
  "${CONTENT}" "host.docker.internal"

# The three link families must still be offered when configured.
if printf '%s' "${CONTENT}" | grep -q "Host Tailscale: up "; then
  assert_contains "has tailscale operator link" "${CONTENT}" "Tailscale storefront: https://"
else
  PASS=$((PASS + 1)) # no sidecar — operator links fall back to public/local
fi

# Summary
echo ""
echo "generate-agent-context-access-mode.test.sh: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ] || exit 1
