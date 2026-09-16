#!/usr/bin/env bash
# Safe rebuild of Hermes image with automatic rollback.
#
# Usage: ./scripts/vulpy-hermes-rebuild.sh [--force]
#
# --force: Skip confirmation prompts
#
# Flow (safety model from issue #108):
# 1. Tag current image as backup
# 2. Build new image
# 3. Pre-flight smoke: prove the new image can create a container BEFORE the
#    running stack is stopped (a poison image aborts here, stack untouched)
# 4. Stop + start the stack (compose up)
# 5. Health check the real container (project-prefix safe via compose ps -q)
# 6. On ANY failure after backup tagging, attempt rollback — an EXIT trap
#    guarantees no exit path can skip it.
#
# All compose invocations go through scripts/hermes-compose.sh (the wrapper),
# which appends the optional Tailscale sidecar overlay
# (docker-compose.hermes-tailscale.yml when HERMES_TAILSCALE=1). Using the bare
# docker-compose.hermes.yml here orphans the sidecar — `down --remove-orphans`
# deletes it and `up -d` never recreates it, silently dropping Fox off the
# tailnet after every rebuild (incident: .tmp/hermes-tailscale-sidecar-incident-report.md).
#
set -euo pipefail

FORCE=0
if [ "${1:-}" = "--force" ]; then
  FORCE=1
fi

IMAGE_NAME=""
BACKUP_TAG=""
HEALTH_TIMEOUT=300  # seconds to wait for health check (60 was too tight: the /data perms repair on a large worktree store exceeded it and every rebuild rolled back — 2026-08-19)

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export VULPY_ENV=hermes
export VULPY_ENV_FILE="${ROOT_DIR}/environments/hermes/.env"
# shellcheck source=scripts/lib/project-env.sh
source "${ROOT_DIR}/scripts/lib/project-env.sh"
# shellcheck source=scripts/lib/hermes-build-fingerprint.sh
source "${ROOT_DIR}/scripts/lib/hermes-build-fingerprint.sh"

# Route every compose call through the wrapper so the optional Tailscale
# sidecar overlay is included (see header comment / incident report).
compose() {
  bash "${ROOT_DIR}/scripts/hermes-compose.sh" "$@"
}

# ---------------------------------------------------------------------------
# Resolve the hermes image tag from the compose file (single source of truth).
# The shipped compose resolves the image from VULPY_HERMES_IMAGE, with
# vulpy-hermes:local as the local-development fallback. Hardcoding a different
# tag here made the pre-flight smoke test fail on fresh installs.
# The backup tag shares the resolved image repo so rollback retags the same image.
# ---------------------------------------------------------------------------
if [ -z "${IMAGE_NAME}" ]; then
  IMAGE_NAME="$(compose config --format json 2>/dev/null | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("services", {}).get("hermes", {}).get("image", ""))
except Exception:
    print("")
' 2>/dev/null || true)"
fi
IMAGE_NAME="${IMAGE_NAME:-${VULPY_HERMES_IMAGE:-vulpy-hermes:local}}"
HERMES_IMAGE_REPO="${IMAGE_NAME%%:*}"
BACKUP_TAG="${HERMES_IMAGE_REPO}:local-backup-$(date +%Y%m%d-%H%M%S)"
echo "Resolved hermes image: ${IMAGE_NAME} (backup tag: ${BACKUP_TAG})"

# ---------------------------------------------------------------------------
# Stale-state cleanup + retry (2026-08-16 incident): an interrupted rebuild
# leaves half-removed containers and stale sidecars that kill BOTH the deploy
# `compose up` AND the rollback ("removal ... is already in progress", searxng
# name conflict, "network ... already exists"). Run this after any
# `compose down` and before any `compose up`.
# ---------------------------------------------------------------------------

