#!/usr/bin/env bash
# Unit tests for sync functions in scripts/hermes-fox-entrypoint.sh:
#   - vulpy_sync_webui_extensions (WebUI extension overlay)
#   - vulpy_ensure_operator_plugin (durable Hermes plugin package sync)
#
# The entrypoint is security-checksummed (scripts/.vulpy-security-checksums),
# so the tests never modify it: the sync function is extracted from the real
# file and only the container-only destination path is redirected to a sandbox.
# Drift guards fail loudly if the function shape or dst line changes upstream.
#
# No Docker, no network, no /app/fox-overlay required.
# Convention matches scripts/lib/install-helpers.test.sh.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENTRYPOINT="${ROOT_DIR}/scripts/hermes-fox-entrypoint.sh"

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

FAKE_ROOT="${tmpdir}/root"
FAKE_WORKSPACE="${FAKE_ROOT}/workspace"
FAKE_DST="${FAKE_ROOT}/overlay/webui_static"

# ── 0. Extract the sync function from the real entrypoint ────────────────────
# The entrypoint is security-checksummed, so tests must not modify it. Extract
# the function definition and redirect only the container-only dst path.
# If the function shape or the dst line drifts, the guards below fail loudly
# instead of silently testing a stale copy.

EXTRACTED="${tmpdir}/sync-fn.sh"
sed -n '/^vulpy_sync_webui_extensions()/,/^}/p' "${ENTRYPOINT}" > "${EXTRACTED}"

assert_true "sync function extracted from entrypoint" \
  grep -q '^vulpy_sync_webui_extensions()' "${EXTRACTED}"
assert_true "production dst line still present (drift guard)" \
  grep -q 'local dst="/app/fox-overlay/webui_static"' "${ENTRYPOINT}"

sed -i "s|local dst=\"/app/fox-overlay/webui_static\"|local dst=\"${FAKE_DST}\"|" "${EXTRACTED}"

assert_true "dst redirected to sandbox" \
  grep -q "local dst=\"${FAKE_DST}\"" "${EXTRACTED}"
assert_false "production dst removed from test copy" \
  grep -q 'local dst="/app/fox-overlay/webui_static"' "${EXTRACTED}"

export WORKSPACE="${FAKE_WORKSPACE}"
# shellcheck disable=SC1090
source "${EXTRACTED}"

# ── Sandbox helpers ──────────────────────────────────────────────────────────

build_src() {
  local src="${FAKE_WORKSPACE}/extensions/hermes-webui"
  mkdir -p \
    "${src}/features/vulpy-commerce-profile-switcher" \
    "${src}/features/deep/sub"
  printf '%s\n' '{"extensions":[]}' > "${src}/manifest.json"
  printf '%s\n' 'renderer-body' > "${src}/message-renderer.js"
  printf '%s\n' 'readme-body' > "${src}/README.md"
  printf '%s\n' 'tooling-body' > "${src}/patch-ui.js.py"
  printf '%s\n' 'body { color: red; }' > "${src}/features/vulpy-commerce-profile-switcher/index.css"
  printf '%s\n' 'asset-body' > "${src}/features/deep/sub/asset.txt"
}

reset_sandbox() {
  rm -rf "${FAKE_ROOT}"
  mkdir -p "${FAKE_WORKSPACE}" "${FAKE_DST}"
  build_src
}

rel_files() {
  # Relative path of every file under the dst root, sorted.
  (cd "${FAKE_DST}" && find . -type f | sed 's|^\./||' | sort)
}

assert_file_mode() {
  local label="$1" file="$2" expected="$3"
  local actual
  actual="$(stat -c '%a' "${file}" 2>/dev/null || echo 'missing')"
  assert_eq "${label}" "${expected}" "${actual}"
}

# ── 1. Fresh sync copies recursively, skips .py, modes 644 ───────────────────

reset_sandbox
vulpy_sync_webui_extensions >/dev/null 2>&1

# find|sort is byte-wise: uppercase sorts before lowercase paths
expected="README.md
features/deep/sub/asset.txt
features/vulpy-commerce-profile-switcher/index.css
manifest.json
message-renderer.js"

assert_eq "fresh sync copies expected file set" "${expected}" "$(rel_files)"
assert_eq "manifest copied to dst root" \
  "$(cat "${FAKE_WORKSPACE}/extensions/hermes-webui/manifest.json")" \
  "$(cat "${FAKE_DST}/manifest.json")"
assert_eq "nested asset content copied" \
  "$(cat "${FAKE_WORKSPACE}/extensions/hermes-webui/features/deep/sub/asset.txt")" \
  "$(cat "${FAKE_DST}/features/deep/sub/asset.txt")"

