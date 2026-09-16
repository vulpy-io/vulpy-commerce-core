#!/bin/bash
# Idempotent Gitea sidecar initialization for the env-push relay pipeline.
#
# Runs inside the Hermes container at startup (called from
# scripts/hermes-fox-entrypoint.sh). Talks to the gitea sidecar over the
# compose network at http://gitea:3300 — no Docker socket required.
#
# Creates, skipping anything that already exists:
#   - admin user  vulpy-agent  (random password persisted in /data/config/gitea-admin-pw)
#   - org         ${VULPY_APP_ID:-vulpy-shop}
#   - repo        ${VULPY_APP_ID:-vulpy-shop}/workspace
#   - scoped relay token (write:repository) persisted in /data/config/gitea-relay-token
#   - git remote  gitea → http://gitea:3300/<org>/workspace.git  (credential-FREE URL)
#   - credential helper /data/config/gitea-cred-helper.sh (0600) scoped to the
#     gitea URL — credentials live ONLY in 0600 files, never in .git/config
#   - pushes workspace HEAD:main (force)
#
# M3 tradeoff: a scoped token is created via the Gitea API when the admin
# user exists. If token creation is not possible yet (fresh sidecar awaiting
# host-side admin bootstrap), the helper falls back to the admin password —
# still from the 0600 file, never from the remote URL. `git remote -v` shows
# no secret either way.
#
# Safe to re-run: every step checks before creating. Non-fatal failures log a
# warning (a fresh sidecar may need a host-side admin bootstrap first — see
# the admin user section below).
set -euo pipefail

GITEA_URL="http://gitea:3300"
ADMIN_USER="vulpy-agent"
ORG="${VULPY_APP_ID:-vulpy-shop}"
REPO_NAME="workspace"
PW_FILE="/data/config/gitea-admin-pw"
TOKEN_FILE="/data/config/gitea-relay-token"
CRED_HELPER="/data/config/gitea-cred-helper.sh"
WORKSPACE="/app/workspace"

log() { echo "[gitea-init] $*"; }

# ── Wait for Gitea to be ready (max 30s) ─────────────────────────────────────
log "Waiting for Gitea at ${GITEA_URL}..."
ready=0
for _ in $(seq 1 30); do
  if curl -sf "${GITEA_URL}/api/v1/version" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "${ready}" != "1" ]; then
  log "ERROR: Gitea not reachable after 30s — is the sidecar up?"
  exit 1
fi
log "Gitea is ready."

# ── Admin password (create once, reuse on re-runs) ───────────────────────────
if [ ! -f "${PW_FILE}" ]; then
  mkdir -p "$(dirname "${PW_FILE}")"
  ADMIN_PW="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
  printf '%s' "${ADMIN_PW}" > "${PW_FILE}"
  chmod 600 "${PW_FILE}"
  log "Generated admin password → ${PW_FILE}"
else
  log "Admin password already exists → ${PW_FILE} (reusing)"
fi
ADMIN_PW="$(cat "${PW_FILE}")"

# ── Admin user (skip if already exists) ──────────────────────────────────────
# Gitea only allows the FIRST admin to be created via its CLI inside the gitea
# container (`gitea admin user create`); the admin API needs an existing admin
# session, and this script has no Docker socket. So on a fresh sidecar the
# admin bootstrap is done host-side at `hermes up` (docker compose exec gitea
# gitea admin user create ...). This script then skips the user and completes
# the org/repo/remote/push steps on every start. When the gitea CLI is present
# locally (e.g. run inside the gitea container), it bootstraps the user itself.
GITEA_ADMIN_EXISTS=0
if curl -sf "${GITEA_URL}/api/v1/users/${ADMIN_USER}" >/dev/null 2>&1; then
  GITEA_ADMIN_EXISTS=1
fi
if [ "${GITEA_ADMIN_EXISTS}" = "1" ]; then
  log "Admin user '${ADMIN_USER}' already exists — skipping"
elif command -v gitea >/dev/null 2>&1; then
  log "Creating admin user '${ADMIN_USER}' via gitea CLI..."
  gitea admin user create \
    --username "${ADMIN_USER}" \
    --password "${ADMIN_PW}" \
    --email "gitea@vulpy.local" \
    --admin \
    --must-change-password=false
  log "Admin user created."
else
  log "WARNING: admin user '${ADMIN_USER}' does not exist yet and the gitea CLI"
  log "         is unavailable — host-side bootstrap required (see comment above)."
  log "         Continuing; org/repo steps will retry on the next container start."
fi

# ── Scoped relay token (create once, reuse on re-runs) ───────────────────────
# M3: pushes use a scoped (write:repository) access token instead of the
# admin password in the remote URL. Created via the Gitea API; on a fresh
# sidecar the admin user may not exist yet (host-side bootstrap), so failure
# is non-fatal and the credential helper falls back to the 0600 admin pw file.
if [ ! -f "${TOKEN_FILE}" ]; then
  TOKEN_JSON="$(curl -sf -X POST "${GITEA_URL}/api/v1/users/${ADMIN_USER}/tokens" \
    -H "Content-Type: application/json" \
    -u "${ADMIN_USER}:${ADMIN_PW}" \
    -d '{"name":"vulpy-relay-push","scopes":["write:repository"]}' 2>/dev/null || true)"
  RELAY_TOKEN="$(printf '%s' "${TOKEN_JSON}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("token") or d.get("sha1") or "")' 2>/dev/null || true)"
  if [ -n "${RELAY_TOKEN}" ]; then
    printf '%s' "${RELAY_TOKEN}" > "${TOKEN_FILE}"
    chmod 600 "${TOKEN_FILE}"
    log "Created scoped relay token (write:repository) → ${TOKEN_FILE}"
  else
    log "WARNING: could not create scoped relay token (admin bootstrap pending?)"
    log "         — credential helper will fall back to the 0600 admin password file."
  fi
