#!/usr/bin/env bash
# Media-serving contract guard for the WebUI (extensions/hermes-webui).
#
# Background (2026-08-26 native-first onboarding batch):
#   - The retired custom renderer once fetched images from "/api/img".
#     That endpoint no longer exists anywhere; any reintroduction would 404
#     silently inside markdown rendering. Guard the repo against regressions.
#   - The CORRECTED serving contract (verified against api/routes.py):
#       GET /api/media?path=<abs>&session_id=<sid>
#           Agent-emitted MEDIA:<abs-path> tokens render through this
#           (_handle_media, routes.py) — allowlisted roots only (hermes home,
#           /tmp, active workspace, MEDIA_ALLOWED_ROOTS).
#       POST /api/upload
#           Chat uploads land in the per-session attachment inbox
#           (_session_attachment_dir, api/upload.py — HERMES_WEBUI_ATTACHMENT_DIR).
#       GET /api/file/raw?session_id=<sid>&path=<rel>
#           Serves workspace-relative files first, then falls back to that
#           same per-session upload inbox (_file_raw_target, routes.py).
#   There is NO /session/<sid>/attachments route — early diagnosis assumed
#   one; docs/media-paths.md documents the corrected contract.
#
# Checks here are repository-only (CI-safe) by default: repo scan for the dead
# endpoint, mutation self-check proving the scanner detects it, pinned doc
# presence, and — when the box's /app/hermes-webui tree is present — the
# installed routes still expose the serving contract above. An authenticated
# runtime probe is enabled only when HERMES_WEBUI_PASSWORD and a real assistant
# session fixture are supplied; CI without those prerequisites reports an
# explicit SKIP rather than pretending to exercise the live API.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBUI="${ROOT_DIR}/extensions/hermes-webui"

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

# ── Shared scanner: report dead-endpoint references ─────────────────────────
# Excludes node_modules, .git, and files whose PURPOSE is to discuss the
# retired endpoint (this test's pattern literals; docs/media-paths.md).
# NOTE: stay in find/xargs land — never insert a text-stage grep between
# `find -print0` and `xargs -0`, because the NUL stream makes grep treat the
# whole thing as binary and drop every path.
scan_dead_endpoints() {
  local base="$1"
  if [ ! -d "${base}" ]; then
    return 0
  fi
  local self="${BASH_SOURCE[0]}"
  local media_doc="${base}/docs/media-paths.md"
  if [ -f "${media_doc}" ]; then
    find "${base}" \
      \( -name node_modules -o -name .git \) -prune -o \
      -type f ! -samefile "${self}" ! -samefile "${media_doc}" \
      \( -name '*.js' -o -name '*.mjs' -o -name '*.ts' -o -name '*.tsx' \
         -o -name '*.py' -o -name '*.sh' -o -name '*.json' \
         -o -name '*.md' -o -name '*.html' -o -name '*.css' \) -print0 |
      xargs -0r grep -n "api/img" 2>/dev/null || true
  else
    find "${base}" \
      \( -name node_modules -o -name .git \) -prune -o \
      -type f ! -samefile "${self}" \
      \( -name '*.js' -o -name '*.mjs' -o -name '*.ts' -o -name '*.tsx' \
         -o -name '*.py' -o -name '*.sh' -o -name '*.json' \
         -o -name '*.md' -o -name '*.html' -o -name '*.css' \) -print0 |
      xargs -0r grep -n "api/img" 2>/dev/null || true
  fi
}

# ── 1. Repo scan: zero references to the retired /api/img endpoint ──────────

violations="$(scan_dead_endpoints "${WEBUI}")"
assert_eq "no dead /api/img references in extensions/hermes-webui" "" "${violations}"

scripted="$(scan_dead_endpoints "${ROOT_DIR}/scripts")"
assert_eq "no dead /api/img references in scripts/" "" "${scripted}"

# ── 2. Mutation self-check: the scanner actually detects the pattern ────────

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "${tmpdir}"; }
trap cleanup EXIT

printf 'const url = "api/img?x=1"; // seeded violation\n' > "${tmpdir}/seeded.js"
seeded="$(scan_dead_endpoints "${tmpdir}")"
case "${seeded}" in
  *"api/img"*) PASS=$((PASS + 1)) ;;
  *) FAIL=$((FAIL + 1)); echo "FAIL: scanner mutation self-check did not flag seeded api/img violation" >&2 ;;
esac

# ── 3. Corrected-contract doc ships with the repo ───────────────────────────

DOC="${WEBUI}/docs/media-paths.md"
if [ -f "${DOC}" ]; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  echo "FAIL: ${DOC} missing (corrected media-serving contract must be documented)" >&2
fi
if [ -f "${DOC}" ] && grep -q "api/file/raw" "${DOC}" && grep -q "api/media" "${DOC}"; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  echo "FAIL: ${DOC} must document both /api/media and /api/file/raw contracts" >&2
fi