# Remove stale project containers left by an interrupted rebuild. Never
# removes a RUNNING container and never the current hermes container.
cleanup_stale_containers() {
  local project="${COMPOSE_PROJECT_NAME:-$(basename "${ROOT_DIR}")-hermes}"
  local current="${CURRENT_CONTAINER_ID:-}"
  local line id name state
  while read -r line; do
    [ -z "${line}" ] && continue
    id="${line%% *}"
    rest="${line#* }"
    name="${rest%% *}"
    state="${rest##* }"
    if [ "${id}" = "${current}" ]; then
      echo "  (keeping current hermes container ${name})"
      continue
    fi
    if [ "${state}" = "running" ]; then
      echo "  (keeping running container ${name})"
      continue
    fi
    if [ "${name}" = "${project}-hermes-1" ]; then
      # Old hermes stuck in Removing from an interrupted attempt — wait for
      # Docker to finish, then force if it lingers past the deadline.
      echo "  waiting for stuck removal: ${name} (${id})"
      local deadline=$(( $(date +%s) + 30 ))
      while docker ps -a --filter "id=${id}" --format '{{.ID}}' 2>/dev/null | grep -q . \
            && [ "$(date +%s)" -lt "${deadline}" ]; do
        sleep 2
      done
    fi
    echo "  removing stale: ${name} (${state})"
    docker rm -f "${id}" >/dev/null 2>&1 || true
  done < <(docker ps -a --filter "label=com.docker.compose.project=${project}" \
             --format '{{.ID}} {{.Names}} {{.State}}' 2>/dev/null || true)

  # Dangling project network from an interrupted run. Harmless no-op when the
  # network is still in use — docker refuses to remove active networks.
  docker network rm "${project}_default" >/dev/null 2>&1 || true
}

# `compose up -d` with one retry — covers transient daemon races (e.g. a
# removal that finished between the cleanup pass and the create step).
compose_up_retry() {
  if compose up -d; then
    return 0
  fi
  echo "WARN: 'docker compose up -d' failed — retrying once after 5s..." >&2
  sleep 5
  compose up -d
}

# ---------------------------------------------------------------------------
# Build log: tee the entire run (including docker build output) to a file the
# Fox agent can read from inside the container. DATA_DIR is the host's
# .data/hermes/ dir, mounted as /data in the container — so
# ${DATA_DIR}/logs/hermes-rebuild-*.log appears as /data/logs/hermes-rebuild-*.log
# to the agent. The tee wrapper is the FIRST thing after env resolution so no
# build output is lost.
# ---------------------------------------------------------------------------
REBUILD_LOG_DIR="${DATA_DIR}/logs"
if [ -d "${REBUILD_LOG_DIR}" ] || mkdir -p "${REBUILD_LOG_DIR}" 2>/dev/null; then
  REBUILD_LOG="${REBUILD_LOG_DIR}/hermes-rebuild-$(date +%Y%m%d-%H%M%S).log"
  exec > >(tee -a "${REBUILD_LOG}") 2>&1
  echo "[rebuild] log: ${REBUILD_LOG}"
fi

echo "=== Hermes Safe Rebuild ==="

# ---------------------------------------------------------------------------
# Rollback machinery (issue #108, T3): once the backup tag exists, NO exit
# path may skip an attempted rollback. The EXIT trap catches both explicit
# `exit 1` paths and unexpected `set -e` failures after backup tagging.
# ---------------------------------------------------------------------------
BACKUP_TAGGED=0
STACK_STOPPED=0  # becomes 1 only after `compose down` ran; build/smoke failures keep 0

rollback() {
  echo ""
  echo "=== Attempting rollback ==="
  if [ "${BACKUP_TAGGED}" = "1" ]; then
    echo "Restoring image tag: ${IMAGE_NAME} -> ${BACKUP_TAG}"
    docker tag "${BACKUP_TAG}" "${IMAGE_NAME}" 2>/dev/null || true
    if [ "${STACK_STOPPED}" = "1" ]; then
      echo "Restarting the stack with the previous image..."
      compose down --remove-orphans 2>/dev/null || true
      # Same stale-state cleanup as the deploy path — the rollback must not
      # fail on leftovers the deploy run could not remove (2026-08-16).
      cleanup_stale_containers
      if compose_up_retry 2>/dev/null; then
        echo "Rollback complete: previous image restored, stack restarted."
      else
        echo "ERROR: rollback 'compose up -d' failed — stack may be down; manual intervention required." >&2
      fi
    else
      echo "Rollback complete: image tag restored; the running stack was left untouched."
    fi
  else
    echo "No backup image available; nothing to restore."
    if [ "${STACK_STOPPED}" = "1" ]; then
      echo "Stack stopped before failure and no backup exists — leaving it stopped for diagnosis." >&2
    fi
  fi
}

