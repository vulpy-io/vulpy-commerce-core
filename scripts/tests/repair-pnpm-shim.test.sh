#!/usr/bin/env bash
# Tests for scripts/repair-pnpm-shim.sh — the checkout-local pnpm shim repair.
#
# The repair derives its ROOT_DIR from its own location, so these tests run a
# COPY of the real script inside a sandbox tree (owned by the current user) and
# exercise it with fake `pnpm`/`corepack` executables on a fully controlled PATH.
# Nothing outside the sandbox is touched; no real pnpm/corepack is consulted.
#
# Behaviors under test:
#   1. Writes a portable checkout-local WRAPPER (regular file, executable), not
#      a host-only symlink.
#   2. Prefers the captured host pnpm at runtime when that path still exists.
#   3. Falls back to `corepack pnpm` at runtime when the host path is gone
#      (the Fox-container scenario that previously ENOENT'd).
#   4. Repairs via corepack even when no host pnpm exists at repair time.
#   5. Fails loudly (exit 1, clear message) when no pnpm source is available.
#   6. Idempotent — a second repair succeeds and leaves a working wrapper.
# NOTE: no `set -e` here on purpose — the repair script under test exits
# non-zero in the negative cases, and command substitutions running it must
# not abort the harness. Failures are tracked via PASS/FAIL + explicit exit.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPAIR="${ROOT_DIR}/scripts/repair-pnpm-shim.sh"

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

assert_true() {
  local label="$1"
  shift
  if "$@"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: ${label} (expected success, got failure)" >&2
  fi
}

assert_false() {
  local label="$1"
  shift
  if "$@"; then
    FAIL=$((FAIL + 1))
    echo "FAIL: ${label} (expected failure, got success)" >&2
  else
    PASS=$((PASS + 1))
  fi
}

assert_match() {
  local label="$1" haystack="$2" pattern="$3"
  if printf '%s' "${haystack}" | grep -qE -- "${pattern}"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: ${label} (pattern /${pattern}/ not found)" >&2
    echo "  haystack: ${haystack}" >&2
  fi
}

# ── Sandbox ──────────────────────────────────────────────────────────────────

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "${tmpdir}"; }
trap cleanup EXIT

SANDBOX="${tmpdir}/checkout"
HOSTBIN="${tmpdir}/hostbin"     # fake host pnpm lives here
COREBIN="${tmpdir}/corebin"     # fake corepack lives here
SYSBIN="${tmpdir}/sysbin"       # symlinks to the system tools the scripts need

TARGET="${SANDBOX}/node_modules/.bin/pnpm"

# Build a tool shim dir so a controlled PATH can find every external tool the
# repair script + wrapper + fakes use, while real pnpm/corepack stay invisible.
mkdir -p "${SYSBIN}"
for tool in bash env stat sed cat chmod mv readlink rm mkdir cp dirname id grep find mktemp wc head ln; do
  ln -sf "$(command -v "${tool}")" "${SYSBIN}/${tool}"
done

reset_sandbox() {
  rm -rf "${SANDBOX}" "${HOSTBIN}" "${COREBIN}"
  mkdir -p "${SANDBOX}/scripts" "${SANDBOX}/node_modules/.bin" "${HOSTBIN}" "${COREBIN}"
  cp -p "${REPAIR}" "${SANDBOX}/scripts/repair-pnpm-shim.sh"
  chmod +x "${SANDBOX}/scripts/repair-pnpm-shim.sh"
}

fake_host_pnpm() {
  cat > "${HOSTBIN}/pnpm" <<'EOF'
#!/usr/bin/env bash
echo "FAKE_HOST_PNPM 9.9.9 (${1:-})"
EOF
  chmod +x "${HOSTBIN}/pnpm"
}

fake_corepack() {
  cat > "${COREBIN}/corepack" <<'EOF'
#!/usr/bin/env bash
echo "FAKE_COREPACK 10.15.0 (${*:-})"
EOF
  chmod +x "${COREBIN}/corepack"
}

# Run a command with a fully controlled PATH (fakes + tool shims only).
run_with_path() {
  local path="$1"
  shift
  PATH="${path}" "${SYSBIN}/bash" "$@"
}

# `bash <script>` with a controlled PATH — the script's own shebang is bypassed
# but its externals resolve only through the controlled PATH.
repair_with_path() {
  local path="$1"
  PATH="${path}" "${SYSBIN}/bash" "${SANDBOX}/scripts/repair-pnpm-shim.sh"
}

# Invoke the repaired shim with a controlled PATH.
invoke_shim() {
  local path="$1"
  PATH="${path}" "${SYSBIN}/bash" "${TARGET}" --version
}

