#!/usr/bin/env bash
# Contract: the store publishes vulpy-application.json (schema-valid) plus a
# deterministic `pnpm vulpy app ingress-target` fragment consumed by the server
# layer (per-server router today, Vulpy Control later). No Docker/Tailscale.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

PASS=0
FAIL=0

die_fail() {
  FAIL=$((FAIL + 1))
  echo "FAIL: $*" >&2
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "${expected}" = "${actual}" ]; then
    PASS=$((PASS + 1))
  else
    die_fail "${label} (expected=${expected} actual=${actual})"
  fi
}

assert_file_has() {
  local label="$1" file="$2" pattern="$3"
  if [ -f "${file}" ] && grep -qE -- "${pattern}" "${file}"; then
    PASS=$((PASS + 1))
  else
    die_fail "${label} (${file} ~ /${pattern}/)"
  fi
}

# JSON field extractors: python3 preferred, jq fallback.
json_app_id() {
  local json="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${json}" <<'PY'
import json, sys
frag = json.loads(sys.argv[1])
print(frag["appId"])
PY
  else
    jq -r '.appId' <<< "${json}"
  fi
}

json_upstream() {
  local json="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${json}" <<'PY'
import json, sys
frag = json.loads(sys.argv[1])
print(frag["upstream"])
PY
  else
    jq -r '.upstream' <<< "${json}"
  fi
}

json_env_names() {
  local json="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${json}" <<'PY'
import json, sys
frag = json.loads(sys.argv[1])
print("\n".join(frag["environments"].keys()))
PY
  else
    jq -r '.environments | to_entries[] | .key' <<< "${json}"
  fi
}

# json_env_hosts JSON ENV — "role=hostname" lines in document order.
json_env_hosts() {
  local json="$1" env="$2"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${json}" "${env}" <<'PY'
import json, sys
frag = json.loads(sys.argv[1])
env = frag["environments"].get(sys.argv[2], {})
print("\n".join(f"{k}={v}" for k, v in env.get("hosts", {}).items()))
PY
  else
    jq -r --arg env "${env}" '.environments[$env].hosts | to_entries[] | "\(.key)=\(.value)"' <<< "${json}"
  fi
}

json_custom_hosts() {
  local json="$1" env="$2"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${json}" "${env}" <<'PY'
import json, sys
frag = json.loads(sys.argv[1])
env = frag["environments"].get(sys.argv[2], {})
print("\n".join(env.get("customHosts", [])))
PY
  else
    jq -r --arg env "${env}" '.environments[$env].customHosts[]' <<< "${json}"
  fi
}

# has_top_level_targets JSON — 1 when the OLD flat `targets` key is present.
has_top_level_targets() {
  local json="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${json}" <<'PY'
import json, sys
print("1" if "targets" in json.loads(sys.argv[1]) else "0")
PY
  else
    jq -r 'if has("targets") then 1 else 0 end' <<< "${json}"
  fi
}

# --- Fixture: temp checkout root with fake edge + live envs ------------------

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

make_checkout() {
  # make_checkout DIR — copies the contract scripts into a fake checkout root.
  local dir="$1"
  mkdir -p "${dir}/scripts/lib" "${dir}/scripts/app-contract/v1" \
    "${dir}/environments/edge" "${dir}/environments/live"
  cp "${ROOT_DIR}/scripts/vulpy.sh" "${dir}/scripts/vulpy.sh"
  cp "${ROOT_DIR}/scripts/vulpy-app.sh" "${dir}/scripts/vulpy-app.sh"
  cp "${ROOT_DIR}/scripts/lib/install-helpers.sh" "${dir}/scripts/lib/install-helpers.sh"
  cp "${ROOT_DIR}/scripts/app-contract/v1/application-package.schema.json" \
    "${dir}/scripts/app-contract/v1/application-package.schema.json"
}

refresh_checkout() {
  local dir="$1"
  bash "${dir}/scripts/vulpy.sh" app ingress-target-refresh >/dev/null
}

