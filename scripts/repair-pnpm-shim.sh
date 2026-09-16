#!/usr/bin/env bash
# Repair only this checkout's root node_modules/.bin/pnpm shim.
#
# Writes a portable checkout-local WRAPPER (a regular executable file) instead
# of a host-only symlink. The wrapper prefers the captured host pnpm executable
# at runtime; if that path no longer exists (e.g. the checkout is bind-mounted
# into the Fox container, which has no /usr/bin/pnpm), it falls back to
# `corepack pnpm` (Corepack resolves the version pinned by packageManager).
# If neither the host pnpm nor corepack is available the wrapper fails loudly.
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${ROOT_DIR}/node_modules/.bin/pnpm"

if [[ "$(id -u)" != "$(stat -c '%u' -- "${ROOT_DIR}")" ]]; then
  printf 'ERROR: must run as checkout owner (%s)\n' "${ROOT_DIR}" >&2
  exit 1
fi

BIN_DIR="${ROOT_DIR}/node_modules/.bin"
if [[ ! -d "${BIN_DIR}" || "$(stat -c '%u' -- "${BIN_DIR}")" != "$(id -u)" ]]; then
  printf 'ERROR: local node_modules/.bin is missing or not owned by checkout owner\n' >&2
  exit 1
fi

# Capture the host pnpm (absolute, executable) if present at repair time.
HOST_PNPM_PATH="$(command -v pnpm 2>/dev/null || true)"
if [[ -z "${HOST_PNPM_PATH}" || "${HOST_PNPM_PATH}" != /* || ! -x "${HOST_PNPM_PATH}" ]]; then
  HOST_PNPM_PATH=""
fi

# Capture corepack (absolute, executable) if present at repair time.
COREPACK_PATH="$(command -v corepack 2>/dev/null || true)"
if [[ -z "${COREPACK_PATH}" || "${COREPACK_PATH}" != /* || ! -x "${COREPACK_PATH}" ]]; then
  COREPACK_PATH=""
fi

if [[ -z "${HOST_PNPM_PATH}" && -z "${COREPACK_PATH}" ]]; then
  printf 'ERROR: no host pnpm and no corepack available; cannot repair the local pnpm shim\n' >&2
  exit 1
fi

# Best-effort version probe for diagnostics (never blocks the repair).
VERSION=""
if [[ -n "${HOST_PNPM_PATH}" ]]; then
  VERSION="$("${HOST_PNPM_PATH}" --version 2>/dev/null || true)"
else
  VERSION="$(COREPACK_ENABLE_DOWNLOAD_PROMPT=0 "${COREPACK_PATH}" pnpm --version 2>/dev/null || true)"
fi

OLD_TARGET="<absent>"
if [[ -L "${TARGET}" ]]; then
  OLD_TARGET="$(readlink -- "${TARGET}")"
elif [[ -e "${TARGET}" ]]; then
  OLD_TARGET="regular file"
fi

# Write the wrapper atomically (tmp file in the same dir, then rename).
TMP="${BIN_DIR}/.pnpm-repair.$$"
trap 'rm -f -- "${TMP}"' EXIT

{
  cat <<'WRAPPER_HEAD'
#!/usr/bin/env bash
# Checkout-local pnpm shim — written by scripts/repair-pnpm-shim.sh.
# Prefers the captured host pnpm binary at runtime; falls back to `corepack
# pnpm` (Corepack resolves the version pinned by this checkout's
# packageManager). Exits loudly if neither is available.
set -euo pipefail
WRAPPER_HEAD
  printf 'HOST_PNPM_PATH=%q\n' "${HOST_PNPM_PATH}"
  cat <<'WRAPPER_BODY'
if [[ -n "${HOST_PNPM_PATH}" && -x "${HOST_PNPM_PATH}" ]]; then
  exec "${HOST_PNPM_PATH}" "$@"
fi

if command -v corepack >/dev/null 2>&1; then
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 exec corepack pnpm "$@"
fi

printf 'ERROR: checkout-local pnpm shim: host pnpm missing (%s) and corepack unavailable\n' "${HOST_PNPM_PATH}" >&2
exit 1
WRAPPER_BODY
} > "${TMP}"

chmod 755 "${TMP}"
mv -f -- "${TMP}" "${TARGET}"
trap - EXIT

if [[ -n "${HOST_PNPM_PATH}" ]]; then
  SOURCE="host pnpm (${HOST_PNPM_PATH})"
else
  SOURCE="corepack pnpm"
fi
printf 'old target: %s\n' "${OLD_TARGET}"
printf 'source: %s\n' "${SOURCE}"
printf 'version: %s\n' "${VERSION}"
printf 'wrapper: %s\n' "${TARGET}"