py_count="$(find "${FAKE_DST}" -name '*.py' -type f | wc -l | tr -d ' ')"
assert_eq "build tooling (.py) never copied" "0" "${py_count}"

assert_file_mode "manifest mode 644" "${FAKE_DST}/manifest.json" "644"
assert_file_mode "feature asset mode 644" \
  "${FAKE_DST}/features/vulpy-commerce-profile-switcher/index.css" "644"
assert_file_mode "nested asset mode 644" "${FAKE_DST}/features/deep/sub/asset.txt" "644"

# ── 2. Prune removes stale files no longer in source ─────────────────────────

reset_sandbox
mkdir -p "${FAKE_DST}/features/stale"
printf '%s\n' 'old' > "${FAKE_DST}/features/stale/old.js"
printf '%s\n' 'stale manifest' > "${FAKE_DST}/manifest.json"

vulpy_sync_webui_extensions >/dev/null 2>&1

assert_false "stale feature dir pruned" test -e "${FAKE_DST}/features/stale"
assert_eq "manifest refreshed from source" \
  "$(cat "${FAKE_WORKSPACE}/extensions/hermes-webui/manifest.json")" \
  "$(cat "${FAKE_DST}/manifest.json")"

# ── 3. Path safety: nothing written outside the overlay dst ──────────────────

reset_sandbox
printf '%s\n' 'marker' > "${FAKE_ROOT}/outside-marker.txt"

vulpy_sync_webui_extensions >/dev/null 2>&1

