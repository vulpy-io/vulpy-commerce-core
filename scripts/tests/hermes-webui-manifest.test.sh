#!/usr/bin/env bash
# Manifest validation for extensions/hermes-webui/manifest.json.
# Asserts: valid JSON, unique extension ids, and every scripts/stylesheets
# path referenced by each entry resolves to an existing file.
# No Docker, no network. Convention matches scripts/tests/*.test.sh.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="${ROOT_DIR}/extensions/hermes-webui/manifest.json"

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

# ── Sandbox ──────────────────────────────────────────────────────────────────

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "${tmpdir}"; }
trap cleanup EXIT

CHECKER="${tmpdir}/check-manifest.py"

cat > "${CHECKER}" <<'PY'
#!/usr/bin/env python3
"""Validate the WebUI extension manifest.

Prints one violation per line; empty output means the manifest is valid.
Exit code is always 0 — the shell asserts on the output, so a hard crash in
the checker cannot kill the test suite with a confusing error. Both malformed
JSON (INVALID_JSON) and valid-JSON-but-non-object roots (INVALID_ROOT) are
reported as violations and exit cleanly, never raising.
"""
import json
import os
import sys

manifest_path = sys.argv[1]

try:
    with open(manifest_path, encoding="utf-8") as fh:
        data = json.load(fh)
except Exception as exc:  # noqa: BLE001 — report any parse failure
    print("INVALID_JSON: {0}".format(exc))
    sys.exit(0)

if not isinstance(data, dict):
    print("INVALID_ROOT: manifest root is not an object")
    sys.exit(0)

base = os.path.dirname(os.path.abspath(manifest_path))
extensions = data.get("extensions", [])
if not isinstance(extensions, list) or not extensions:
    print("EMPTY_EXTENSIONS")

seen_ids = set()
for ext in extensions:
    if not isinstance(ext, dict):
        print("NON_OBJECT_EXTENSION")
        continue
    ext_id = ext.get("id")
    if not ext_id:
        print("MISSING_ID")
    elif ext_id in seen_ids:
        print("DUPLICATE_ID: {0}".format(ext_id))
    seen_ids.add(ext_id)
    for key in ("scripts", "stylesheets"):
        for rel in ext.get(key, []) or []:
            target = os.path.join(base, rel)
            if not os.path.isfile(target):
                print("MISSING_{0}: {1}".format(key.upper(), rel))
PY

# ── 1. Real manifest is valid ────────────────────────────────────────────────

violations="$(python3 "${CHECKER}" "${MANIFEST}")"
assert_eq "manifest valid (JSON, unique ids, referenced files exist)" "" "${violations}"

# ── 1b. message-renderer ships DISABLED (native-first default) ────────────────
# Since 2026-08-26 the vendored message-renderer island is OFF by default:
# the native transcript plus the onboarding welcome
# (features/vulpy-commerce-welcome) are the product surface; the island is
# opt-in from the extensions panel. Box-level config/config.enabled_extensions
# overrides stay authoritative at runtime — this pins only the shipped repo
# default so a fresh install boots native-first.
mr_enabled="$(python3 - "${MANIFEST}" <<'PY'
import json
import sys

try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    # INVALID_JSON/INVALID_ROOT is already reported by check 1 above.
    sys.exit(0)
if not isinstance(data, dict):
    sys.exit(0)
for ext in data.get("extensions", []):
    if isinstance(ext, dict) and ext.get("id") == "message-renderer":
        value = ext.get("enabled")
        if value is True:
            print("true")
        elif value is False:
            print("false")
        else:
            print("missing")
        break
PY
)"
assert_eq "message-renderer ships enabled:false (native-first default)" "false" "${mr_enabled}"

# ── 2. Mutation self-check: the checker catches a broken manifest ────────────
# Proves the test actually detects regressions instead of passing vacuously.

BROKEN="${tmpdir}/broken-manifest.json"
DUPLICATE_ID_FILE="${tmpdir}/duplicate-id.txt"
python3 -c '
import json
import sys

try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception as exc:  # noqa: BLE001 — skip gracefully; checker reports INVALID_JSON
    print(
        "SKIP: mutation self-check could not parse the manifest "
        "({0}); skipping duplicate-id scenario".format(exc),
        file=sys.stderr,
    )
    sys.exit(0)
if not isinstance(data, dict):
    # The checker reports INVALID_ROOT; the duplicate-id scenario needs an
    # object root, so skip gracefully instead of crashing the self-check
    # with an AttributeError.
    print(
        "SKIP: mutation self-check needs an object root; skipping "
        "duplicate-id scenario (checker reports INVALID_ROOT)",
        file=sys.stderr,
    )
    sys.exit(0)
extensions = data.get("extensions", [])
if (
    not isinstance(extensions, list)
    or len(extensions) < 2
    or not isinstance(extensions[0], dict)
    or not isinstance(extensions[1], dict)
    or not extensions[1].get("id")
):
    # The duplicate-id scenario needs two well-formed entries. A shrink or
    # rename is a legitimate manifest change, so skip gracefully instead of
    # crashing the self-check with an IndexError/TypeError.
    print(
        "SKIP: mutation self-check needs >= 2 extensions with ids "
        "(found {0}); skipping duplicate-id scenario".format(
            len(extensions) if isinstance(extensions, list) else 0
        ),
        file=sys.stderr,
    )
    sys.exit(0)
# Duplicate the second extension id onto the first entry and reference a
# missing file. The id is derived from the manifest (not hardcoded) so a
# legitimate rename/reorder does not break the self-check.
duplicate_id = extensions[1]["id"]
extensions[0]["id"] = duplicate_id
extensions[0]["scripts"] = ["definitely-missing.js"]
json.dump(data, open(sys.argv[2], "w", encoding="utf-8"))
print(duplicate_id)
' "${MANIFEST}" "${BROKEN}" > "${DUPLICATE_ID_FILE}"

if [ -s "${DUPLICATE_ID_FILE}" ]; then
  broken="$(python3 "${CHECKER}" "${BROKEN}")"
  assert_match "checker reports duplicate id" "${broken}" "DUPLICATE_ID: $(cat "${DUPLICATE_ID_FILE}")"
  assert_match "checker reports missing file" "${broken}" 'MISSING_SCRIPTS: definitely-missing.js'
fi

# ── Report ───────────────────────────────────────────────────────────────────

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""

[ "${FAIL}" -eq 0 ] || exit 1
