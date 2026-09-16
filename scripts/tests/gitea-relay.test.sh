#!/usr/bin/env bash
# Unit tests for the Gitea relay push pipeline scripts.
# No Docker, no network, no Gitea required — pure contract tests.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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

# ── 1. docker-compose.hermes.yml includes Gitea service ──────────────────────

echo "--- docker-compose.hermes.yml: Gitea service present ---"

COMPOSE_FILE="${ROOT_DIR}/docker-compose.hermes.yml"

assert_true "compose file exists" test -f "${COMPOSE_FILE}"

# Service definition
assert_match "gitea service defined" \
  "$(cat "${COMPOSE_FILE}")" \
  "^\s*gitea:"

# Image
assert_match "gitea image is gitea/gitea:1-rootless" \
  "$(cat "${COMPOSE_FILE}")" \
  "image: gitea/gitea:1-rootless"

# Environment vars
assert_match "gitea INSTALL_LOCK=true" \
  "$(cat "${COMPOSE_FILE}")" \
  "GITEA__security__INSTALL_LOCK=true"

assert_match "gitea DISABLE_SSH=true" \
  "$(cat "${COMPOSE_FILE}")" \
  "GITEA__server__DISABLE_SSH=true"

assert_match "gitea DISABLE_REGISTRATION=true" \
  "$(cat "${COMPOSE_FILE}")" \
  "GITEA__service__DISABLE_REGISTRATION=true"

assert_match "gitea HTTP_PORT=3300" \
  "$(cat "${COMPOSE_FILE}")" \
  "GITEA__server__HTTP_PORT=3300"

# Volumes
assert_match "gitea-data volume declared" \
  "$(cat "${COMPOSE_FILE}")" \
  "gitea-data:"

assert_match "gitea-config volume declared" \
  "$(cat "${COMPOSE_FILE}")" \
  "gitea-config:"

# No host port binding
compose_gitea_section=$(sed -n '/^  gitea:/,/^  [a-z]/p' "${COMPOSE_FILE}" | head -n -1)
if echo "${compose_gitea_section}" | grep -qE '^\s+ports:'; then
  FAIL=$((FAIL + 1))
  echo "FAIL: gitea must NOT have host port binding" >&2
else
  PASS=$((PASS + 1))
fi

# ── 2. gitea-init.sh exists and is executable ────────────────────────────────

echo "--- gitea-init.sh ---"

GITEA_INIT="${ROOT_DIR}/scripts/gitea-init.sh"
assert_true "gitea-init.sh exists" test -f "${GITEA_INIT}"
assert_true "gitea-init.sh is executable" test -x "${GITEA_INIT}"

# Idempotency markers
assert_match "gitea-init checks for existing user" \
  "$(cat "${GITEA_INIT}")" \
  "already exists|user list|GITEA_ADMIN_EXISTS"

assert_match "gitea-init stores password" \
  "$(cat "${GITEA_INIT}")" \
  "gitea-admin-pw"

assert_match "gitea-init creates org" \
  "$(cat "${GITEA_INIT}")" \
  "org.*create|create.*org"

assert_match "gitea-init adds remote" \
  "$(cat "${GITEA_INIT}")" \
  "remote add gitea"

# ── 2b. gitea-init.sh credential hygiene (M3) ────────────────────────────────

echo "--- gitea-init.sh credential hygiene (M3) ---"

# The git remote URL must be credential-free (no admin password embedded —
# visible via `git remote -v` in a world-readable .git/config).
remote_line=$(grep '^REMOTE_URL=' "${GITEA_INIT}" || true)
if printf '%s' "${remote_line}" | grep -qE 'ADMIN_PW|@'; then
  FAIL=$((FAIL + 1))
  echo "FAIL: gitea remote URL must not embed credentials (M3)" >&2
  echo "  line: ${remote_line}" >&2
else
  PASS=$((PASS + 1))
fi

# Credentials must live in 0600 files (scoped token + credential helper).
assert_match "gitea-init uses scoped relay token file" \
  "$(cat "${GITEA_INIT}")" \
  "gitea-relay-token"

assert_match "gitea-init uses a git credential helper" \
  "$(cat "${GITEA_INIT}")" \
  "credential.*helper|cred-helper"

# ── 3. env-push.sh validation ────────────────────────────────────────────────

echo "--- env-push.sh ---"

ENV_PUSH="${ROOT_DIR}/scripts/env-push.sh"
assert_true "env-push.sh exists" test -f "${ENV_PUSH}"
assert_true "env-push.sh is executable" test -x "${ENV_PUSH}"

# Validates target
result=$(bash "${ENV_PUSH}" "invalid-target" 2>&1 || true)
assert_match "env-push rejects invalid target" \
  "${result}" \
  "target must be staging or live"

# Live requires --confirm
result=$(bash "${ENV_PUSH}" "live" 2>&1 || true)
assert_match "env-push live requires --confirm" \
  "${result}" \
  "live push requires --confirm"