SUCCESS=0
on_exit() {
  if [ "${SUCCESS}" != "1" ]; then
    rollback
  fi
}
trap on_exit EXIT

echo "=== Hermes Safe Rebuild ==="

# Step 0: Regenerate checksums if any security-gated files changed.
# Must run BEFORE build so the baked entrypoint hash matches what we commit.
echo "[0/5] Regenerating security checksums..."
if ! python3 scripts/generate-checksums.py > scripts/.vulpy-security-checksums; then
  echo "ERROR: generate-checksums.py failed — cannot regenerate checksum manifest." >&2
  exit 1
fi
echo "       Checksums updated."

# Step 1: Check if there's a running container (project-prefix safe).
CURRENT_IMAGE_ID=""
# hermes-compose.sh emits informational lines on stdout; take the LAST line so
# only the real container id (or empty) is captured.
CURRENT_CONTAINER_ID="$(compose ps -q hermes 2>/dev/null | tail -n1 || true)"
if [ -n "${CURRENT_CONTAINER_ID}" ]; then
  CURRENT_IMAGE_ID="$(docker inspect --format '{{.Image}}' "${CURRENT_CONTAINER_ID}" 2>/dev/null || echo "")"
fi

# Step 2: Tag current image as backup (if exists)
if [ -n "${CURRENT_IMAGE_ID}" ]; then
  echo "[1/5] Tagging current image as backup: ${BACKUP_TAG}"
  if docker tag "${CURRENT_IMAGE_ID}" "${BACKUP_TAG}" 2>/dev/null; then
    BACKUP_TAGGED=1
  else
    echo "WARN: Could not tag backup (image may not exist locally)"
  fi
else
  echo "[1/5] No current image to backup (first build or pulled image)"
fi

# Step 3: Build new image
echo "[2/5] Building new image..."
BUILD_FP="$(vulpy_hermes_build_fingerprint "${ROOT_DIR}" 2>/dev/null || echo "unknown")"
echo "       Build fingerprint: ${BUILD_FP}"
# Stream buildkit output so a hang/cancel point is visible in CI instead of
# silence until the pipe closes (tail -20 swallowed 9 minutes of progress and
# left "SIGTERM with no clue" on hosted runners).
BUILD_LOG="${TMPDIR:-/tmp}/hermes-rebuild-build-$(date +%s).log"
if ! compose build --no-cache --build-arg "VULPY_BUILD_FINGERPRINT=${BUILD_FP}" 2>&1 | tee "${BUILD_LOG}"; then
  echo "ERROR: Build failed (last 40 lines):" >&2
  tail -n 40 "${BUILD_LOG}" >&2 || true
  exit 1
fi

# Step 4: Pre-flight smoke test (issue #108, T2) — prove the new image can
# create a container BEFORE the running stack is touched. `docker create`
# reproduces Docker's create-time Config.User validation — the exact failure
# point of the 2026-08-10 'USER hermes' poison-image incident. A bad image
# fails here, with the old stack still running (no down, no up).
echo "[3/5] Smoke-testing new image (docker create)..."
SMOKE_CONTAINER="vulpy-hermes-smoke-$$"
docker rm -f "${SMOKE_CONTAINER}" >/dev/null 2>&1 || true  # clear any stale container from an interrupted run
if ! docker create --name "${SMOKE_CONTAINER}" --entrypoint /usr/bin/id "${IMAGE_NAME}" 2>&1 | tail -5; then
  echo "ERROR: Smoke test FAILED — the new image cannot create a container." >&2
  echo "       The running stack was NOT touched (no down, no up)." >&2
  echo "       Likely an invalid USER / Config.User in Dockerfile.hermes; fix and re-run." >&2
  echo "       (image: ${IMAGE_NAME})" >&2
  docker rm -f "${SMOKE_CONTAINER}" >/dev/null 2>&1 || true
  exit 1
fi
docker rm -f "${SMOKE_CONTAINER}" >/dev/null 2>&1 || true
echo "       OK — new image passes the create-time smoke test."