outside="$(find "${FAKE_ROOT}/overlay" -type f ! -path "${FAKE_DST}/*" 2>/dev/null || true)"
assert_eq "nothing written outside overlay dst" "" "${outside}"
assert_false "marker outside src not copied" test -e "${FAKE_DST}/outside-marker.txt"

traversal="$(cd "${FAKE_DST}" && find . -type f | grep -E '(^|/)\.\.(/|$)' || true)"
assert_eq "no path traversal in destinations" "" "${traversal}"

# ── 4. Missing source or destination → graceful skip (exit 0) ────────────────

reset_sandbox
FAKE_EMPTY="${FAKE_ROOT}/empty-workspace"
mkdir -p "${FAKE_EMPTY}"

set +e
out="$(WORKSPACE="${FAKE_EMPTY}" vulpy_sync_webui_extensions 2>&1)"
rc=$?
set -e
assert_eq "missing src returns 0" "0" "${rc}"
assert_match "missing src logs skip warning" "${out}" 'skipping WebUI extension sync'

rm -rf "${FAKE_DST}"
set +e
out="$(vulpy_sync_webui_extensions 2>&1)"
rc=$?
set -e
assert_eq "missing dst returns 0" "0" "${rc}"
assert_match "missing dst logs skip warning" "${out}" 'skipping WebUI extension sync'

# ── 5. Idempotent — second sync leaves the overlay unchanged ─────────────────

reset_sandbox
vulpy_sync_webui_extensions >/dev/null 2>&1
first_set="$(rel_files)"
first_manifest="$(cat "${FAKE_DST}/manifest.json")"

vulpy_sync_webui_extensions >/dev/null 2>&1

assert_eq "idempotent: file set unchanged" "${first_set}" "$(rel_files)"
assert_eq "idempotent: manifest unchanged" "${first_manifest}" "$(cat "${FAKE_DST}/manifest.json")"

# ── Operator plugin: vulpy_ensure_operator_plugin ───────────────────────────
# The operator plugin is synced as a complete package (companion modules such
# as design_block_pipeline.py are loaded from the plugin dir), not just
# __init__.py + plugin.yaml. The production dst line is redirected to a sandbox
# exactly like the WebUI section; the drift guard keeps the prod path honest.

PLUGIN_FAKE_DST="${FAKE_ROOT}/data/data/hermes/plugins/vulpy-commerce"

PLUGIN_EXTRACTED="${tmpdir}/plugin-sync-fn.sh"
sed -n '/^vulpy_ensure_operator_plugin()/,/^}/p' "${ENTRYPOINT}" > "${PLUGIN_EXTRACTED}"

assert_true "operator plugin fn extracted from entrypoint" \
  grep -q '^vulpy_ensure_operator_plugin()' "${PLUGIN_EXTRACTED}"
assert_true "operator plugin prod dst line still present (drift guard)" \
  grep -q 'local dst="/data/data/hermes/plugins/${name}"' "${ENTRYPOINT}"

sed -i "s|local dst=\"/data/data/hermes/plugins/\${name}\"|local dst=\"\${PLUGIN_FAKE_DST}\"|" "${PLUGIN_EXTRACTED}"

assert_true "operator plugin dst redirected to sandbox" \
  grep -q "local dst=\"\${PLUGIN_FAKE_DST}\"" "${PLUGIN_EXTRACTED}"

# shellcheck disable=SC1090
source "${PLUGIN_EXTRACTED}"

plugin_reset_sandbox() {
  rm -rf "${FAKE_ROOT}"
  mkdir -p "${FAKE_WORKSPACE}/extensions/hermes-plugins/vulpy-commerce"
  printf '%s\n' 'main-body' > "${FAKE_WORKSPACE}/extensions/hermes-plugins/vulpy-commerce/__init__.py"
  printf '%s\n' 'pipeline-body' > "${FAKE_WORKSPACE}/extensions/hermes-plugins/vulpy-commerce/design_block_pipeline.py"
  printf '%s\n' 'manifest-body' > "${FAKE_WORKSPACE}/extensions/hermes-plugins/vulpy-commerce/plugin.yaml"
}

plugin_rel_files() {
  (cd "${PLUGIN_FAKE_DST}" && find . -type f | sed 's|^\./||' | sort)
}

# ── 1. Fresh sync copies the COMPLETE package incl. companion module ────────

plugin_reset_sandbox
vulpy_ensure_operator_plugin >/dev/null 2>&1

expected="__init__.py
design_block_pipeline.py
plugin.yaml"

assert_eq "fresh sync copies full plugin package" "${expected}" "$(plugin_rel_files)"
assert_eq "companion module copied on fresh sync" \
  "$(cat "${FAKE_WORKSPACE}/extensions/hermes-plugins/vulpy-commerce/design_block_pipeline.py")" \
  "$(cat "${PLUGIN_FAKE_DST}/design_block_pipeline.py")"
assert_file_mode "companion module mode 644" "${PLUGIN_FAKE_DST}/design_block_pipeline.py" "644"
assert_file_mode "plugin __init__ mode 644" "${PLUGIN_FAKE_DST}/__init__.py" "644"

# ── 2. Idempotent — second sync leaves the package unchanged ─────────────────

plugin_reset_sandbox
vulpy_ensure_operator_plugin >/dev/null 2>&1
first_set="$(plugin_rel_files)"
first_companion="$(cat "${PLUGIN_FAKE_DST}/design_block_pipeline.py")"

vulpy_ensure_operator_plugin >/dev/null 2>&1

assert_eq "idempotent: package file set unchanged" "${first_set}" "$(plugin_rel_files)"
assert_eq "idempotent: companion module unchanged" "${first_companion}" \
  "$(cat "${PLUGIN_FAKE_DST}/design_block_pipeline.py")"

# ── 3. Changed companion module is refreshed on a second run ────────────────

plugin_reset_sandbox
vulpy_ensure_operator_plugin >/dev/null 2>&1
printf '%s\n' 'pipeline-body v2' > "${FAKE_WORKSPACE}/extensions/hermes-plugins/vulpy-commerce/design_block_pipeline.py"

vulpy_ensure_operator_plugin >/dev/null 2>&1

assert_eq "changed companion module refreshed on second run" \
  "$(cat "${FAKE_WORKSPACE}/extensions/hermes-plugins/vulpy-commerce/design_block_pipeline.py")" \
  "$(cat "${PLUGIN_FAKE_DST}/design_block_pipeline.py")"

# ── 4. Unrelated files already in the durable dst are preserved ─────────────

plugin_reset_sandbox
vulpy_ensure_operator_plugin >/dev/null 2>&1
printf '%s\n' 'user-notes' > "${PLUGIN_FAKE_DST}/user_notes.txt"

vulpy_ensure_operator_plugin >/dev/null 2>&1

assert_true "unrelated dst file preserved" test -f "${PLUGIN_FAKE_DST}/user_notes.txt"
assert_eq "unrelated dst file content preserved" "user-notes" \
  "$(cat "${PLUGIN_FAKE_DST}/user_notes.txt")"

# ── 5. Missing source → graceful skip (exit 0, warning) ─────────────────────

plugin_reset_sandbox
PLUGIN_EMPTY="${FAKE_ROOT}/empty-workspace"
mkdir -p "${PLUGIN_EMPTY}"

set +e
plugin_out="$(WORKSPACE="${PLUGIN_EMPTY}" vulpy_ensure_operator_plugin 2>&1)"
plugin_rc=$?
set -e
assert_eq "missing plugin src returns 0" "0" "${plugin_rc}"
assert_match "missing plugin src logs warning" "${plugin_out}" 'plugin source missing'

# ── Report ───────────────────────────────────────────────────────────────────

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""

[ "${FAIL}" -eq 0 ] || exit 1
