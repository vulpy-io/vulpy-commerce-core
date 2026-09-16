#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROLLOUT="${ROOT_DIR}/deploy/cloud/cloud-store-rollout.sh"
DATA_HELPER="${ROOT_DIR}/scripts/lib/prepare-rollout-data-dirs.sh"


fail() { printf 'rollout-hardening: FAIL: %s\n' "$1" >&2; exit 1; }
for file in "${ROLLOUT}" "${DATA_HELPER}"; do
  [ -f "${file}" ] || fail "missing ${file}"
done

grep -Fq 'prepare-rollout-data-dirs.sh' "${ROLLOUT}" || fail "rollout does not prepare data roots"
grep -Fq 'vulpy_prepare_rollout_data_dirs' "${ROLLOUT}" || fail "rollout helper call missing"

for directory in postgres redis matomo-db matomo caddy caddy-config medusa-static payload-media storefront-cache; do
  grep -Fq "${directory}" "${DATA_HELPER}" || fail "data root missing: ${directory}"
done
if grep -Eq 'chown[^\n]*-R|chown -R[^\n]*/data|chown[^\n]*/data[^\n]*-R' "${ROLLOUT}" "${DATA_HELPER}"; then
  fail "recursive data-directory chown is forbidden"
fi
grep -Fq 'umask 0002' "${DATA_HELPER}" || fail "shared umask is not preserved"
grep -Fq 'setfacl' "${DATA_HELPER}" || fail "existing ACL support is absent"

printf 'rollout-hardening: PASS\n'
