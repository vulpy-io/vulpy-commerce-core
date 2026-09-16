#!/usr/bin/env bash
# fox-state.sh — persist/restore Fox HOME state across container restarts & rebuilds.
#
# Why: HOME (/app) lives in the container writable layer and is wiped whenever the
# container is recreated or the image is rebuilt. /data (host .data/hermes/) is the
# only durable container store. This script copies the small set of per-user config
# that must survive (gh auth, git config, shell rc, ssh) between HOME and
# /data/config/.
#
# Usage:
#   bash scripts/fox-state.sh save     # after gh auth login / git config changes
#   bash scripts/fox-state.sh restore  # at container boot (entrypoint) or manually
#   bash scripts/fox-state.sh status   # show what is persisted vs missing
#
# Design rules:
#   - User-agnostic: runs correctly as root (entrypoint) or foxinthebox (manual).
#   - cp -a preserves ownership; when root restores files saved by foxinthebox,
#     ownership stays foxinthebox (uid 999 is stable inside the container).
#   - Non-destructive: save never deletes; restore only writes files present in /data.
set -euo pipefail

# Resolution order: explicit override → fox user's passwd home → $HOME → /app.
# The entrypoint runs as uid 999 with a non-/app HOME, so $HOME alone is not
# reliable at boot (issue #97).
if [ -n "${FOX_STATE_HOME:-}" ]; then
  HOME_DIR="${FOX_STATE_HOME}"
elif command -v getent >/dev/null 2>&1 && getent passwd "${FOX_STATE_USER:-foxinthebox}" >/dev/null 2>&1; then
  HOME_DIR="$(getent passwd "${FOX_STATE_USER:-foxinthebox}" | cut -d: -f6)"
else
  HOME_DIR="${HOME:-/app}"
fi
DATA_DIR="${FOX_STATE_DATA:-/data/config}"
TARGET_USER="${FOX_STATE_USER:-foxinthebox}"

# name|home_path|persisted_dir_or_file|mode_for_restore
# Add future durable state here — one line per slot.
STATE_ITEMS=(
  "gh|${HOME_DIR}/.config/gh|gh|600"
  "gitconfig|${HOME_DIR}/.gitconfig|gitconfig|644"
  "bashrc|${HOME_DIR}/.bashrc|bashrc|644"
  "ssh|${HOME_DIR}/.ssh|ssh|700"
)

log()  { echo "[fox-state] $*"; }
warn() { echo "[fox-state] WARN: $*" >&2; }

is_root() { [ "$(id -u)" = "0" ]; }

# Run a command as the fox user when invoked as root, else as the current user.
# HOME is set explicitly because su may derive a different home from passwd.
run_as_fox() {
  local cmd="$1"
  if is_root && command -v su >/dev/null 2>&1; then
    su "${TARGET_USER}" -s /bin/bash -c "export HOME='${HOME_DIR}'; ${cmd}"
  else
    bash -c "export HOME='${HOME_DIR}'; ${cmd}"
  fi
}

# Field parsing helper: reads name|src|dst|mode from STATE_ITEMS entries.
# Usage: parse_item "${item}" → sets ITEM_NAME, ITEM_SRC, ITEM_DST, ITEM_MODE
parse_item() {
  local item="$1" rest
  ITEM_NAME="${item%%|*}"
  rest="${item#*|}"
  ITEM_SRC="${rest%%|*}"
  rest="${rest#*|}"
  ITEM_DST="${rest%%|*}"
  ITEM_MODE="${rest#*|}"
}

# Apply restrictive perms: directories 700 (+ files inside 600), files 600/644.
set_restore_modes() {
  local path="$1" mode="$2"
  if [ -d "${path}" ]; then
    chmod 700 "${path}"
    find "${path}" -type f -exec chmod 600 {} +
  else
    chmod "${mode}" "${path}"
  fi
}

cmd_save() {
  local created=0
  mkdir -p "${DATA_DIR}"
  for item in "${STATE_ITEMS[@]}"; do
    parse_item "${item}"
    [ -e "${ITEM_SRC}" ] || continue
    # rm first so re-saves never nest (cp -a dir into existing dir would nest).
    rm -rf "${DATA_DIR}/${ITEM_DST}"
    cp -a "${ITEM_SRC}" "${DATA_DIR}/${ITEM_DST}"
    created=$((created + 1))
    log "saved ${ITEM_NAME}: ${ITEM_SRC} -> ${DATA_DIR}/${ITEM_DST}"
  done
  log "save complete (${created} item(s) persisted)"
}

cmd_restore() {
  local restored=0
  for item in "${STATE_ITEMS[@]}"; do
    parse_item "${item}"
    [ -e "${DATA_DIR}/${ITEM_DST}" ] || continue
    # rm first: restore = replace home state with the persisted copy (idempotent).
    rm -rf "${ITEM_SRC}"
    mkdir -p "$(dirname "${ITEM_SRC}")"
    cp -a "${DATA_DIR}/${ITEM_DST}" "${ITEM_SRC}"
    set_restore_modes "${ITEM_SRC}" "${ITEM_MODE}"
    restored=$((restored + 1))
    log "restored ${ITEM_NAME}: ${DATA_DIR}/${ITEM_DST} -> ${ITEM_SRC}"
  done

  # Post-restore wiring (idempotent, non-fatal).
  if command -v gh >/dev/null 2>&1 && [ -f "${HOME_DIR}/.config/gh/hosts.yml" ]; then
    if run_as_fox "gh auth setup-git >/dev/null 2>&1"; then
      log "gh auth setup-git: ok"
    else
      warn "gh auth setup-git failed (non-fatal; git over HTTPS may need a manual re-setup)"
    fi
  fi
  if command -v git >/dev/null 2>&1 && [ -d "${HOME_DIR}/workspace" ]; then
    if ! git config --global --get-all safe.directory 2>/dev/null | grep -qx "${HOME_DIR}/workspace"; then
      run_as_fox "git config --global --add safe.directory '${HOME_DIR}/workspace' || true"
    fi
  fi
  log "restore complete (${restored} item(s) restored)"
}

cmd_status() {
  echo "[fox-state] HOME=${HOME_DIR}  DATA=${DATA_DIR}"
  for item in "${STATE_ITEMS[@]}"; do
    parse_item "${item}"
    local home_state data_state="missing"
    [ -e "${ITEM_SRC}" ] && home_state="present" || home_state="missing"
    [ -e "${DATA_DIR}/${ITEM_DST}" ] && data_state="persisted"
    printf '  %-10s home=%-7s /data/config=%-10s\n' "${ITEM_NAME}" "${home_state}" "${data_state}"
  done
}

case "${1:-}" in
  save)    cmd_save ;;
  restore) cmd_restore ;;
  status)  cmd_status ;;
  *) echo "usage: $0 {save|restore|status}" >&2; exit 2 ;;
esac
