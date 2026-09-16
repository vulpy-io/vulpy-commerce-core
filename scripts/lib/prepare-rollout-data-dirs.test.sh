#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPER="${ROOT_DIR}/scripts/lib/prepare-rollout-data-dirs.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

fail() { printf 'rollout-data-dirs: FAIL: %s\n' "$1" >&2; exit 1; }
[ -f "${HELPER}" ] || fail "helper is missing"
# shellcheck source=scripts/lib/prepare-rollout-data-dirs.sh
source "${HELPER}"

DATA_DIR="${TMP}/data"
vulpy_prepare_rollout_data_dirs "${DATA_DIR}" "$(id -un)" "$(id -gn)"

for directory in postgres redis matomo-db matomo caddy caddy-config medusa-static payload-media storefront-cache; do
  [ -d "${DATA_DIR}/${directory}" ] || fail "missing ${directory}"
  mode="$(stat -c '%a' "${DATA_DIR}/${directory}")"
  case "${mode}" in
    2770|2775|770|775) ;;
    *) fail "unexpected access mode ${mode} for ${directory}" ;;
  esac
done

# Existing nested content is not recursively chowned or chmodded by the helper.
mkdir -p "${DATA_DIR}/postgres/old"
printf old > "${DATA_DIR}/postgres/old/marker"
chmod 600 "${DATA_DIR}/postgres/old/marker"
vulpy_prepare_rollout_data_dirs "${DATA_DIR}" "$(id -un)" "$(id -gn)"
[ "$(stat -c '%a' "${DATA_DIR}/postgres/old/marker")" = 600 ] || fail "nested existing mode was rewritten"

printf 'rollout-data-dirs: PASS\n'