# Main fixture: dev hosts come from the app-edge env; live from environments/live/.env.
checkout="${tmp}/checkout"
make_checkout "${checkout}"
cat > "${checkout}/.env" <<'EOF'
VULPY_APP_ID=app-contract
EOF
cat > "${checkout}/environments/edge/.env" <<'EOF'
DEV_SHOP_HOST=shop.dev.example.com
DEV_API_HOST=api.dev.example.com
ADMIN_HOST=admin.dev.example.com
ANALYTICS_HOST=analytics.dev.example.com
EDGE_HTTP_PORT=18080
EDGE_INTERNAL=1
EOF
cat > "${checkout}/environments/live/.env" <<'EOF'
SHOP_DOMAIN=shop.example.com
API_DOMAIN=api.example.com
HERMES_DOMAIN=admin.example.com
MATOMO_DOMAIN=analytics.example.com
CUSTOM_DOMAINS=buy.custom-domain.com, extra.example.com
EOF

run_app() {
  bash "${checkout}/scripts/vulpy.sh" app "$@"
}

# --- ingress-target is cache-only: missing cache fails before generation -----
set +e
run_app ingress-target >"${tmp}/missing-cache.out" 2>"${tmp}/missing-cache.err"
missing_cache_rc=$?
set -e
if [ "${missing_cache_rc}" -ne 0 ] && [ ! -s "${tmp}/missing-cache.out" ] \
  && grep -qiE 'cache|refresh|install' "${tmp}/missing-cache.err"; then
  PASS=$((PASS + 1))
else
  die_fail "ingress-target must fail cleanly when its generated cache is absent"
fi

refresh_checkout "${checkout}"

# --- ingress-target: env-structured cached fragment, exit 0 ------------------

set +e
out="$(run_app ingress-target 2>&1)"
rc=$?
set -e
assert_eq "ingress-target exit 0" "0" "${rc}"
if [ "${rc}" -ne 0 ]; then
  echo "${out}" | tail -20 >&2
fi

expected_dev_hosts="$(printf 'shop=shop.dev.example.com\nwww=www.shop.dev.example.com\napi=api.dev.example.com\nadmin=admin.dev.example.com\nanalytics=analytics.dev.example.com')"
expected_live_hosts="$(printf 'shop=shop.example.com\nwww=www.shop.example.com\napi=api.example.com\nadmin=admin.example.com\nanalytics=analytics.example.com')"

set +e
env_names="$(json_env_names "${out}" 2>/dev/null)"
envs_rc=$?
set -e
assert_eq "ingress-target output parses as JSON" "0" "${envs_rc}"
if [ "${envs_rc}" -eq 0 ]; then
  assert_eq "ingress-target env order (dev + live, no staging)" "dev
live" "${env_names}"
  assert_eq "dev hosts (role order + www)" "${expected_dev_hosts}" "$(json_env_hosts "${out}" dev)"
  assert_eq "live hosts (role order + www)" "${expected_live_hosts}" "$(json_env_hosts "${out}" live)"
  assert_eq "dev customHosts empty" "" "$(json_custom_hosts "${out}" dev)"
  assert_eq "live customHosts has custom domains" "buy.custom-domain.com
extra.example.com" "$(json_custom_hosts "${out}" live)"
  assert_eq "ingress-target upstream" "http://127.0.0.1:18080" "$(json_upstream "${out}")"
  assert_eq "ingress-target appId" "app-contract" "$(json_app_id "${out}")"
  assert_eq "old flat targets shape NOT emitted" "0" "$(has_top_level_targets "${out}")"
fi

# --- Dev-only checkout (no staging/live env files): fragment has just dev ----

