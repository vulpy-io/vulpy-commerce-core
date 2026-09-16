#!/usr/bin/env bash
# Vulpy WebUI extension live-sync watcher.
#
# The WebUI server serves extension assets from /app/fox-overlay/webui_static,
# an image-layer copy that the entrypoint (vulpy_sync_webui_extensions, Item 8
# in scripts/hermes-fox-entrypoint.sh) refreshes only at container start. This
# watcher re-runs the same sync in the background whenever a file under
# extensions/hermes-webui changes (~1s poll), so repo edits to extension
# CSS/JS go live WITHOUT a container restart. The WebUI serves extension files
# with Cache-Control: no-store and reads them from disk per request, so a fresh
# copy + browser refresh is all that's needed.
#
# Sync semantics mirror vulpy_sync_webui_extensions exactly:
#   - manifest.json is installed at the extension root (install -m 644)
#   - features/ is pruned then re-synced so renames/removals propagate
#   - build-time tooling is never copied into the static dir: *.py files,
#     node_modules/, __pycache__/ and .pytest_cache/ anywhere in the tree
#   - install -m 644 guarantees the non-root (uid 999) WebUI server can read
#     assets even when checkout files are agent-written mode 600
#
# Launched in the background by the entrypoint (runs as root). Logs one line
# per sync to /data/logs/webui-extension-watch.log and stamps
# /data/logs/webui-extension-watch.stamp after each successful sync; the stamp
# is the change-detection reference for the next poll. Tolerates missing
# src/dst dirs (warns once per absence episode) and never crashes on a failed
# sync — it simply retries on the next poll.
#
# Paths/poll are overridable via env for testing or custom installs:
#   WEBUI_EXT_SRC  WEBUI_EXT_DST  WEBUI_EXT_STAMP  WEBUI_EXT_LOG  WEBUI_EXT_POLL_SECS
set -uo pipefail

WORKSPACE="${HERMES_WORKSPACE_PATH:-/app/workspace}"
SRC="${WEBUI_EXT_SRC:-${WORKSPACE}/extensions/hermes-webui}"
DST="${WEBUI_EXT_DST:-/app/fox-overlay/webui_static}"
STAMP="${WEBUI_EXT_STAMP:-/data/logs/webui-extension-watch.stamp}"
LOG="${WEBUI_EXT_LOG:-/data/logs/webui-extension-watch.log}"
POLL_SECS="${WEBUI_EXT_POLL_SECS:-1}"

log() {
  printf '[webui-watch] %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "${LOG}"
}

missing_reported=0

# Sync repo → overlay. Mirrors vulpy_sync_webui_extensions in
# scripts/hermes-fox-entrypoint.sh. Prints the synced asset count on success;
# returns 1 (with no output) when src/dst are unavailable OR nothing could be
# synced (e.g. unwritable dst) so the caller skips the stamp and retries.
sync_webui_extensions() {
  local synced=0
  if [ ! -d "${SRC}" ] || [ ! -d "${DST}" ]; then
    return 1
  fi
  # Manifest must stay at the extension root (the server reads it from there).
  if [ -f "${SRC}/manifest.json" ]; then
    install -m 644 "${SRC}/manifest.json" "${DST}/manifest.json"
  fi
  # features/ is Vulpy-owned (one dir per UI feature) — prune then re-sync so
  # renames and removals propagate. install -m 644 guarantees the non-root
  # WebUI server can read assets even when checkout files are mode 600.
  # A failed prune/mkdir (unwritable dst) is a hard failure — return 1 so the
  # caller does NOT touch the stamp and retries on the next poll.
  if ! rm -rf "${DST}/features" 2>/dev/null || ! mkdir -p "${DST}/features" 2>/dev/null; then
    return 1
  fi
  # Prune build-tooling dirs that may exist in the overlay from an earlier
  # full-tree sync (~197M of dead weight for node_modules alone).
  rm -rf "${DST}/node_modules" "${DST}/__pycache__" "${DST}/.pytest_cache" 2>/dev/null
  local f rel
  while IFS= read -r f; do
    [ -f "${f}" ] || continue
    case "$(basename "${f}")" in
      *.py) continue ;;
    esac
    rel="${f#${SRC}/}"
    [ "${rel}" = "manifest.json" ] && continue
    # Path-segment exclusion: build-tooling dirs anywhere in the tree
    # (e.g. features/foo/node_modules) never reach the overlay.
    case "/${rel}" in
      */node_modules/*|*/__pycache__/*|*/.pytest_cache/*) continue ;;
    esac
    if install -D -m 644 "${f}" "${DST}/${rel}"; then
      synced=$((synced + 1))
    fi
  done < <(find "${SRC}" -type f \
    ! -path "*/node_modules/*" ! -path "*/__pycache__/*" ! -path "*/.pytest_cache/*" \
    | sort)
  # Zero synced assets means the sync did nothing (unwritable dst, or all
  # installs failed) — fail so the stamp is not touched and we retry.
  [ "${synced}" -gt 0 ] || return 1
  printf '%s' "${synced}"
  return 0
}

log "watch started (src=${SRC} dst=${DST} poll=${POLL_SECS}s)"

while true; do
  if [ ! -d "${SRC}" ] || [ ! -d "${DST}" ]; then
    if [ "${missing_reported}" -eq 0 ]; then
      log "WARN: src/dst missing (src=${SRC} dst=${DST}) — waiting for them to appear"
      missing_reported=1
    fi
    sleep "${POLL_SECS}"
    continue
  fi
  missing_reported=0

  # No stamp yet → always sync on the first iteration. Otherwise only sync when
  # at least one file OR directory is newer than the last-successful-sync stamp
  # (unlink/rename bump the parent dir mtime, so deletions propagate too).
  # Build-tooling dirs never trigger a sync.
  if [ -f "${STAMP}" ] &&
     [ -z "$(find "${SRC}" \( -type f -o -type d \) \
        ! -path "*/node_modules/*" ! -path "*/__pycache__/*" ! -path "*/.pytest_cache/*" \
        -newer "${STAMP}" -print -quit 2>/dev/null)" ]; then
    sleep "${POLL_SECS}"
    continue
  fi

  if synced="$(sync_webui_extensions)"; then
    touch "${STAMP}"
    log "synced ${synced} asset(s) (${SRC} → ${DST})"
  else
    log "sync failed — will retry on next poll"
  fi
  sleep "${POLL_SECS}"
done
