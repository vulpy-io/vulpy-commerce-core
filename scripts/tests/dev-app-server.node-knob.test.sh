#!/usr/bin/env bash
# VULPY_DEV_NODE knob: require_node must use the overridden binary when set
# (even when no PATH node exists), and refuse with a clear message when
# neither VULPY_DEV_NODE nor a PATH node resolves.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT_DIR}/scripts/dev-app-server.sh"
TMP="$(mktemp -d)"
cleanup() { rm -rf -- "${TMP:?}"; }
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

# Extract just the require_node() function body so we can test it in
# isolation without sourcing the full header (which needs coreutils, cd,
# the lock fd, etc.).
extract_fn() {
  awk '
    $0 == "require_node() {" { grab=1 }
    grab { print }
    grab && $0 == "}" { exit }
  ' "${SCRIPT}"
}
extract_fn > "${TMP}/reqnode.sh"
wc -l "${TMP}/reqnode.sh" >/dev/null

FAKE_NODE="${TMP}/fakenode"
printf '#!/usr/bin/env bash\nexit 0\n' > "${FAKE_NODE}"
chmod +x "${FAKE_NODE}"

# Harness: define require_node from the real file, then run it.
run_require_node() {
  # args: env prefix handled by caller
  /usr/bin/bash -c '
    source "$1"
    require_node
    echo "accepted"
  ' _ "${TMP}/reqnode.sh"
}

# --- 1. VULPY_DEV_NODE set on a node-less PATH -> require_node must accept. ---
set +e
out="$(PATH="" VULPY_DEV_NODE="${FAKE_NODE}" run_require_node 2>&1)"
rc=$?
set -e
if [ "${rc}" -ne 0 ]; then
  fail "require_node refused despite VULPY_DEV_NODE set (rc=${rc}): ${out}"
fi
printf '%s' "${out}" | grep -qi 'accepted' || {
  fail "require_node accepted but output unexpected: ${out}"
}

# --- 2. No VULPY_DEV_NODE and a node-less PATH -> refuse with clear message. ---
set +e
out="$(PATH="" /usr/bin/env -u VULPY_DEV_NODE \
  /usr/bin/bash -c '
    source "$1"
    require_node
    echo "accepted"
  ' _ "${TMP}/reqnode.sh" 2>&1)"
rc=$?
set -e
if [ "${rc}" -eq 0 ]; then
  fail "require_node did not refuse on a node-less PATH"
fi
case "${out}" in
  *"node is not available"*|*"could not find"*|*"VULPY_DEV_NODE"*)
    echo "ok: refused without node (${out})" ;;
  *)
    fail "unexpected refusal message: ${out}" ;;
esac

echo "dev-app-server.node-knob: 2 passed, 0 failed"