devonly="${tmp}/devonly-checkout"
make_checkout "${devonly}"
echo 'VULPY_APP_ID=app-devonly' > "${devonly}/.env"
rm -rf "${devonly}/environments/live"
cat > "${devonly}/environments/edge/.env" <<'EOF'
DEV_SHOP_HOST=shop.dev.example.com
DEV_API_HOST=api.dev.example.com
ADMIN_HOST=admin.dev.example.com
ANALYTICS_HOST=analytics.dev.example.com
EDGE_HTTP_PORT=18080
EDGE_INTERNAL=1
EOF
refresh_checkout "${devonly}"
set +e
devonly_out="$(bash "${devonly}/scripts/vulpy.sh" app ingress-target 2>&1)"
devonly_rc=$?
set -e
assert_eq "dev-only ingress-target exit 0" "0" "${devonly_rc}"
if [ "${devonly_rc}" -eq 0 ]; then
  assert_eq "dev-only env names" "dev" "$(json_env_names "${devonly_out}")"
  assert_eq "dev-only appId" "app-devonly" "$(json_app_id "${devonly_out}")"
fi

# --- Wildcard DEV_SHOP_HOST: no www. entry, default upstream ----------------

wild="${tmp}/wild-checkout"
make_checkout "${wild}"
echo 'VULPY_APP_ID=app-wild' > "${wild}/.env"
rm -rf "${wild}/environments/live"
cat > "${wild}/environments/edge/.env" <<'EOF'
DEV_SHOP_HOST=*.example.com
ADMIN_HOST=admin.example.com
EOF
refresh_checkout "${wild}"
set +e
wild_out="$(bash "${wild}/scripts/vulpy.sh" app ingress-target 2>&1)"
wild_rc=$?
set -e
assert_eq "wildcard ingress-target exit 0" "0" "${wild_rc}"
if [ "${wild_rc}" -eq 0 ]; then
  assert_eq "wildcard host order (no www)" "shop=*.example.com
admin=admin.example.com" "$(json_env_hosts "${wild_out}" dev)"
  assert_eq "wildcard default upstream" "http://127.0.0.1:80" "$(json_upstream "${wild_out}")"
fi

# --- Missing ALL env files: refresh fails, no JSON on stdout -----------------

nofile="${tmp}/no-edge-checkout"
make_checkout "${nofile}"
echo 'VULPY_APP_ID=app-no-edge' > "${nofile}/.env"
rm -rf "${nofile}/environments"
set +e
bash "${nofile}/scripts/vulpy.sh" app ingress-target-refresh > "${tmp}/noedge.out" 2> "${tmp}/noedge.err"
noedge_rc=$?
set -e
if [ "${noedge_rc}" -ne 0 ] && [ ! -s "${tmp}/noedge.out" ] && grep -qiE 'edge|environment' "${tmp}/noedge.err"; then
  PASS=$((PASS + 1))
else
  die_fail "missing all env files should fail with clean stderr and no JSON stdout (rc=${noedge_rc})"
  sed 's/^/    /' "${tmp}/noedge.err" >&2 || true
fi

# --- Unsafe hostname in a staging/live env: rejected, exit != 0 --------------

bad="${tmp}/bad-checkout"
make_checkout "${bad}"
echo 'VULPY_APP_ID=app-bad' > "${bad}/.env"
cat > "${bad}/environments/edge/.env" <<'EOF'
DEV_SHOP_HOST=shop.dev.example.com
EDGE_HTTP_PORT=18080
EOF
cat > "${bad}/environments/live/.env" <<'EOF'
SHOP_DOMAIN=bad host!
API_DOMAIN=api.example.com
HERMES_DOMAIN=admin.example.com
MATOMO_DOMAIN=analytics.example.com
EOF
set +e
bash "${bad}/scripts/vulpy.sh" app ingress-target-refresh > "${tmp}/bad.out" 2> "${tmp}/bad.err"
bad_rc=$?
set -e
if [ "${bad_rc}" -ne 0 ] && [ ! -s "${tmp}/bad.out" ] && grep -qiE 'SHOP_DOMAIN|unsafe' "${tmp}/bad.err"; then
  PASS=$((PASS + 1))
