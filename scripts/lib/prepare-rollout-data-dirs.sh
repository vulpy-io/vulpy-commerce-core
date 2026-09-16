#!/usr/bin/env bash
# Prepare the Pro rollout's bind-mount roots without walking the data tree.
# Arguments: DATA_DIR OWNER GROUP. Only the directory entries named here are
# touched; existing files and nested trees retain their ACLs and modes.

vulpy_prepare_rollout_data_dirs() {
  local data_dir="${1:?DATA_DIR is required}"
  local owner="${2:?owner is required}"
  local group="${3:?group is required}"
  local old_umask directory
  local directories=(
    "${data_dir}"
    "${data_dir}/postgres"
    "${data_dir}/redis"
    "${data_dir}/matomo-db"
    "${data_dir}/matomo"
    "${data_dir}/caddy"
    "${data_dir}/caddy-config"
    "${data_dir}/medusa-static"
    "${data_dir}/payload-media"
    "${data_dir}/storefront-cache"
  )

  old_umask="$(umask)"
  umask 0002
  for directory in "${directories[@]}"; do
    install -d -m 2770 "${directory}"
    chown "${owner}:${group}" "${directory}"
  done
  umask "${old_umask}"

  # Apply only to the mount roots. Do not recurse: Postgres/Redis/Matomo may
  # own files below these paths, and recursive /data chown breaks live state.
  if command -v setfacl >/dev/null 2>&1; then
    for directory in "${directories[@]}"; do
      setfacl -m "g:${group}:rwx" -d -m "g:${group}:rwx" "${directory}" 2>/dev/null || true
    done
  fi
}