# ── 4. Installed-box cross-check (skipped off-box / in CI) ──────────────────
# When the container's live hermes-webui API tree is present, pin its shape:
# /api/media handler, /api/file/raw resolution incl. the upload-inbox
# fallback, and no resurrected /api/img dispatcher.

BOX_ROUTES="/app/hermes-webui/api/routes.py"
if [ -f "${BOX_ROUTES}" ]; then
  grep -q "def _handle_media(" "${BOX_ROUTES}" &&
    PASS=$((PASS + 1)) ||
    { FAIL=$((FAIL + 1)); echo "FAIL: installed routes.py lost _handle_media" >&2; }

  grep -q '_handle_media(handler, parsed)' "${BOX_ROUTES}" &&
    PASS=$((PASS + 1)) ||
    { FAIL=$((FAIL + 1)); echo "FAIL: installed routes.py does not dispatch _handle_media" >&2; }

  grep -q "_session_attachment_dir(sid)" "${BOX_ROUTES}" &&
    PASS=$((PASS + 1)) ||
    { FAIL=$((FAIL + 1)); echo "FAIL: /api/file/raw no longer falls back to the per-session upload inbox" >&2; }

  box_img="$(grep -c "api/img" "${BOX_ROUTES}" || true)"
  assert_eq "installed routes.py exposes no /api/img" "0" "${box_img}"
fi

# ── 5. Authenticated runtime probe (opt-in; safe to skip in CI) ─────────────
# The assistant MEDIA path must come from an existing assistant message, not a
# test-authored token. Set HERMES_WEBUI_MEDIA_SESSION_ID to a session containing
# such a message. The probe creates only a temporary upload in that session's
# inbox and removes its local temporary files on exit.
runtime_tmp="$(mktemp -d)"
runtime_cleanup() { rm -rf "${runtime_tmp}"; }
trap 'runtime_cleanup; cleanup' EXIT

runtime_skip() {
  echo "SKIP: runtime media probe — $1"
}

runtime_fail() {
  FAIL=$((FAIL + 1))
  echo "FAIL: runtime media probe — $1" >&2
}

if ! command -v curl >/dev/null 2>&1; then
  runtime_skip "curl is unavailable (static contract checks still ran)"
elif [ -z "${HERMES_WEBUI_PASSWORD:-}" ]; then
  runtime_skip "HERMES_WEBUI_PASSWORD is not set (no secret is hardcoded)"
elif [ -z "${HERMES_WEBUI_MEDIA_SESSION_ID:-}" ]; then
  runtime_skip "HERMES_WEBUI_MEDIA_SESSION_ID is not set to an assistant-media fixture"
else
  WEBUI_URL="${HERMES_WEBUI_URL:-http://127.0.0.1:8787}"
  WEBUI_URL="${WEBUI_URL%/}"
  cookie_jar="${runtime_tmp}/cookies.txt"
  login_body="${runtime_tmp}/login.json"
  session_body="${runtime_tmp}/session.json"
  media_body="${runtime_tmp}/assistant-media.bin"
  upload_body="${runtime_tmp}/upload.json"
  upload_result="${runtime_tmp}/uploaded.bin"

  login_payload="$(HERMES_WEBUI_PASSWORD="${HERMES_WEBUI_PASSWORD}" python3 -c 'import json, os; print(json.dumps({"password": os.environ["HERMES_WEBUI_PASSWORD"]}))')"
  login_status="$(curl -sS --connect-timeout 2 --max-time 10 \
    -o "${login_body}" -c "${cookie_jar}" -w '%{http_code}' \
    -H 'Content-Type: application/json' --data "${login_payload}" \
    "${WEBUI_URL}/api/auth/login" 2>/dev/null || true)"
  if [ "${login_status}" != "200" ]; then
    runtime_fail "WebUI login failed (HTTP ${login_status:-connection-failed})"
  else
    session_id="${HERMES_WEBUI_MEDIA_SESSION_ID}"
    encoded_session="$(SESSION_ID="${session_id}" python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["SESSION_ID"], safe=""))')"
    session_status="$(curl -sS --connect-timeout 2 --max-time 10 \
      -o "${session_body}" -b "${cookie_jar}" -w '%{http_code}' \
      "${WEBUI_URL}/api/session?session_id=${encoded_session}" 2>/dev/null || true)"
    if [ "${session_status}" != "200" ]; then
      runtime_fail "assistant session fixture unavailable (HTTP ${session_status:-connection-failed})"
    else
      assistant_media_path="$(python3 - "${session_body}" <<'PY'
