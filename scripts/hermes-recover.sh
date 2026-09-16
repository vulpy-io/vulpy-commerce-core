#!/usr/bin/env bash
# One-command recovery from a broken hermes image (issue #108, T7).
#
# Use when the hermes container fails to start after a rebuild — e.g. a poison
# image (2026-08-10 'USER hermes': "unable to find user hermes: no matching
# entries in passwd file") or a corrupted local image. Rebuilds the image from
# the working tree, restarts the stack, and verifies with doctor. This mirrors
# the manual repair that ended the incident — no local agent required.
#
# Run on the host as a user with docker access:
#   bash scripts/hermes-recover.sh
#
# Flow:
# 1. scripts/hermes-compose.sh build hermes  — image from the tree
# 2. scripts/hermes-compose.sh up -d        — recreate the container
# 3. pnpm vulpy hermes doctor               — verify, then report
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

export VULPY_ENV=hermes
export VULPY_ENV_FILE="${ROOT_DIR}/environments/hermes/.env"
# shellcheck source=scripts/lib/project-env.sh
source "${ROOT_DIR}/scripts/lib/project-env.sh"

echo "=== Hermes recovery: build from tree -> up -> doctor ==="

echo "[1/3] Building the hermes image from the working tree..."
bash "${ROOT_DIR}/scripts/hermes-compose.sh" build hermes

echo "[2/3] Starting the hermes stack..."
bash "${ROOT_DIR}/scripts/hermes-compose.sh" up -d

echo "[3/3] Verifying with pnpm vulpy hermes doctor..."
pnpm vulpy hermes doctor

echo ""
echo "=== Hermes recovery complete: container up and doctor green. ==="