else
  die_fail "unsafe hostname should be rejected with no JSON stdout (rc=${bad_rc})"
  sed 's/^/    /' "${tmp}/bad.err" >&2 || true
fi

# --- validate: passes on the real tree descriptor ----------------------------

set +e
validate_out="$(bash "${ROOT_DIR}/scripts/vulpy.sh" app validate 2>&1)"
validate_rc=$?
set -e
assert_eq "validate on real tree exit 0" "0" "${validate_rc}"
if [ "${validate_rc}" -ne 0 ]; then
  echo "${validate_out}" | tail -30 >&2
fi

# --- validate: passes on fixture checkout (self-contained) -------------------

cp "${ROOT_DIR}/vulpy-application.json" "${checkout}/vulpy-application.json"
set +e
fixture_validate="$(run_app validate 2>&1)"
fixture_rc=$?
set -e
assert_eq "validate on fixture checkout exit 0" "0" "${fixture_rc}"
if [ "${fixture_rc}" -ne 0 ]; then
  echo "${fixture_validate}" | tail -30 >&2
fi
if printf '%s' "${fixture_validate}" | grep -q 'fragment OK'; then
  PASS=$((PASS + 1))
else
  die_fail "validate on fixture should run the full fragment check (not SKIPPED)"
  echo "${fixture_validate}" | tail -10 >&2
fi

# --- validate: mutation self-check (broken descriptor must fail) -------------

