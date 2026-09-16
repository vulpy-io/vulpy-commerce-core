#!/usr/bin/env bash
# hermes-build-fingerprint.sh — compute the build fingerprint for the resolved
# Hermes image. Used by vulpy-hermes.sh `up` to decide whether
# the image is stale and must be rebuilt BEFORE the container starts
# (VULPY_HERMES_AUTO_REBUILD, default on).
#
# The fingerprint covers EVERYTHING baked into the image:
#   - Dockerfile.hermes itself
#   - all COPY sources (parsed from the Dockerfile, directories expanded)
#   - scripts/.vulpy-security-checksums (the gated-file manifest)
#
# Deliberately EXCLUDED (runtime, not image):
#   - scripts/hermes-fox-entrypoint.sh (bind-mounted into the container)
#   - environments/hermes/.env (runtime config)
#   - docker-compose.hermes.yml / edge / Caddyfiles (container-level, and
#     `up` re-reads them anyway)
#   - node_modules, build caches
#
# Output: single sha256 hex string (content-only, no mtimes — stable across
# checkouts of the same content).

# Compute a stable sha256 over a list of paths (files + dirs).
# Usage: vulpy_hash_paths <path>...
vulpy_hash_paths() {
  local p
  for p in "$@"; do
    if [ -f "${p}" ]; then
      sha256sum "${p}" | sed 's| .*||'
    elif [ -d "${p}" ]; then
      find "${p}" -type f ! -path '*/node_modules/*' ! -path '*/__pycache__/*' ! -name '*.pyc' \
        -print0 | sort -z | xargs -0 -r sha256sum | sed 's| .*||'
    fi
  done | sha256sum | cut -d' ' -f1
}

# Compute the Hermes image build fingerprint.
# Usage: vulpy_hermes_build_fingerprint <root_dir>
vulpy_hermes_build_fingerprint() {
  local root_dir="$1"
  local dockerfile="${root_dir}/Dockerfile.hermes"
  [ -f "${dockerfile}" ] || { echo ""; return 1; }

  local copy_srcs=()
  local line src
  # Parse `COPY <src> <dst>` lines (ignore `COPY --from=` stage copies).
  while IFS= read -r line; do
    [[ "${line}" =~ ^[[:space:]]*COPY[[:space:]]+([^[:space:]]+) ]] || continue
    src="${BASH_REMATCH[1]}"
    [[ "${src}" == "--from="* ]] && continue
    copy_srcs+=("${src}")
  done < "${dockerfile}"

  # Resolve relative sources against the root dir; keep absolute as-is.
  local resolved=() p
  for p in "${copy_srcs[@]}"; do
    case "${p}" in
      /*) resolved+=("${p}") ;;
      *)  resolved+=("${root_dir}/${p}") ;;
    esac
  done

  # Hash: Dockerfile + checksums manifest + all COPY sources.
  vulpy_hash_paths "${dockerfile}" "${root_dir}/scripts/.vulpy-security-checksums" "${resolved[@]}"
}

# Read the fingerprint stamped on the current image (empty if absent/unknown).
# Usage: vulpy_hermes_image_fingerprint
vulpy_hermes_image_fingerprint() {
  local image_name="${1:-${VULPY_HERMES_IMAGE:-vulpy-hermes:local}}"
  docker image inspect --format '{{index .Config.Labels "vulpy.hermes.build_fingerprint"}}' \
    "${image_name}" 2>/dev/null || echo ""
}

# Decide whether a rebuild is needed.
# Usage: vulpy_hermes_needs_rebuild <root_dir>  → 0 = fresh, 1 = stale
vulpy_hermes_needs_rebuild() {
  local root_dir="$1"
  local current stamped
  current="$(vulpy_hermes_build_fingerprint "${root_dir}" 2>/dev/null)" || return 1
  [ -n "${current}" ] || return 1
  stamped="$(vulpy_hermes_image_fingerprint "${VULPY_HERMES_IMAGE:-vulpy-hermes:local}")"
  [ "${current}" = "${stamped}" ] || return 1
  return 0
}