import json
import re
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text())
token = re.compile(r"MEDIA:([^\\s\\)\\]]+)")

# Search the returned session payload, accepting tokens only from assistant
# messages. The session fixture is the evidence that the token was
# assistant-emitted; the endpoint probe below is the serving assertion.
def assistant_tokens(value):
    if isinstance(value, dict):
        if value.get("role") == "assistant":
            yield from token.findall(str(value.get("content", "")))
            return
        for child in value.values():
            yield from assistant_tokens(child)
    elif isinstance(value, list):
        for child in value:
            yield from assistant_tokens(child)

for candidate in assistant_tokens(payload):
    path = Path(candidate.split("?", 1)[0])
    if path.is_file() and path.stat().st_size > 0:
        print(candidate)
        break
PY
      )"
      if [ -z "${assistant_media_path}" ]; then
        runtime_fail "assistant session contains no existing MEDIA token with non-empty bytes"
      else
        encoded_media="$(MEDIA_PATH="${assistant_media_path}" python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["MEDIA_PATH"], safe=""))')"
        media_status="$(curl -sS --connect-timeout 2 --max-time 10 \
          -o "${media_body}" -b "${cookie_jar}" -w '%{http_code}' \
          "${WEBUI_URL}/api/media?path=${encoded_media}&session_id=${encoded_session}" \
          2>/dev/null || true)"
        if [ "${media_status}" = "200" ] && [ -s "${media_body}" ]; then
          PASS=$((PASS + 1))
          echo "PASS: assistant MEDIA path served via /api/media (200 + non-empty bytes)"
        else
          FAIL=$((FAIL + 1))
          echo "FAIL: assistant MEDIA path /api/media runtime probe (HTTP ${media_status:-connection-failed}, bytes=$(wc -c < "${media_body}" 2>/dev/null || echo 0))" >&2
        fi

        fixture="${runtime_tmp}/webui-upload-fixture.txt"
        printf 'webui media contract fixture\n' > "${fixture}"
        upload_status="$(curl -sS --connect-timeout 2 --max-time 10 \
          -o "${upload_body}" -b "${cookie_jar}" -w '%{http_code}' \
          -F "session_id=${session_id}" -F "file=@${fixture};filename=media-contract-fixture.txt" \
          "${WEBUI_URL}/api/upload" 2>/dev/null || true)"
        uploaded_name="$(python3 - "${upload_body}" <<'PY'
import json
import sys
from pathlib import Path
try:
    data = json.loads(Path(sys.argv[1]).read_text())
    print(data.get("filename", ""))
except (OSError, json.JSONDecodeError):
    print("")
PY
        )"
        if [ "${upload_status}" = "200" ] && [ -n "${uploaded_name}" ]; then
          encoded_name="$(UPLOADED_NAME="${uploaded_name}" python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["UPLOADED_NAME"], safe=""))')"
          raw_status="$(curl -sS --connect-timeout 2 --max-time 10 \
            -o "${upload_result}" -b "${cookie_jar}" -w '%{http_code}' \
            "${WEBUI_URL}/api/file/raw?session_id=${encoded_session}&path=${encoded_name}" \
            2>/dev/null || true)"
          if [ "${raw_status}" = "200" ] && [ -s "${upload_result}" ]; then
            PASS=$((PASS + 1))
            echo "PASS: uploaded session-inbox file served via /api/file/raw (200 + non-empty bytes)"
          else
            FAIL=$((FAIL + 1))
            echo "FAIL: uploaded session-inbox /api/file/raw runtime probe (HTTP ${raw_status:-connection-failed}, bytes=$(wc -c < "${upload_result}" 2>/dev/null || echo 0))" >&2
          fi

          missing_name="media-contract-missing-$(basename "${runtime_tmp}").txt"
          encoded_missing="$(MISSING_NAME="${missing_name}" python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["MISSING_NAME"], safe=""))')"
          missing_status="$(curl -sS --connect-timeout 2 --max-time 10 \
            -o "${runtime_tmp}/missing.json" -b "${cookie_jar}" -w '%{http_code}' \
            "${WEBUI_URL}/api/file/raw?session_id=${encoded_session}&path=${encoded_missing}" \
            2>/dev/null || true)"
          assert_eq "missing session-inbox file returns HTTP 404" "404" "${missing_status}"
        else
          FAIL=$((FAIL + 1))
          echo "FAIL: upload fixture could not be created (HTTP ${upload_status:-connection-failed})" >&2
        fi
      fi
    fi
  fi
fi

# ── Report ──────────────────────────────────────────────────────────────────

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""

[ "${FAIL}" -eq 0 ] || exit 1