break_descriptor() {
  local file="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${file}" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as fh:
    doc = json.load(fh)
del doc["lifecycle"]["import"]
with open(path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
  else
    jq 'del(.lifecycle.import)' "${file}" > "${file}.tmp" && mv "${file}.tmp" "${file}"
  fi
}

break_descriptor "${checkout}/vulpy-application.json"
set +e
broken_out="$(run_app validate 2>&1)"
broken_rc=$?
set -e
if [ "${broken_rc}" -ne 0 ] && printf '%s' "${broken_out}" | grep -qiE 'invalid|missing|lifecycle|required|import'; then
  PASS=$((PASS + 1))
else
  die_fail "broken descriptor should fail validate (rc=${broken_rc})"
  echo "${broken_out}" | tail -20 >&2
fi

# --- validate on a fresh tree (no env files): SKIPPED fragment, exit 0 ------

fresh="${tmp}/fresh-checkout"
make_checkout "${fresh}"
echo 'VULPY_APP_ID=app-fresh' > "${fresh}/.env"
cp "${ROOT_DIR}/vulpy-application.json" "${fresh}/vulpy-application.json"
rm -rf "${fresh}/environments"
set +e
fresh_out="$(bash "${fresh}/scripts/vulpy.sh" app validate 2>&1)"
fresh_rc=$?
set -e
assert_eq "validate on fresh tree (no env files) exit 0" "0" "${fresh_rc}"
if printf '%s' "${fresh_out}" | grep -q 'descriptor valid' \
  && printf '%s' "${fresh_out}" | grep -qiE 'SKIPPED'; then
  PASS=$((PASS + 1))
else
  die_fail "validate on fresh tree should print descriptor valid + SKIPPED fragment check"
  echo "${fresh_out}" | tail -10 >&2
fi

# --- EDGE_HTTP_PORT out of range / zero: rejected, exit != 0, no stdout -----

badport="${tmp}/badport-checkout"
make_checkout "${badport}"
echo 'VULPY_APP_ID=app-badport' > "${badport}/.env"
rm -rf "${badport}/environments/live"
for p in 99999 0; do
  cat > "${badport}/environments/edge/.env" <<EOF
DEV_SHOP_HOST=shop.dev.example.com
EDGE_HTTP_PORT=${p}
EOF
  set +e
  bash "${badport}/scripts/vulpy.sh" app ingress-target-refresh > "${tmp}/badport.out" 2> "${tmp}/badport.err"
  badport_rc=$?
  set -e
  if [ "${badport_rc}" -ne 0 ] && [ ! -s "${tmp}/badport.out" ] && grep -qiE 'EDGE_HTTP_PORT|port' "${tmp}/badport.err"; then
    PASS=$((PASS + 1))
  else
    die_fail "EDGE_HTTP_PORT=${p} should be rejected with no JSON stdout (rc=${badport_rc})"
    sed 's/^/    /' "${tmp}/badport.err" >&2 || true
  fi
done

# --- Schema drift guard: stale vendored copy + platform reference present ---

drift="${tmp}/drift-checkout"
make_checkout "${drift}"
echo 'VULPY_APP_ID=app-drift' > "${drift}/.env"
cp "${ROOT_DIR}/vulpy-application.json" "${drift}/vulpy-application.json"
cat > "${drift}/environments/edge/.env" <<'EOF'
DEV_SHOP_HOST=shop.dev.example.com
ADMIN_HOST=admin.example.com
EOF
refresh_checkout "${drift}"
platform_schema_dir="${tmp}/platform-schema"
mkdir -p "${platform_schema_dir}"
cp "${drift}/scripts/app-contract/v1/application-package.schema.json" \
  "${platform_schema_dir}/application-package.schema.json"
# Simulate a platform schema bump so checksums diverge from the vendored copy.
sed -i 's/Product-neutral contract consumed by Vulpy Control./Product-neutral contract consumed by Vulpy Control (platform bump)./' \
  "${platform_schema_dir}/application-package.schema.json"
set +e
drift_out="$(PLATFORM_SCHEMA="${platform_schema_dir}/application-package.schema.json" \
  bash "${drift}/scripts/vulpy.sh" app validate 2>&1)"
drift_rc=$?
set -e
assert_eq "schema drift validate exit 0 (warning is non-fatal)" "0" "${drift_rc}"
if printf '%s' "${drift_out}" | grep -qiE 'drift|differs|WARNING'; then
  PASS=$((PASS + 1))
else
  die_fail "schema drift should warn on stderr"
  echo "${drift_out}" | tail -10 >&2
fi

# --- No secrets in the fragment ---------------------------------------------

assert_file_has "descriptor declares ingress targetCommand" \
  "${ROOT_DIR}/vulpy-application.json" '"targetCommand": \["bash", "scripts/vulpy-app.sh", "ingress-target"\]'
assert_file_has "installer automatically refreshes ingress cache" \
  "${ROOT_DIR}/scripts/vulpy-install.sh" 'vulpy-app\.sh.*ingress-target-refresh'
assert_file_has "environment sync automatically refreshes ingress cache" \
  "${ROOT_DIR}/scripts/vulpy.sh" 'vulpy-app\.sh.*ingress-target-refresh'
if printf '%s' "${out}" | grep -qE 'PASSWORD|SECRET|_HASH=|pk_|sk_|eyJ'; then
  die_fail "ingress-target output leaked a secret-looking value"
else
  PASS=$((PASS + 1))
fi

# Prove the descriptor command has no read dependency on tenant secrets.
chmod 000 "${checkout}/.env" "${checkout}/environments/edge/.env" \
  "${checkout}/environments/live/.env"
set +e
cache_only_out="$(run_app ingress-target 2>"${tmp}/cache-only.err")"
cache_only_rc=$?
set -e
assert_eq "ingress-target succeeds with all tenant env files unreadable" "0" "${cache_only_rc}"
assert_eq "cache-only output remains deterministic" "${out}" "${cache_only_out}"
assert_eq "generated cache mode is public-readable secret-free data" "644" \
  "$(stat -c '%a' "${checkout}/.vulpy/ingress-target.json")"
assert_eq "generated cache directory is traversable" "755" \
  "$(stat -c '%a' "${checkout}/.vulpy")"

echo
echo "app-contract.contract: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ]