# ── 3b. env-push.sh GITEA_RELAY_URL (L4) ─────────────────────────────────────

echo "--- env-push.sh gitea relay URL (L4) ---"

# Without GITEA_RELAY_URL the push step must fail with a clear message
# (the container-internal `gitea` hostname is unreachable from the host).
PUSH_TMP="${tmpdir}/push"
mkdir -p "${PUSH_TMP}/environments/staging" "${PUSH_TMP}/scripts"
printf 'VULPY_SHOP_PORT=3100\nVULPY_API_PORT=9100\n' > "${PUSH_TMP}/environments/staging/.env"
ln -s "${ROOT_DIR}/scripts/env-headroom-check.sh" "${PUSH_TMP}/scripts/env-headroom-check.sh"

result=$(cd "${PUSH_TMP}" && bash "${ENV_PUSH}" staging 2>&1 || true)
assert_match "env-push without GITEA_RELAY_URL fails with clear message" \
  "${result}" \
  "GITEA_RELAY_URL"

# With GITEA_RELAY_URL set, the guard passes (the later git push may fail
# for network reasons — that is not a "relay not configured" failure).
result=$(cd "${PUSH_TMP}" && GITEA_RELAY_URL="http://vulpy-agent:token@127.0.0.1:3300/org/workspace.git" bash "${ENV_PUSH}" staging 2>&1 || true)
assert_false "env-push with GITEA_RELAY_URL set does not refuse relay config" \
  bash -c "printf '%s' '${result}' | grep -q 'GITEA_RELAY_URL is not set'"

# ── 3c. GITEA_RELAY_URL documented in env examples (L4) ─────────────────────

echo "--- GITEA_RELAY_URL documented (L4) ---"

# The overridable-settings pattern requires every env knob to be documented
# in the matching .env.example — an operator must be able to discover
# GITEA_RELAY_URL without reading the script.
for envname in dev staging live; do
  env_example="${ROOT_DIR}/environments/${envname}/.env.example"
  assert_true "GITEA_RELAY_URL documented in ${envname}/.env.example" \
    grep -q '^GITEA_RELAY_URL=' "${env_example}"
done

# ── 4. env-headroom-check.sh ─────────────────────────────────────────────────
echo "--- env-headroom-check.sh ---"

HEADROOM="${ROOT_DIR}/scripts/env-headroom-check.sh"
assert_true "env-headroom-check.sh exists" test -f "${HEADROOM}"
assert_true "env-headroom-check.sh is executable" test -x "${HEADROOM}"

# Requires an argument
result=$(bash "${HEADROOM}" 2>&1 || true)
assert_match "env-headroom-check requires target argument" \
  "${result}" \
  "Usage|target|env"

# Reports raw MemAvailable when no tenant manifest
result=$(bash "${HEADROOM}" "staging" 2>&1 || true)
assert_match "env-headroom-check reports headroom with no tenant manifest" \
  "${result}" \
  "No tenant manifest|MemAvailable|headroom"

# L3: docker stats failure must NOT silently pass with CURRENT_MB=0 — the
# script must warn and fall back to a conservative estimate + extra margin.
assert_match "env-headroom-check warns on docker stats failure" \
  "$(cat "${HEADROOM}")" \
  "WARNING.*docker stats|conservative"

# ── 5. caddy-swap-upstream.sh ────────────────────────────────────────────────

echo "--- caddy-swap-upstream.sh ---"

CADDY_SWAP="${ROOT_DIR}/scripts/caddy-swap-upstream.sh"
assert_true "caddy-swap-upstream.sh exists" test -f "${CADDY_SWAP}"
assert_true "caddy-swap-upstream.sh is executable" test -x "${CADDY_SWAP}"

# Requires an argument
result=$(bash "${CADDY_SWAP}" 2>&1 || true)
assert_match "caddy-swap-upstream.sh requires target" \
  "${result}" \
  "Usage|target|env"

# ── 6. vulpy.sh wires env push ───────────────────────────────────────────────

echo "--- vulpy.sh env push wiring ---"

assert_match "vulpy.sh has env push case" \
  "$(cat "${ROOT_DIR}/scripts/vulpy.sh")" \
  "push\)"

# env push is NOT in the refuse_env_lifecycle list (agent CAN push).
# Anchor the sed range to the function DEFINITION line — the unanchored
# /refuse_env_lifecycle/ also matches the later call site and overflows
# `head -20`, SIGPIPE-ing sed under pipefail (exit 141).
refuse_section=$(sed -n '/^refuse_env_lifecycle()/,/^}/p' "${ROOT_DIR}/scripts/vulpy.sh" | head -20)
if echo "${refuse_section}" | grep -qw "push"; then
  FAIL=$((FAIL + 1))
  echo "FAIL: env push must NOT be refused inside Hermes (it's agent-initiated)" >&2
else
  PASS=$((PASS + 1))
fi

# ── Summary ──────────────────────────────────────────────────────────────────

echo
echo "Results: ${PASS} passed, ${FAIL} failed"
if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi
