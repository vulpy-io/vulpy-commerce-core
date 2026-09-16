#!/usr/bin/env bash
# setup-workspace-acls.sh — Apply POSIX default ACLs to the Vulpy checkout.
#
# Default ACLs are set on the DIRECTORY, not individual files. Every file
# subsequently created anywhere in the tree — by Fox (uid 999), pnpm, Node,
# git, bash scripts, or coder subagents — inherits the ACL unconditionally,
# regardless of umask, uid, or creator process.  This survives container
# recreates, profile changes, and host reboots.
#
# Usage:
#   sudo bash setup-workspace-acls.sh [checkout-dir] [fox-uid] [host-uid/user]
#
# All arguments are optional; the script probes sensible defaults:
#   checkout-dir  — $1 or $ROOT_DIR or $(pwd)
#   fox-uid       — $2 or $FOX_UID or 999
#   host-user     — $3 or $DEPLOY_USER or $SUDO_USER or $(logname)
#
# Idempotent — safe to run on every `hermes up` and `repair-ownership`.
# Requires: acl package (sudo apt-get install -y acl)
# Filesystem: must be mounted with ACL support (most ext4/xfs/btrfs on Linux
# have it by default; Docker overlay2 pass-through on the bind mount honours
# the underlying host filesystem ACLs).
#
# shellcheck disable=SC2317

set -euo pipefail

ROOT_DIR="${1:-${ROOT_DIR:-$(pwd)}}"
FOX_UID="${2:-${FOX_UID:-999}}"
HOST_USER="${3:-${DEPLOY_USER:-${SUDO_USER:-$(logname 2>/dev/null || id -un)}}}"

# ── Preflight ──────────────────────────────────────────────────────────────

if [ ! -d "${ROOT_DIR}" ]; then
  echo "[acl] ERROR: checkout dir not found: ${ROOT_DIR}" >&2
  exit 1
fi

if ! command -v setfacl >/dev/null 2>&1; then
  echo "[acl] INFO: setfacl not found — installing acl package..."
  apt-get install -y --quiet acl 2>/dev/null || true
fi

if ! command -v setfacl >/dev/null 2>&1; then
  # POSIX ACLs are the durable path, but still repair the complete shared
  # checkout on systems without the acl package (minimal images or unusual
  # filesystems). Process umask=0002 in Hermes/code-server handles future
  # files; this pass repairs files already born private.
  echo "[acl] WARN: setfacl unavailable — applying checkout-wide group fallback" >&2
  find "${ROOT_DIR}" \
    \( -path "${ROOT_DIR}/.git/objects" -o \
       -path "${ROOT_DIR}/node_modules" -o \
       -path "${ROOT_DIR}/.data" -o \
       -path "${ROOT_DIR}/.tmp" -o \
       -path "${ROOT_DIR}/.next" -o \
       -path "${ROOT_DIR}/.medusa" -o \
       -path "${ROOT_DIR}/.turbo" -o \
       -path "${ROOT_DIR}/coverage" -o \
       -path "${ROOT_DIR}/environments/*/.env" \) -prune -o \
    -type d -exec chmod g+rwX {} + 2>/dev/null || true
  find "${ROOT_DIR}" \
    \( -path "${ROOT_DIR}/.git/objects" -o \
       -path "${ROOT_DIR}/node_modules" -o \
       -path "${ROOT_DIR}/.data" -o \
       -path "${ROOT_DIR}/.tmp" -o \
       -path "${ROOT_DIR}/.next" -o \
       -path "${ROOT_DIR}/.medusa" -o \
       -path "${ROOT_DIR}/.turbo" -o \
       -path "${ROOT_DIR}/coverage" -o \
       -path "${ROOT_DIR}/environments/*/.env" \) -prune -o \
    -type f -exec chmod g+rw {} + 2>/dev/null || true
  exit 0
fi

# Test whether the filesystem supports ACLs at all.
if ! setfacl -d -m u:0:r "${ROOT_DIR}" 2>/dev/null; then
  echo "[acl] SKIP: filesystem at ${ROOT_DIR} does not support POSIX ACLs." >&2
  exit 0