else
  log "Relay token already exists → ${TOKEN_FILE} (reusing)"
fi

# ── Credential helper (0600) — never store credentials in .git/config ───────
# Reads the token (or admin pw fallback) at call time from 0600 files.
umask 077
cat > "${CRED_HELPER}" <<HELPER_EOF
#!/bin/bash
# Git credential helper for the gitea relay remote. Credentials live ONLY in
# 0600 files under /data/config — never in the remote URL or .git/config.
case "\$1" in
  get)
    echo "username=${ADMIN_USER}"
    if [ -f "${TOKEN_FILE}" ]; then
      echo "password=\$(cat "${TOKEN_FILE}")"
    elif [ -f "${PW_FILE}" ]; then
      echo "password=\$(cat "${PW_FILE}")"
    fi
    ;;
esac
HELPER_EOF
chmod 700 "${CRED_HELPER}"
log "Credential helper ready → ${CRED_HELPER}"

# ── create org (skip if already exists) ──────────────────────────────────────
if curl -sf "${GITEA_URL}/api/v1/orgs/${ORG}" >/dev/null 2>&1; then
  log "Org '${ORG}' already exists — skipping"
elif curl -sf -X POST "${GITEA_URL}/api/v1/orgs" \
    -H "Content-Type: application/json" \
    -u "${ADMIN_USER}:${ADMIN_PW}" \
    -d "{\"username\":\"${ORG}\",\"org_name\":\"${ORG}\"}" \
    >/dev/null 2>&1; then
  log "Org '${ORG}' created."
else
  log "WARNING: org '${ORG}' creation failed (auth/connectivity?) — skipping"
fi

# ── Repo (skip if already exists) ────────────────────────────────────────────
if curl -sf "${GITEA_URL}/api/v1/repos/${ORG}/${REPO_NAME}" >/dev/null 2>&1; then
  log "Repo '${ORG}/${REPO_NAME}' already exists — skipping"
elif curl -sf -X POST "${GITEA_URL}/api/v1/orgs/${ORG}/repos" \
    -H "Content-Type: application/json" \
    -u "${ADMIN_USER}:${ADMIN_PW}" \
    -d "{\"name\":\"${REPO_NAME}\",\"private\":true,\"auto_init\":false}" \
    >/dev/null 2>&1; then
  log "Repo '${ORG}/${REPO_NAME}' created."
else
  log "WARNING: repo '${ORG}/${REPO_NAME}' creation failed — skipping"
fi

# ── Remote (credential-free URL; rewrite legacy credential-bearing URLs) ─────
# M3: the remote URL must NOT contain credentials — `git remote -v` on a
# world-readable .git/config must show no secret. Auth flows through the
# 0600 credential helper scoped to the gitea URL.
REMOTE_URL="http://gitea:3300/${ORG}/${REPO_NAME}.git"
EXISTING_URL="$(git -C "${WORKSPACE}" remote get-url gitea 2>/dev/null || true)"
if [ -n "${EXISTING_URL}" ]; then
  if printf '%s' "${EXISTING_URL}" | grep -q '@'; then
    log "Existing gitea remote URL contains credentials — rewriting to credential-free URL (M3)"
    if git -C "${WORKSPACE}" remote set-url gitea "${REMOTE_URL}" 2>/dev/null; then
      log "Remote 'gitea' rewritten → ${REMOTE_URL}"
    else
      log "WARNING: could not rewrite gitea remote URL — skipping"
    fi
  else
    log "Remote 'gitea' already configured — skipping"
  fi
else
  if git -C "${WORKSPACE}" remote add gitea "${REMOTE_URL}" 2>/dev/null; then
    log "Remote 'gitea' added → ${REMOTE_URL} (credential-free; auth via 0600 helper)"
  else
    log "WARNING: could not add remote 'gitea' — skipping"
  fi
fi

# Scope the credential helper to the gitea relay URL only (never global).
if git -C "${WORKSPACE}" config "credential.http://gitea:3300.helper" "${CRED_HELPER}" 2>/dev/null; then
  log "Credential helper scoped to gitea relay → ${CRED_HELPER}"
else
  log "WARNING: could not configure gitea credential helper — skipping"
fi

# ── Push HEAD (idempotent force push) ────────────────────────────────────────
if git -C "${WORKSPACE}" push gitea HEAD:main --force >/dev/null 2>&1; then
  log "Pushed workspace HEAD → gitea ${ORG}/${REPO_NAME} main"
else
  log "WARNING: push to gitea failed (sidecar not ready / no admin / no repo yet)"
  log "         — will retry on the next container start."
fi

log "✓ Gitea init complete (idempotent)."