# Capture stdout+stderr and the exit code of a command into globals OUT/RC
# without letting a non-zero exit abort the harness under `set -e`.
capture() {
  set +e
  OUT="$("$@" 2>&1)"
  RC=$?
  set -e
}

# ── 1. Host pnpm preferred; wrapper is a regular executable file ─────────────

reset_sandbox
fake_host_pnpm

out="$(repair_with_path "${HOSTBIN}:${SYSBIN}" 2>&1)"

assert_match "host-pnpm repair reports version" "${out}" "FAKE_HOST_PNPM 9.9.9"
assert_match "host-pnpm repair names host source" "${out}" "host pnpm"
assert_false "repair writes a regular file, NOT a symlink" test -L "${TARGET}"
assert_true "wrapper is executable" test -x "${TARGET}"
assert_eq "wrapper file mode is 755" "755" "$(stat -c '%a' "${TARGET}")"
assert_match "wrapper contains corepack fallback (drift guard)" \
  "$(cat "${TARGET}")" "corepack"

shim_out="$(invoke_shim "${HOSTBIN}:${SYSBIN}" 2>&1)"
assert_match "runtime uses host pnpm when present" "${shim_out}" "FAKE_HOST_PNPM 9.9.9"

# ── 2. Runtime fallback to corepack when the host path disappears ────────────
# Simulates the Fox container: repair ran on the host (baked /usr/bin/pnpm),
# that path is absent in Fox, so the shim must fall back to corepack pnpm.

reset_sandbox
fake_host_pnpm
fake_corepack

repair_with_path "${HOSTBIN}:${SYSBIN}" >/dev/null 2>&1
rm -f "${HOSTBIN}/pnpm"   # host path now missing at runtime

shim_out="$(invoke_shim "${COREBIN}:${SYSBIN}" 2>&1)"
assert_match "runtime falls back to corepack when host pnpm missing" \
  "${shim_out}" "FAKE_COREPACK"

# ── 3. Repair works via corepack when no host pnpm exists ────────────────────

reset_sandbox
fake_corepack

out="$(repair_with_path "${COREBIN}:${SYSBIN}" 2>&1)"
assert_match "corepack-only repair reports version" "${out}" "FAKE_COREPACK"
assert_match "corepack-only repair names corepack source" "${out}" "corepack"
assert_false "corepack-only repair writes a regular file, NOT a symlink" test -L "${TARGET}"

shim_out="$(invoke_shim "${COREBIN}:${SYSBIN}" 2>&1)"
assert_match "corepack-only wrapper uses corepack" "${shim_out}" "FAKE_COREPACK"

# ── 4. No host pnpm and no corepack → clear failure, nothing written ─────────

reset_sandbox

set +e
out="$(repair_with_path "${SYSBIN}" 2>&1)"
rc=$?
set -e
assert_eq "no-source repair exits 1" "1" "${rc}"
assert_match "no-source repair prints a clear error" "${out}" "no host pnpm and no corepack"
assert_false "no-source repair writes nothing" test -e "${TARGET}"

# ── 5. Wrapper fails loudly at runtime when nothing is available ─────────────
# Wrapper was written while host pnpm existed; both host pnpm and corepack are
# gone at runtime → the shim must print a clear error and exit non-zero.

reset_sandbox
fake_host_pnpm
repair_with_path "${HOSTBIN}:${SYSBIN}" >/dev/null 2>&1
rm -f "${HOSTBIN}/pnpm"

set +e
out="$(invoke_shim "${SYSBIN}" 2>&1)"
rc=$?
set -e
assert_eq "wrapper with no source exits non-zero" "1" "${rc}"
assert_match "wrapper failure names the missing host path" "${out}" "missing"

# ── 6. Idempotent — a second repair succeeds and stays functional ────────────

reset_sandbox
fake_host_pnpm

repair_with_path "${HOSTBIN}:${SYSBIN}" >/dev/null 2>&1
assert_true "second repair succeeds" \
  repair_with_path "${HOSTBIN}:${SYSBIN}" >/dev/null 2>&1
assert_false "still a regular file after second repair" test -L "${TARGET}"
shim_out="$(invoke_shim "${HOSTBIN}:${SYSBIN}" 2>&1)"
assert_match "wrapper still functional after second repair" "${shim_out}" "FAKE_HOST_PNPM 9.9.9"

# ── Report ───────────────────────────────────────────────────────────────────

echo ""
echo "repair-pnpm-shim.test.sh: ${PASS} passed, ${FAIL} failed"
echo ""

[ "${FAIL}" -eq 0 ] || exit 1
