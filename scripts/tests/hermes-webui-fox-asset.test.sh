#!/usr/bin/env bash
# Onboarding Fox avatar asset contract test.
#
# Regression: the repo emits MEDIA:/extensions/images/fox_avatar_cropped.jpg
# (and the renderer's role-icon/empty-state reference /extensions/images/
# fox_avatar_cropped.jpg), but the WebUI's /extensions/ static route serves the
# configured extension root (/app/fox-overlay/webui_static), so the asset must
# physically ship there. This test proves:
#   1. the canonical JPEG exists in the WebUI extension package,
#   2. it is a valid JPEG (SOI/EOI + decodable SOF dimensions),
#   3. the extension sync contract (vulpy_sync_webui_extensions) copies it into
#      the overlay images/ dir at mode 644,
#   4. the Docker build contract (Dockerfile.hermes) bakes images/ into the
#      overlay webui_static root.
#
# No Docker, no network, no /app/fox-overlay required. The sync function is
# extracted from the real (security-checksummed) entrypoint and only the
# container-only dst is redirected to a sandbox, mirroring
# scripts/tests/hermes-fox-entrypoint.test.sh.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENTRYPOINT="${ROOT_DIR}/scripts/hermes-fox-entrypoint.sh"
SRC_IMG="${ROOT_DIR}/extensions/hermes-webui/images/fox_avatar_cropped.jpg"

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

assert_file_mode() {
  local label="$1" file="$2" expected="$3"
  local actual
  actual="$(stat -c '%a' "${file}" 2>/dev/null || echo 'missing')"
  assert_eq "${label}" "${expected}" "${actual}"
}

# ── 1. Asset exists in the extension package ───────────────────────────────

assert_true "onboarding fox avatar exists in extension package" test -f "${SRC_IMG}"
assert_true "onboarding fox avatar is non-empty" test -s "${SRC_IMG}"

# ── 2. Valid JPEG (SOI/EOI + decodable SOF dimensions) ────────────────────

if command -v python3 >/dev/null 2>&1; then
  jpeg_info="$(python3 - "${SRC_IMG}" <<'PY'
import struct
import sys
from pathlib import Path

b = Path(sys.argv[1]).read_bytes()
assert b[:2] == b"\xff\xd8", "missing JPEG SOI"
assert b[-2:] == b"\xff\xd9", "missing JPEG EOI"
i = 2
dims = None
while i < len(b) - 1:
    if b[i] != 0xFF:
        i += 1
        continue
    marker = b[i + 1]
    if marker in (0xD9, 0xDA):  # EOI / SOS
        break
    if i + 2 >= len(b):
        break
    seglen = struct.unpack(">H", b[i + 2 : i + 4])[0]
    if marker in (0xC0, 0xC1, 0xC2, 0xC3):  # SOF0/1/2/3
        h = struct.unpack(">H", b[i + 5 : i + 7])[0]
        w = struct.unpack(">H", b[i + 7 : i + 9])[0]
        dims = (w, h)
        break
    i += 2 + seglen
assert dims, "no SOF marker found — not a decodable JPEG"
assert dims[0] > 0 and dims[1] > 0, f"degenerate dimensions {dims[0]}x{dims[1]}"
print(f"{dims[0]}x{dims[1]}")
PY
)"
  assert_match "fox avatar is a decodable JPEG (WxH)" "${jpeg_info}" '^[1-9][0-9]*x[1-9][0-9]*$'
else
  echo "SKIP: python3 unavailable — JPEG structure check skipped"
fi

# ── 3. Sync contract includes the asset ────────────────────────────────────
# Extract vulpy_sync_webui_extensions from the real entrypoint, redirect only
# the container-only dst to a sandbox, and sync a minimal fixture carrying the
# REAL avatar bytes so the sync-path is exercised with the actual asset.

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "${tmpdir}"; }
trap cleanup EXIT

FAKE_WORKSPACE="${tmpdir}/workspace"
FAKE_SRC="${FAKE_WORKSPACE}/extensions/hermes-webui"
FAKE_DST="${tmpdir}/overlay/webui_static"

mkdir -p "${FAKE_SRC}/images" "${FAKE_DST}"
cp "${SRC_IMG}" "${FAKE_SRC}/images/fox_avatar_cropped.jpg"
printf '%s\n' '{"extensions":[]}' > "${FAKE_SRC}/manifest.json"

EXTRACTED="${tmpdir}/sync-fn.sh"
sed -n '/^vulpy_sync_webui_extensions()/,/^}/p' "${ENTRYPOINT}" > "${EXTRACTED}"

assert_true "sync function extracted from entrypoint" \
  grep -q '^vulpy_sync_webui_extensions()' "${EXTRACTED}"
assert_true "production dst line still present (drift guard)" \
  grep -q 'local dst="/app/fox-overlay/webui_static"' "${ENTRYPOINT}"

sed -i "s|local dst=\"/app/fox-overlay/webui_static\"|local dst=\"${FAKE_DST}\"|" "${EXTRACTED}"

# shellcheck disable=SC1090
source "${EXTRACTED}"

WORKSPACE="${FAKE_WORKSPACE}" vulpy_sync_webui_extensions >/dev/null 2>&1

assert_true "sync copies fox avatar into overlay images/" \
  test -f "${FAKE_DST}/images/fox_avatar_cropped.jpg"
# Binary comparison via cmp — command substitution strips NUL bytes in JPEG data.
if cmp -s "${SRC_IMG}" "${FAKE_DST}/images/fox_avatar_cropped.jpg"; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  echo "FAIL: sync preserves fox avatar bytes (cmp mismatch)" >&2
fi
assert_file_mode "fox avatar synced mode 644" \
  "${FAKE_DST}/images/fox_avatar_cropped.jpg" "644"

# ── 4. Build contract includes the asset ───────────────────────────────────
# The /extensions/ route serves /app/fox-overlay/webui_static, so the Docker
# image must bake images/ under that root (the runtime sync is a belt-and-
# braces refresh, not the source of truth for a fresh image).

docker_copy="$(grep -E '^COPY extensions/hermes-webui/images' "${ROOT_DIR}/Dockerfile.hermes" || true)"
assert_match "Dockerfile bakes images/ into webui_static" "${docker_copy}" 'webui_static/images'

# ── Report ─────────────────────────────────────────────────────────────────

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""

[ "${FAIL}" -eq 0 ] || exit 1
