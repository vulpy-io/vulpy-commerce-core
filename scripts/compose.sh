#!/usr/bin/env bash
# Docker Compose wrapper — loads project paths then runs compose.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# shellcheck source=scripts/lib/project-env.sh
source "${ROOT_DIR}/scripts/lib/project-env.sh"

# shellcheck source=scripts/lib/tenant-limits.sh
source "${ROOT_DIR}/scripts/lib/tenant-limits.sh"

# Host-owned tenant limits override (root-generated; later -f files win, so a
# tenant editing their own compose files cannot raise the ceiling). Appended
# only when the override shares a service with this stack — compose would
# otherwise merge override-only services into the model and try to start them.
TL_ARGS=()
read -ra TL_ARGS <<< "$(vulpy_tl_compose_args docker-compose.yml docker-compose.override.yml)" || true

exec docker compose "${TL_ARGS[@]}" "$@"