fi
# Clean up the probe immediately.
setfacl -x d:u:0 "${ROOT_DIR}" 2>/dev/null || true

# ── Resolve host uid ───────────────────────────────────────────────────────

HOST_UID=""
if id -u "${HOST_USER}" >/dev/null 2>&1; then
  HOST_UID="$(id -u "${HOST_USER}")"
else
  # Fall back to current user if HOST_USER is unresolvable.
  HOST_UID="$(id -u)"
  HOST_USER="$(id -un)"
fi

echo "[acl] Applying default ACLs on: ${ROOT_DIR}"
echo "[acl]   Fox container uid:  ${FOX_UID}"
echo "[acl]   Host deploy user:   ${HOST_USER} (${HOST_UID})"

# ── Build prune args for find ──────────────────────────────────────────────
# Skip node_modules, .next, .git objects, .data — they are huge and don't
# need ACL propagation (Fox doesn't write there during agent work).

PRUNE_DIRS=(
  "${ROOT_DIR}/.git/objects"
  "${ROOT_DIR}/node_modules"
  "${ROOT_DIR}/.data"
  "${ROOT_DIR}/.turbo"
  "${ROOT_DIR}/.tmp"
  "${ROOT_DIR}/apps/storefront/.next"
  "${ROOT_DIR}/apps/storefront/node_modules"
  "${ROOT_DIR}/apps/medusa-backend/node_modules"
  "${ROOT_DIR}/apps/medusa-backend/.medusa"
)

# ── Apply default ACLs ─────────────────────────────────────────────────────
# -d  = default ACL (applies to files created inside the dir)
# rwX = read/write/execute-if-dir (uppercase X)

apply_default_acl() {
  local dir="$1"
  setfacl -d -m "u:${FOX_UID}:rwX,u:${HOST_UID}:rwX" "${dir}" 2>/dev/null || true
  # Also set as access ACL so existing entries are immediately correctable.
  setfacl    -m "u:${FOX_UID}:rwX,u:${HOST_UID}:rwX" "${dir}" 2>/dev/null || true
}

# Apply to checkout root first.
apply_default_acl "${ROOT_DIR}"

# Build a find expression that prunes the heavy trees.
prune_expr=""
for p in "${PRUNE_DIRS[@]}"; do
  [ -d "${p}" ] && prune_expr="${prune_expr} -path ${p} -prune -o"
done

# Apply to all subdirectories (default ACLs only propagate to NEW files;
# we need them on every dir so newly created subdirs also inherit).
eval "find \"${ROOT_DIR}\" ${prune_expr} -type d -print" 2>/dev/null \
  | while IFS= read -r dir; do
      apply_default_acl "${dir}"
    done

# ── Apply access ACLs to existing shared skill files ────────────────────────
# Default ACLs only affect future children. Fox may already have created skill
# files with umask 077 (mode 600), which leaves code-server/host users unable
# to open or save them. Skills are shared documentation/code, not secret-bearing
# env files, so repair the existing files in this subtree explicitly.
apply_existing_skill_acl() {
  local path="$1"
  if [ -d "${path}" ]; then
    chmod g+rwX "${path}" 2>/dev/null || true
    setfacl -m "u:${FOX_UID}:rwx,u:${HOST_UID}:rwx" "${path}" 2>/dev/null || true
    setfacl -d -m "u:${FOX_UID}:rwx,u:${HOST_UID}:rwx" "${path}" 2>/dev/null || true
  elif [ -f "${path}" ]; then
    chmod g+rw "${path}" 2>/dev/null || true
    setfacl -m "u:${FOX_UID}:rw-,u:${HOST_UID}:rw-" "${path}" 2>/dev/null || true
  fi
}

SKILLS_DIR="${ROOT_DIR}/.hermes/skills"
if [ -d "${SKILLS_DIR}" ]; then
  while IFS= read -r -d '' path; do
    apply_existing_skill_acl "${path}"
  done < <(find "${SKILLS_DIR}" -print0 2>/dev/null)
fi

echo "[acl] Default ACLs set — shared skill files are readable/writable by uid ${FOX_UID} and ${HOST_USER}."