# Step 5: Stop and recreate container
echo "[4/5] Stopping current container..."
compose down --remove-orphans 2>/dev/null || true
STACK_STOPPED=1

# Clean leftovers from any interrupted rebuild BEFORE bringing the stack up
# (2026-08-16: stale sidecars + half-removed containers killed `up` AND the
# rollback). Never removes a running container or the current hermes.
cleanup_stale_containers

echo "[4/5] Starting new container..."
if ! compose_up_retry; then
  # T3: never exit before rollback — fall through to the health check, which
  # will find the container missing/exited and trigger rollback.
  echo "ERROR: 'docker compose up -d' failed — running health check, then rolling back." >&2
fi

# Step 6: Health check with rollback on failure
echo "[5/5] Health check (${HEALTH_TIMEOUT}s timeout)..."

HEALTHY=false
START_TIME=$(date +%s)
TIMEOUT_END=$((START_TIME + HEALTH_TIMEOUT))

while [ "$(date +%s)" -lt "${TIMEOUT_END}" ]; do
  # Resolve the real container id (issue #108, T4). The Compose project is
  # COMPOSE_PROJECT_NAME (e.g. vulpy-commerce-hermes), so the container is
  # never literally named "hermes" — `docker compose ps -q hermes` is
  # project-prefix safe. hermes-compose.sh prints informational lines on
  # stdout, so the LAST line is the container id.
  CONTAINER_ID="$(compose ps -q hermes 2>/dev/null | tail -n1 || true)"

  if [ -z "${CONTAINER_ID}" ]; then
    echo "Container missing!"
    break
  fi

  CONTAINER_STATUS="$(docker inspect --format '{{.State.Status}}' "${CONTAINER_ID}" 2>/dev/null || echo "missing")"

  if [ "${CONTAINER_STATUS}" = "missing" ]; then
    echo "Container missing!"
    break
  elif [ "${CONTAINER_STATUS}" = "exited" ]; then
    echo "Container exited!"
    break
  elif [ "${CONTAINER_STATUS}" = "running" ]; then
    # Check if entrypoint completed (look for specific log pattern).
    # -F: "[security]" is a literal prefix, not a regex character class.
    if docker logs "${CONTAINER_ID}" 2>&1 | grep -qF "[security] Checksum verification passed"; then
      HEALTHY=true
      break
    elif docker logs "${CONTAINER_ID}" 2>&1 | grep -q "Checksum verification FAILED"; then
      echo "Checksum verification failed"
      break
    elif docker logs "${CONTAINER_ID}" 2>&1 | grep -q "Starting supervisord"; then
      # Fallback: assume healthy if supervisord started
      HEALTHY=true
      break
    fi
  fi

  echo -n "."
  sleep 2
done
echo ""

# Step 7: Rollback if unhealthy
if [ "${HEALTHY}" = "true" ]; then
  echo "✅ Container is healthy"
  SUCCESS=1  # healthy — the EXIT trap must NOT roll back

  # Clean up old backups (keep last 3). `|| true`: with no backups to prune,
  # grep finds nothing and the pipeline would fail under pipefail — the rebuild
  # itself already succeeded.
  echo "Cleaning up old backups (keeping last 3)..."
  docker images --format '{{.Repository}} {{.Tag}}' | awk -v repo="${HERMES_IMAGE_REPO}" '$1 == repo { print $2 }' | grep 'local-backup-' | sort -r | tail -n +4 | while read -r old_tag; do
    echo "  Removing: ${HERMES_IMAGE_REPO}:${old_tag}"
    docker rmi "${HERMES_IMAGE_REPO}:${old_tag}" 2>/dev/null || true
  done || true

  exit 0
fi

echo "❌ Container is unhealthy!"

# Show last 30 lines of logs
echo ""
echo "=== Last 30 lines of logs ==="
if [ -n "${CONTAINER_ID:-}" ]; then
  docker logs "${CONTAINER_ID}" --tail 30 2>&1
else
  echo "(no container id resolved)"
fi

if [ "${BACKUP_TAGGED}" = "1" ]; then
  echo ""
  echo "Rolling back..."
  # rollback() runs via the EXIT trap (SUCCESS stays 0)
else
  echo ""
  echo "No backup available. Container left in failed state for diagnosis."
fi

exit 1
