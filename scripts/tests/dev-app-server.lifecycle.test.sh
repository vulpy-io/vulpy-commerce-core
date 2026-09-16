#!/usr/bin/env bash
# Regression: a live logger PID is not "running" unless both assigned app ports listen;
# start cleans stale workspace processes; start REFUSES to spawn into a port held by a
# foreign process (EADDRINUSE doom — seen live 2026-08-26, hectorfinch EU box).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT_DIR}/scripts/dev-app-server.sh"
TMP="$(mktemp -d)"
SHOP_PID=""
STARTED_PID=""
LEGACY_TURBO_PID=""
fail_count=0
cleanup() {
  [ -z "${STARTED_PID}" ] || kill "${STARTED_PID}" 2>/dev/null || true
  [ -z "${LEGACY_TURBO_PID}" ] || kill "${LEGACY_TURBO_PID}" 2>/dev/null || true
  [ -z "${SHOP_PID}" ] || kill "${SHOP_PID}" 2>/dev/null || true
  rm -rf "${TMP}"
}
trap cleanup EXIT

mkdir -p "${TMP}/workspace/node_modules" "${TMP}/bin"
SHOP_PORT="$((32000 + RANDOM % 5000))"
API_PORT="$((37000 + RANDOM % 5000))"

# Keep only the storefront port alive; the Medusa port intentionally remains dead.
python3 -m http.server "${SHOP_PORT}" --bind 127.0.0.1 >"${TMP}/shop.log" 2>&1 &
SHOP_PID=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if bash -c "echo >/dev/tcp/127.0.0.1/${SHOP_PORT}" 2>/dev/null; then break; fi
  sleep 0.1
done

# Simulate the surviving logger from a partially crashed turbo pipeline.
sleep 60 &
STALE_PID=$!
mkdir -p "${TMP}/workspace/.tmp/dev"
printf '%s\n' "${STALE_PID}" >"${TMP}/workspace/.tmp/dev/dev.pid"
# The legacy launcher tracked awk instead of this workspace-local turbo process.
(cd "${TMP}/workspace" && exec -a "turbo run dev legacy-partial" sleep 60) &
LEGACY_TURBO_PID=$!

set +e
status_out="$(
  VULPY_DEV_WORKSPACE="${TMP}/workspace" \
  VULPY_SHOP_PORT="${SHOP_PORT}" VULPY_API_PORT="${API_PORT}" \
  bash "${SCRIPT}" status 2>&1
)"
status_rc=$?
set -e
if [ "${status_rc}" -eq 0 ]; then
  echo "FAIL: status accepted a live logger PID with dead Medusa port: ${status_out}" >&2
  exit 1
fi
printf '%s' "${status_out}" | grep -qiE 'stale|partial|unhealthy' || {
  echo "FAIL: status did not explain stale/partial state: ${status_out}" >&2
  exit 1
}

cat >"${TMP}/bin/node" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"${TMP}/bin/setsid" <<EOF
#!/usr/bin/env bash
printf 'started\n' >> '${TMP}/setsid.called'
exec sleep 60
EOF
chmod +x "${TMP}/bin/node" "${TMP}/bin/setsid"

# Port-squat contract: with a FOREIGN process holding the storefront port,
# start must clean its own leftovers, then REFUSE loudly — never spawn a turbo
# pipeline that cannot bind (which is how tenants go dark hours later).
set +e
squat_out="$(
  PATH="${TMP}/bin:${PATH}" \
  VULPY_DEV_WORKSPACE="${TMP}/workspace" \
  VULPY_SHOP_PORT="${SHOP_PORT}" VULPY_API_PORT="${API_PORT}" \
  VULPY_DEV_STALL_GUARD=off \
  bash "${SCRIPT}" start 2>&1
)"
squat_rc=$?
set -e
if [ "${squat_rc}" -eq 0 ]; then
  echo "FAIL: start proceeded despite a foreign process squatting the shop port:" >&2
  echo "${squat_out}" >&2
  exit 1
fi
printf '%s' "${squat_out}" | grep -qiE 'foreign|conflict|refus' || {
  echo "FAIL: start did not explain the port conflict:" >&2
  echo "${squat_out}" >&2
  exit 1
}
[ -f "${TMP}/setsid.called" ] && {
  echo "FAIL: start spawned a pipeline into the port conflict" >&2
  exit 1
}

# Freeing the port makes start viable — and it must have ALREADY cleaned the
# stale tracked processes during the refused attempt (not just deferred them).
kill "${SHOP_PID}" 2>/dev/null || true
SHOP_PID=""
for _ in $(seq 1 20); do
  bash -c "echo >/dev/tcp/127.0.0.1/${SHOP_PORT}" 2>/dev/null || break
  sleep 0.2
done

start_out="$(
  PATH="${TMP}/bin:${PATH}" \
  VULPY_DEV_WORKSPACE="${TMP}/workspace" \
  VULPY_SHOP_PORT="${SHOP_PORT}" VULPY_API_PORT="${API_PORT}" \
  VULPY_DEV_STALL_GUARD=off \
  bash "${SCRIPT}" start 2>&1
)"
[ -f "${TMP}/setsid.called" ] || {
  echo "FAIL: start did not relaunch after stale partial state: ${start_out}" >&2
  exit 1
}
if kill -0 "${STALE_PID}" 2>/dev/null; then
  echo "FAIL: start left stale tracked logger PID ${STALE_PID} alive" >&2
  exit 1
fi
if kill -0 "${LEGACY_TURBO_PID}" 2>/dev/null; then
  echo "FAIL: start left legacy workspace turbo PID ${LEGACY_TURBO_PID} alive" >&2
  exit 1
fi
LEGACY_TURBO_PID=""
STARTED_PID="$(cat "${TMP}/workspace/.tmp/dev/dev.pid")"

# Stopping one tenant must not kill an unrelated turbo process from another tenant.
bash -c 'exec -a "turbo run dev unrelated-tenant" sleep 60' &
UNRELATED_PID=$!
VULPY_DEV_WORKSPACE="${TMP}/workspace" \
VULPY_SHOP_PORT="${SHOP_PORT}" VULPY_API_PORT="${API_PORT}" \
bash "${SCRIPT}" stop >/dev/null
STARTED_PID=""
if ! kill -0 "${UNRELATED_PID}" 2>/dev/null; then
  echo "FAIL: stop killed an unrelated tenant turbo process" >&2
  exit 1
fi
kill "${UNRELATED_PID}" 2>/dev/null || true

echo "dev-app-server.lifecycle: 7 passed, 0 failed"
