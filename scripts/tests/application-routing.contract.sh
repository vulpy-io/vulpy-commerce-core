#!/usr/bin/env bash
# Contract: application is the public routing and Docker isolation boundary.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

# shellcheck source=scripts/lib/install-helpers.sh
source "${ROOT_DIR}/scripts/lib/install-helpers.sh"

PASS=0
FAIL=0

fail() {
  FAIL=$((FAIL + 1))
  echo "FAIL: $*" >&2
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "${expected}" = "${actual}" ]; then
    PASS=$((PASS + 1))
  else
    fail "${label} (expected=${expected} actual=${actual})"
  fi
}

assert_file_has() {
  local label="$1" file="$2" pattern="$3"
  if grep -qE -- "${pattern}" "${file}"; then
    PASS=$((PASS + 1))
  else
    fail "${label} (${file} ~ /${pattern}/)"
  fi
}

assert_file_lacks() {
  local label="$1" file="$2" pattern="$3"
  if ! grep -qE -- "${pattern}" "${file}"; then
    PASS=$((PASS + 1))
  else
    fail "${label} (${file} must not match /${pattern}/)"
  fi
}

# Two applications on one server must resolve to different Docker networks.
assert_eq "app A network" "vulpy-app-app-a" "$(vulpy_app_network_name app-a)"
assert_eq "app B network" "vulpy-app-app-b" "$(vulpy_app_network_name app-b)"
if [ "$(vulpy_app_network_name app-a)" != "$(vulpy_app_network_name app-b)" ]; then
  PASS=$((PASS + 1))
else
  fail "two applications resolved to the same Docker network"
fi

for file in docker-compose.edge.yml docker-compose.hermes.yml docker-compose.prod.yml; do
  assert_file_has "${file} uses app network" "${file}" 'VULPY_APP_NETWORK'
  assert_file_lacks "${file} drops global network" "${file}" 'name:[[:space:]]*vulpy-agent'
done

assert_file_lacks "Medusa has no cross-environment alias" docker-compose.prod.yml 'medusa-\$\{VULPY_ENV\}'
assert_file_lacks "storefront has no cross-environment alias" docker-compose.prod.yml 'storefront-\$\{VULPY_ENV\}'
assert_file_has "environment exposes only gateway alias" docker-compose.prod.yml 'gateway-\$\{VULPY_ENV\}'
assert_file_has "environment ingress resets host ports" docker-compose.application-environment.yml 'ports:[[:space:]]*!reset'
assert_file_has "application edge imports environment routes" deploy/Caddyfile.dev 'import /etc/caddy/routes/\*\.caddy'
assert_file_has "private gateway is HTTP only" deploy/Caddyfile.environment 'http://\{\$SHOP_DOMAIN\}'

# The same environment name in two apps writes to two application-owned route
# directories. The regional router/Dokploy target is the app edge, never these
# environment gateways.
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
cat > "${tmp}/app-a.env" <<'EOF'
SHOP_DOMAIN=a.example.com
PREVIEW_DOMAIN=preview.a.example.com
API_DOMAIN=api.a.example.com
MATOMO_DOMAIN=analytics.a.example.com
EOF
cat > "${tmp}/app-b.env" <<'EOF'
SHOP_DOMAIN=b.example.com
PREVIEW_DOMAIN=preview.b.example.com
API_DOMAIN=api.b.example.com
MATOMO_DOMAIN=analytics.b.example.com
EOF

vulpy_write_application_route live "${tmp}/app-a.env" "${tmp}/app-a-routes"
vulpy_write_application_route live "${tmp}/app-b.env" "${tmp}/app-b-routes"

assert_file_has "app A route targets private live gateway" "${tmp}/app-a-routes/live.caddy" 'reverse_proxy gateway-live:80'
assert_file_has "app B route targets private live gateway" "${tmp}/app-b-routes/live.caddy" 'reverse_proxy gateway-live:80'
assert_file_has "app A route owns app A host" "${tmp}/app-a-routes/live.caddy" 'a\.example\.com'
assert_file_lacks "app A route excludes app B host" "${tmp}/app-a-routes/live.caddy" 'b\.example\.com'
assert_file_has "app B route owns app B host" "${tmp}/app-b-routes/live.caddy" 'b\.example\.com'
assert_file_lacks "app B route excludes app A host" "${tmp}/app-b-routes/live.caddy" 'a\.example\.com'

echo
echo "application-routing.contract: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ]
