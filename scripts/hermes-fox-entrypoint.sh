#!/usr/bin/env bash
# Vulpy wrapper around Fox-in-the-Box /app/entrypoint.sh.
#
# Upstream chowns /app/workspace recursively (slow + breaks host ownership) and
# /data to foxinthebox:foxinthebox. Host install scripts then rewrite hermes.env
# as the deploy user (HOST_UID), leaving Fox unable to save onboarding / keys.
#
# We: pruned workspace chown, Fox-owned /data trees with shared HOST_GID, and
# group-writable config (660) so both Fox and the deploy user can update it.
set -euo pipefail

# Shared checkout contract: files created by Hermes/Fox inherit group read/write
# so the host deploy user and embedded code-server can edit the same workspace.
# POSIX default ACLs provide the stronger host-side guarantee; this process
# umask closes the container-side gap when ACL tooling is unavailable.
umask 0002

WORKSPACE="${HERMES_WORKSPACE_PATH:-/app/workspace}"
HOST_UID="${HOST_UID:-1000}"
HOST_GID="${HOST_GID:-1000}"
OWNER="${HERMES_WORKSPACE_OWNER:-${HOST_UID}:${HOST_GID}}"

# Apply a default ACL to the shared workspace when the image/host provides
# setfacl. Python and some agent tools can reset umask to 077 after startup;
# default ACLs are the durable guarantee that host users can read Fox-created
# files (including .work markers), not merely a best-effort mode bit.
vulpy_apply_workspace_default_acl() {
  command -v setfacl >/dev/null 2>&1 || return 0
  [ -d "${WORKSPACE}" ] || return 0
  setfacl -m "u:${HOST_UID}:rwx" -d -m "u:${HOST_UID}:rwx" "${WORKSPACE}" 2>/dev/null || true
  if [ -d "${WORKSPACE}/.work" ]; then
    setfacl -m "u:${HOST_UID}:rwx" -d -m "u:${HOST_UID}:rwx" "${WORKSPACE}/.work" 2>/dev/null || true
  fi
}
vulpy_apply_workspace_default_acl

# Security: verify checksums of critical files before running anything
# This prevents a compromised agent from modifying the whitelist or entrypoint
# and having those changes take effect on restart.
#
# Fail-safe: If VULPY_SKIP_SECURITY_CHECKSUMS=1, log but don't exit.
# This allows recovery if verification itself is broken.
verify_security_checksums() {
  # Escape hatch for emergencies
  if [ "${VULPY_SKIP_SECURITY_CHECKSUMS:-}" = "1" ]; then
    echo "[security] VULPY_SKIP_SECURITY_CHECKSUMS=1 — verification SKIPPED" >&2
    return 0
  fi
  
  local checksums_file="${WORKSPACE}/scripts/.vulpy-security-checksums"
  if [ ! -f "${checksums_file}" ]; then
    echo "[security] No checksums file found — skipping verification"
    return 0
  fi
  
  local failed=0
  while IFS= read -r line; do
    # Skip comments and empty lines
    [[ "${line}" =~ ^#.*$ || -z "${line}" ]] && continue
    
    local expected_hash file_path
    file_path=$(echo "${line}" | cut -d':' -f1)
    expected_hash=$(echo "${line}" | cut -d':' -f3)
    
    # Resolve relative paths
    if [[ "${file_path}" != /* ]]; then
      file_path="${WORKSPACE}/${file_path}"
    fi
    
    if [ ! -f "${file_path}" ]; then
      echo "[security] MISSING: ${file_path}" >&2
      failed=1
      continue
    fi
    
    local actual_hash
    actual_hash=$(sha256sum "${file_path}" | cut -d' ' -f1)
    
    if [ "${actual_hash}" != "${expected_hash}" ]; then
      echo "[security] MISMATCH: ${file_path}" >&2
      echo "  expected: ${expected_hash}" >&2
      echo "  actual:   ${actual_hash}" >&2
      failed=1
    fi
  done < "${checksums_file}"
  
  if [ "${failed}" = "1" ]; then
    echo "[security] Checksum verification FAILED — refusing to start" >&2
    echo "[security] If you intentionally modified these files, regenerate checksums:" >&2
    echo "  python3 scripts/generate-checksums.py > scripts/.vulpy-security-checksums" >&2
    exit 1
  fi
  
  echo "[security] Checksum verification passed"
}

vulpy_pruned_workspace_chown() {
  local owner="$1"
  local root="$2"
  mkdir -p "${root}"
  chown "${owner}" "${root}"
  find "${root}" \( \
    -path '*/node_modules' -o \
    -path '*/.pnpm-store' -o \
    -path '*/.next' -o \
    -path '*/.medusa' -o \
    -path '*/.data' -o \
    -path '*/.turbo' -o \
    -path '*/.git/objects' -o \
    -path '*/coverage' -o \
    -path '*/environments/*.env' -o \
    -path '*/environments/*/.env' -o \
    -path '*/agent-cmds/resp' \
  \) -prune -o -exec chown -h "${owner}" {} + 2>/dev/null \
    || find "${root}" \( \
      -path '*/node_modules' -o \
      -path '*/.pnpm-store' -o \
      -path '*/.next' -o \
      -path '*/.medusa' -o \
      -path '*/.data' -o \
      -path '*/.turbo' -o \
      -path '*/.git/objects' -o \
      -path '*/coverage' -o \
      -path '*/environments/*.env' -o \
      -path '*/environments/*/.env' -o \
      -path '*/agent-cmds/resp' \
    \) -prune -o -exec chown "${owner}" {} + || true
  find "${root}" \( \
    -path '*/node_modules' -o \
    -path '*/.pnpm-store' -o \
    -path '*/.next' -o \
    -path '*/.medusa' -o \
    -path '*/.data' -o \
    -path '*/.turbo' -o \
    -path '*/.git/objects' -o \
    -path '*/coverage' -o \
    -path '*/environments/*.env' -o \
    -path '*/environments/*/.env' -o \
    -path '*/agent-cmds/resp' \
  \) -prune -o -exec chmod g+rwX {} + 2>/dev/null || true
  find "${root}" \( \
    -path '*/node_modules' -o \
    -path '*/.pnpm-store' -o \
    -path '*/.next' -o \
    -path '*/.medusa' -o \
    -path '*/.data' -o \
    -path '*/.turbo' -o \
    -path '*/.git/objects' -o \
    -path '*/coverage' -o \
    -path '*/environments/*.env' -o \
    -path '*/environments/*/.env' -o \
    -path '*/agent-cmds/resp' \
  \) -prune -o -type d -exec chmod g+s {} + 2>/dev/null || true
}

vulpy_ensure_fox_deploy_group() {
  local gid="$1"
  if ! getent group "${gid}" >/dev/null 2>&1; then
    groupadd -g "${gid}" vulpy-deploy 2>/dev/null || true
  fi
  if id foxinthebox >/dev/null 2>&1; then
    usermod -aG "${gid}" foxinthebox 2>/dev/null || true
  fi
}

vulpy_fix_build_artifact_stubs() {
  # The pruned chown walk skips .next and node_modules for performance.
  # That leaves two failure modes:
  #   1. .next owned by root  → Fox can't write build output → `next build` fails
  #   2. node_modules/.bin mode 755 → Fox in group 1001 can read/exec but not write
  #      → `pnpm add` / any package tool that touches .bin fails
  #
  # Fix: chown .next dirs to Fox (top-level only, not recursive) and set g+w
  # on node_modules/.bin dirs. Both run as root at entrypoint time.
  local root="$1"
  local owner="$2"

  # Fix .next stubs — any depth up to 4 (covers root + apps/*/  packages/*/)
  while IFS= read -r dir; do
    local dir_uid
    dir_uid=$(stat -c '%u' "${dir}" 2>/dev/null || echo "0")
    if [ "${dir_uid}" != "999" ]; then
      echo "[vulpy] Fixing .next ownership (was uid ${dir_uid}): ${dir}"
      chown "${owner}" "${dir}" 2>/dev/null || true
      chmod ug+rwX "${dir}" 2>/dev/null || true
    fi
  done < <(find "${root}" -maxdepth 4 -name '.next' -type d 2>/dev/null)

  # Fix node_modules/.bin mode — add group write so Fox can symlink new bins
  while IFS= read -r dir; do
    chmod g+w "${dir}" 2>/dev/null || true
  done < <(find "${root}" -maxdepth 4 -path '*/node_modules/.bin' -type d 2>/dev/null)
}

vulpy_fix_hermes_data_perms() {
  local data_root="/data"
  [ -d "${data_root}" ] || return 0
  vulpy_ensure_fox_deploy_group "${HOST_GID}"

  # Heavy build trees (git worktrees with node_modules can exceed 900k files)
  # are created by Fox-owned processes — ownership is already correct, so
  # prune them from the recursive repair walk. Without this the chown/chmod
  # syscall storm delayed boot past the rebuild health-check window and every
  # rebuild rolled back (2026-08-19).
  local owner
  if id foxinthebox >/dev/null 2>&1; then
    owner="foxinthebox:${HOST_GID}"
  else
    owner="${HOST_UID}:${HOST_GID}"
  fi

  local tree path
  for tree in apps config cache logs state data/hermes data/mem0 data/memos; do
    path="${data_root}/${tree}"
    mkdir -p "${path}" 2>/dev/null || true
    find "${path}" \( \
      -path '*/node_modules' -o \
      -path '*/.pnpm-store' -o \
      -path '*/.next' -o \
      -path '*/.medusa' -o \
      -path '*/.turbo' -o \
      -path '*/.git/objects' -o \
      -path '*/coverage' \
    \) -prune -o -exec chown "${owner}" {} + 2>/dev/null || true
    find "${path}" \( \
      -path '*/node_modules' -o \
      -path '*/.pnpm-store' -o \
      -path '*/.next' -o \
      -path '*/.medusa' -o \
      -path '*/.turbo' -o \
      -path '*/.git/objects' -o \
      -path '*/coverage' \
    \) -prune -o -exec chmod ug+rwX {} + 2>/dev/null || true
    find "${path}" \( \
      -path '*/node_modules' -o \
      -path '*/.pnpm-store' -o \
      -path '*/.next' -o \
      -path '*/.medusa' -o \
      -path '*/.turbo' -o \
      -path '*/.git/objects' -o \
      -path '*/coverage' \
    \) -prune -o -type d -exec chmod g+s {} + 2>/dev/null || true
  done

  # Fox (owner) + deploy group can update keys / onboarding / settings.
  if [ -f "${data_root}/config/hermes.env" ]; then
    chmod 660 "${data_root}/config/hermes.env" 2>/dev/null || true
  fi
  if [ -f "${data_root}/config/onboarding.json" ]; then
    chmod 660 "${data_root}/config/onboarding.json" 2>/dev/null || true
  fi
  chown root:root "${data_root}/run" "${data_root}/data/tailscale" 2>/dev/null || true
}

vulpy_ensure_home_config_perms() {
  # /app is Fox's HOME; ensure ~/.config is fox-owned so CLI tools (medusa,
  # gh, etc.) can create their config dirs. Root-created config dirs (e.g.
  # from escalated diagnostics) break tools with EACCES mkdir (verified
  # 2026-08-08: medusa plugin:build failed on /app/.config/medusa).
  if [ -d /app/.config ]; then
    chown -R foxinthebox:foxinthebox /app/.config 2>/dev/null || true
    chmod -R u+rwX /app/.config 2>/dev/null || true
  fi
}

vulpy_ensure_mem0_oss() {
  # Install mem0ai + qdrant-client and enable the mem0_oss memory provider if
  # not already configured.  Idempotent: skips silently when both deps are
  # present and config already has memory.provider set.
  #
  # The deps are intentionally excluded from the upstream [all] extra (to avoid
  # a bad mem0ai release breaking fresh installs), so we bake them here until
  # the Fox image adds --extra mem0 to its uv sync layer.  This runs once per
  # fresh container; subsequent starts are a no-op because pip skips installed
  # packages and the config key is already present.
  local hermes_config="/data/data/hermes/config.yaml"
  local pip_ok=0

  # Check / install deps
  if python3 -c "import mem0, qdrant_client" 2>/dev/null; then
    pip_ok=1
  else
    echo "[vulpy] Installing mem0ai + qdrant-client for mem0_oss memory provider..."
    if pip install --quiet mem0ai qdrant-client 2>/dev/null; then
      pip_ok=1
      echo "[vulpy] mem0ai + qdrant-client installed."
    else
      echo "[vulpy] WARN: mem0ai/qdrant-client install failed — mem0_oss will not be enabled." >&2
    fi
  fi

  # Set memory.provider in config if deps are available and key not yet set
  if [ "${pip_ok}" = "1" ]; then
    if [ -f "${hermes_config}" ] && grep -q "provider: mem0_oss" "${hermes_config}" 2>/dev/null; then
      : # already configured
    else
      echo "[vulpy] Enabling mem0_oss memory provider in Hermes config..."
      hermes config set memory.provider mem0_oss 2>/dev/null \
        || echo "[vulpy] WARN: hermes config set failed — set memory.provider: mem0_oss manually." >&2
    fi
  fi
}

# ---------------------------------------------------------------------------
# Ensure model.max_tokens is empty (no output reservation from input window)
# for Vulpy's large-context models. These models (DeepSeek V4 Flash, Kimi K3)
# have separate input/output budgets, so reserving max_tokens from context
# artificially shrinks the effective window and triggers compression early.
# Empty string tells the compressor "no reservation" so it uses the full
# context window for the threshold calculation. Idempotent.
# ---------------------------------------------------------------------------
vulpy_ensure_model_max_tokens() {
  local hermes_config="/data/data/hermes/config.yaml"
  [ -f "${hermes_config}" ] || return 0
  local provider
  provider=$(grep -E '^\s+provider:\s+vulpy' "${hermes_config}" 2>/dev/null || echo "")
  [ -n "${provider}" ] || return 0
  if grep -qE '^\s+max_tokens:\s+'\"''\"'' "${hermes_config}" 2>/dev/null; then
    : # already set to empty — correct
  else
    echo "[vulpy] Setting model.max_tokens to empty (no output reservation for Vulpy large-context models)..."
    hermes config set model.max_tokens '' 2>/dev/null \
      || echo "[vulpy] WARN: could not set model.max_tokens — edit manually." >&2
  fi
}

# ---------------------------------------------------------------------------
# Ensure the Vulpy model provider is active when a gateway key is present.
# Fresh installs that pass --gateway-key land with VULPY_API_KEY set but no
# model/provider wired, so the first chat fails with "No LLM provider
# configured". This wires provider=vulpy + default vulpy-default + the US
# gateway base_url so a key-present install is immediately chat-ready.
# Gated on the key being present (not on an existing config), idempotent.
# ---------------------------------------------------------------------------
vulpy_ensure_model_provider() {
  [ -n "${VULPY_API_KEY:-}" ] || return 0
  local hermes_config="/data/data/hermes/config.yaml"
  [ -f "${hermes_config}" ] || return 0
  if ! grep -qE '^\s+provider:\s+vulpy' "${hermes_config}" 2>/dev/null; then
    echo "[vulpy] Setting Vulpy model provider (default vulpy-default, US gateway)..."
    hermes config set model.provider vulpy 2>/dev/null \
      && hermes config set model.default vulpy-default 2>/dev/null \
      && hermes config set model.base_url 'https://gateway.vulpy.io' 2>/dev/null \
      || echo "[vulpy] WARN: could not set model provider — edit config.yaml manually." >&2
  fi
}

# ---------------------------------------------------------------------------
# Ensure the auxiliary compression route is pinned. Without an explicit
# auxiliary.compression, Hermes resolves compression via 'auto', which can
# pick the Codex backend with vulpy-default and fail (400: model not
# supported when using Codex with a ChatGPT account), then fall back to a
# flaky summarizer that occasionally returns empty and silently drops
# session context (observed 2026-08-26: 411-message compaction collapsed to
# "Historical In-Progress State: Unknown"). Pin to vulpy-writer via the Vulpy
# gateway — the route that provably works. Idempotent; survives rebuilds.
# ---------------------------------------------------------------------------
vulpy_ensure_compression_route() {
  local hermes_config="/data/data/hermes/config.yaml"
  [ -f "${hermes_config}" ] || return 0
  if grep -qE '^[[:space:]]+compression:' "${hermes_config}" 2>/dev/null; then
    : # already configured
  else
    echo "[vulpy] Pinning auxiliary compression route (vulpy-writer @ gateway)..."
    hermes config set auxiliary.compression.provider vulpy 2>/dev/null \
      && hermes config set auxiliary.compression.model vulpy-writer 2>/dev/null \
      && hermes config set auxiliary.compression.base_url 'https://gateway.vulpy.io' 2>/dev/null \
      || echo "[vulpy] WARN: could not pin auxiliary.compression — edit config.yaml manually." >&2
  fi
}

# ---------------------------------------------------------------------------
# Ensure the Hermes API server runs on 8642 when the gateway key is present.
# The custom message-renderer loads session transcripts through the sidecar
# proxy → 127.0.0.1:8642 (GET /api/sessions/{id}/messages). In the single-
# container install this API server is NOT started by default, so the renderer
# gets 403/blank chats and the extension has to be disabled. Enabling the
# api_server platform (API_SERVER_ENABLED + a key) + the WebUI's CSRF origin
# allowlist makes the custom renderer work out of the box on every install.
# Gated on the gateway key, idempotent, non-fatal.
# ---------------------------------------------------------------------------
vulpy_ensure_api_server() {
  [ -n "${VULPY_API_KEY:-}" ] || return 0
  local env_file="/data/config/hermes.env"
  [ -f "${env_file}" ] || return 0
  # The authoritative public admin origin comes from the edge env (ADMIN_HOST),
  # e.g. admin.dev.example.com — the WebUI CSRF check must trust it.
  local edge_env="/app/workspace/environments/edge/.env"
  local admin_host=""
  if [ -f "${edge_env}" ]; then
    admin_host=$(grep -E '^ADMIN_HOST=' "${edge_env}" 2>/dev/null | tail -1 | cut -d= -f2-)
  fi
  local origin="${admin_host:-${HERMES_DOMAIN:-${VULPY_APP_ID:-}}}"
  local public_origin="https://${origin}"
  local wrote=0
  # API_SERVER_KEY: generate once and persist so the webui proxy + gateway agree.
  if ! grep -qE '^API_SERVER_KEY=.+' "${env_file}" 2>/dev/null; then
    local key
    key="apiserver_$(date +%s)_$(head -c8 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    printf 'API_SERVER_KEY=%s\n' "${key}" >> "${env_file}"
    echo "[vulpy] Generated API_SERVER_KEY for Hermes API server."
    wrote=1
  fi
  if ! grep -qE '^API_SERVER_ENABLED=.+' "${env_file}" 2>/dev/null; then
    printf 'API_SERVER_ENABLED=1\n' >> "${env_file}"
    wrote=1
  fi
  if ! grep -qE '^API_SERVER_CORS_ORIGINS=.+' "${env_file}" 2>/dev/null; then
    printf 'API_SERVER_CORS_ORIGINS=https://%s,http://127.0.0.1,http://localhost\n' "${origin}" >> "${env_file}"
    wrote=1
  fi
  if ! grep -qE '^HERMES_WEBUI_ALLOWED_ORIGINS=.+' "${env_file}" 2>/dev/null; then
    printf 'HERMES_WEBUI_ALLOWED_ORIGINS=%s\n' "${public_origin}" >> "${env_file}"
    wrote=1
  fi
  [ "${wrote}" = "1" ] && echo "[vulpy] API server env wired (8642 sidecar path)." || true
}

# ---------------------------------------------------------------------------
# Ensure the MCP Python SDK is available (needed by Hermes' native MCP client,
# e.g. the figma-developer-mcp server). /app/.local is an IMAGE-LAYER path and
# is wiped on every container rebuild, so reinstall at boot. Idempotent: skips
# when already present. Non-fatal: warns and continues. Plain `pip install mcp`
# (not hermes-agent[mcp]) keeps cryptography at its existing version — the
# [mcp] extra pins cryptography==46.0.7 which conflicts with pyopenssl>=49.
# ---------------------------------------------------------------------------
vulpy_ensure_mcp_sdk() {
  if python3 -c "import mcp" 2>/dev/null; then
    return 0
  fi
  echo "[vulpy] Installing MCP Python SDK (mcp) for native MCP servers..."
  if pip install --quiet mcp 2>/dev/null; then
    echo "[vulpy] MCP Python SDK installed."
  else
    echo "[vulpy] WARN: mcp SDK install failed — MCP servers (figma) unavailable." >&2
  fi
}
vulpy_ensure_mcp_sdk

# ---------------------------------------------------------------------------
# Ensure the remote-ssh plugin (JSON-parameter SSH tool: run/bg/poll/put/get,
# zero shell quoting) is installed into the durable Hermes plugins dir and
# enabled in config. Source of truth: extensions/hermes-plugins/remote-ssh.
# Idempotent: copies only when content differs, skips enable when already set.
# Non-fatal: warns and continues — SSH tasks fall back to raw ssh/paramiko.
# ---------------------------------------------------------------------------
vulpy_ensure_remote_ssh_plugin() {
  local src="${WORKSPACE}/extensions/hermes-plugins/remote-ssh"
  local dst="/data/data/hermes/plugins/remote-ssh"
  [ -f "${src}/__init__.py" ] || { echo "[vulpy] WARN: remote-ssh plugin source missing" >&2; return 0; }
  mkdir -p "${dst}" 2>/dev/null || true
  if ! cmp -s "${src}/__init__.py" "${dst}/__init__.py" 2>/dev/null \
     || ! cmp -s "${src}/plugin.yaml" "${dst}/plugin.yaml" 2>/dev/null; then
    echo "[vulpy] Installing remote-ssh plugin (durable plugins dir)..."
    cp "${src}/__init__.py" "${src}/plugin.yaml" "${dst}/" 2>/dev/null \
      || echo "[vulpy] WARN: remote-ssh plugin copy failed" >&2
  fi
  if [ -f "/data/data/hermes/config.yaml" ] \
     && ! grep -q "^[[:space:]]*- remote-ssh$" /data/data/hermes/config.yaml; then
    hermes plugins enable remote-ssh >/dev/null 2>&1 \
      || echo "[vulpy] WARN: could not enable remote-ssh — run 'hermes plugins enable remote-ssh'." >&2
  fi
}
vulpy_ensure_remote_ssh_plugin

# ---------------------------------------------------------------------------
# Ensure the Vulpy Commerce operator tool plugin (single consolidated plugin:
# store_profile, mission_progress, payload_upsert, media_upload, catalog_seed,
# category_set_image, design_tokens_adopt, design_task, coder_dispatch) is
# installed into the durable Hermes plugins dir + enabled. Source of truth:
# extensions/hermes-plugins/vulpy-commerce. Idempotent, non-fatal.
#
# The whole plugin package is synced (companion modules such as
# design_block_pipeline.py are loaded from the plugin dir), not just the two
# named files: a recreate must refresh companions too or the boot can enable
# the plugin without that tool's implementation. Changed source files are
# refreshed; unrelated files already in the durable destination are preserved
# (no destructive wipe); install -m 644 keeps files readable by Fox regardless
# of checkout modes.
# ---------------------------------------------------------------------------
vulpy_ensure_operator_plugin() {
  local name="vulpy-commerce"
  local src="${WORKSPACE}/extensions/hermes-plugins/${name}"
  local dst="/data/data/hermes/plugins/${name}"
  [ -f "${src}/__init__.py" ] || { echo "[vulpy] WARN: ${name} plugin source missing" >&2; return 0; }
  mkdir -p "${dst}" 2>/dev/null || true

  local changed=0 f rel
  while IFS= read -r f; do
    [ -f "${f}" ] || continue
    rel="${f#${src}/}"
    if [ ! -f "${dst}/${rel}" ] || ! cmp -s "${f}" "${dst}/${rel}" 2>/dev/null; then
      changed=1
      break
    fi
  done < <(find "${src}" -type f ! -path '*/__pycache__/*' ! -path '*/.pytest_cache/*' | sort)

  if [ "${changed}" = "1" ]; then
    echo "[vulpy] Installing ${name} plugin (durable plugins dir)..."
    while IFS= read -r f; do
      [ -f "${f}" ] || continue
      rel="${f#${src}/}"
      case "/${rel}" in
        */__pycache__/*|*/.pytest_cache/*) continue ;;
      esac
      install -D -m 644 "${f}" "${dst}/${rel}" 2>/dev/null \
        || echo "[vulpy] WARN: ${name} plugin copy failed: ${rel}" >&2
    done < <(find "${src}" -type f ! -path '*/__pycache__/*' ! -path '*/.pytest_cache/*' | sort)
  fi

  if [ -f "/data/data/hermes/config.yaml" ] \
     && ! grep -q "^[[:space:]]*- ${name}$" /data/data/hermes/config.yaml; then
    hermes plugins enable "${name}" >/dev/null 2>&1 \
      || echo "[vulpy] WARN: could not enable ${name}." >&2
  fi
}
vulpy_ensure_operator_plugin

vulpy_ensure_home_state() {
  # Restore durable HOME config (gh auth, gitconfig, bashrc, ssh) from the
  # host-backed /data/config store. Non-fatal: a missing store or failed copy
  # must never block startup — Fox re-auth is documented in the operator skill.
  local state_script="${WORKSPACE}/scripts/fox-state.sh"
  local boot_log="/data/logs/fox-state-boot.log"
  if [ -f "${state_script}" ]; then
    mkdir -p "$(dirname "${boot_log}")" 2>/dev/null || true
    echo "[vulpy] Restoring Fox HOME state (gh auth / gitconfig / rc) ..."
    if bash "${state_script}" restore >> "${boot_log}" 2>&1; then
      echo "[vulpy] fox-state restore ok (see ${boot_log})"
    else
      echo "[vulpy] WARN: fox-state restore FAILED — see ${boot_log}; gh/git state may need re-auth (bash scripts/fox-state.sh save)." >&2
    fi
  else
    echo "[vulpy] WARN: scripts/fox-state.sh missing — skipping HOME state restore" >&2
  fi
}

echo "[vulpy] Fox deploy group: HOST_UID=${HOST_UID} HOST_GID=${HOST_GID}"
vulpy_ensure_fox_deploy_group "${HOST_GID}"
echo "[vulpy] Workspace ownership: pruned chown (skip node_modules / caches / .data / environments/*.env)"
vulpy_pruned_workspace_chown "${OWNER}" "${WORKSPACE}"
echo "[vulpy] Fixing .next and node_modules/.bin stubs"
vulpy_fix_build_artifact_stubs "${WORKSPACE}" "${OWNER}"
vulpy_fix_hermes_data_perms
vulpy_ensure_home_config_perms
vulpy_ensure_mem0_oss
vulpy_ensure_model_provider
vulpy_ensure_api_server
vulpy_ensure_model_max_tokens
vulpy_ensure_compression_route
vulpy_ensure_home_state

# Fox-overlay patch-anchor gate (boot-time, defense in depth): the Docker
# build runs scripts/check-fox-overlay-patches.py and fails loudly on anchor
# drift, but base-image bumps can land without a rebuild. Re-check here so a
# drifted overlay fails VISIBLY at boot (banner + status JSON) instead of the
# gateway's silent "bootstrap failed" WARNING that left chats broken.
if command -v python3 >/dev/null 2>&1 && [ -f /app/workspace/scripts/check-fox-overlay-patches.py ]; then
    if ! python3 /app/workspace/scripts/check-fox-overlay-patches.py 2>&1 | grep -E "^\[patch-gate\]" >&2; then
        echo ""
        echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
        echo "!! [vulpy] FOX-OVERLAY PATCH GATE FAILED                    !!"
        echo "!! Agent monkey-patches did not apply — chat runs may break !!"
        echo "!! silently (infinite typing dots, missing cron diagnostics).!!"
        echo "!! Fix: refresh the patch anchor for the module named above  !!"
        echo "!! in /app/fox-overlay/fox_overlay/.../monkey_patches/, or   !!"
        echo "!! mark it absorbed-upstream (see runtime_provider.py).      !!"
        echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    fi
fi

# Ensure all files Fox creates after startup are group-writable so the host
# deploy user (runner, vulpy-commerce) can git-pull over agent-created files.
umask 002

# Install sitecustomize.py so the Hermes Python process also starts with
# umask 0o002 — before hermes_cli/config.py can call os.umask(0o007).
# The Dockerfile.hermes bakes this permanently; the entrypoint fallback below
# handles pre-bake images or containers that couldn't be rebuilt yet.
_SITEPACKAGES="$(python3 -c 'import site; print(site.getsitepackages()[0])' 2>/dev/null || echo "")"
_SC_SRC="/app/workspace/scripts/sitecustomize.py"
if [ -n "${_SITEPACKAGES}" ] && [ -f "${_SC_SRC}" ]; then
  cp -f "${_SC_SRC}" "${_SITEPACKAGES}/sitecustomize.py" 2>/dev/null \
    && echo "[vulpy] sitecustomize.py installed (umask hardening)" \
    || echo "[vulpy] WARN: could not install sitecustomize.py to ${_SITEPACKAGES}" >&2
fi
unset _SITEPACKAGES _SC_SRC

ORIG_ENTRY="${FOX_ENTRYPOINT:-/app/entrypoint.sh}"
if [ ! -f "${ORIG_ENTRY}" ]; then
  echo "[vulpy] ERROR: missing Fox entrypoint at ${ORIG_ENTRY}" >&2
  exit 1
fi

PATCHED="$(mktemp)"
HELPERS="$(mktemp)"
{
  declare -f vulpy_ensure_fox_deploy_group
  declare -f vulpy_fix_hermes_data_perms
  echo "HOST_UID=\"${HOST_UID}\""
  echo "HOST_GID=\"${HOST_GID}\""
} > "${HELPERS}"

# Drop stock /data + workspace chowns; reinject our fix before supervisord.
awk -v helpers="${HELPERS}" '
  BEGIN {
    while ((getline line < helpers) > 0) print line
    close(helpers)
    skip = 0
  }
  /^chown -R foxinthebox:foxinthebox \/app\/workspace$/ {
    print "echo \"[vulpy] skipped Fox full-tree workspace chown\""
    next
  }
  /^echo \"\[entrypoint\] Setting ownership on \/data \.\.\.\"$/ {
    print "echo \"[vulpy] Ensuring Fox can write /data (onboarding, hermes.env, settings)\""
    print "vulpy_fix_hermes_data_perms"
    skip = 1
    next
  }
  skip && /^chown root:root \/data\/run/ {
    print "chown root:root /data/run /data/data/tailscale 2>/dev/null || true"
    skip = 0
    next
  }
  skip && /^(chown |    \/data\/)/ { next }
  skip && /^$/ { next }
  /^mkdir -p \/app\/workspace$/ {
    print
    print "echo \"[vulpy] skipped Fox full-tree workspace chown\""
    # consume the following chown -R workspace line if present
    if ((getline nxt) > 0) {
      if (nxt ~ /^chown -R foxinthebox:foxinthebox \/app\/workspace$/) next
      print nxt
    }
    next
  }
  /Starting supervisord/ {
    print "echo \"[vulpy] Re-applying Fox /data perms before supervisord\""
    print "vulpy_fix_hermes_data_perms"
    print "echo \"[vulpy] Ensuring hermes-webui restarts on ANY exit (incl. code 0)\""
    print "python3 -c \047p=\"/etc/supervisor/supervisord.conf\"; s=open(p).read(); sec=s.split(\"[program:hermes-webui]\")[1].split(\"[program:\")[0]; f=\"[program:hermes-webui]\\ncommand=/app/scripts/run-with-env.sh python /data/apps/hermes-webui/server.py\\nuser=foxinthebox\\nautostart=true\\nautorestart=true\\n\"; open(p,\"w\").write(s.replace(f, f + \"exitcodes=\\nstartretries=5\\n\", 1)) if \"exitcodes=\" not in sec else None\047"
    print
    next
  }
  { print }
' "${ORIG_ENTRY}" > "${PATCHED}"

rm -f "${HELPERS}"
chmod +x "${PATCHED}"

# ---------------------------------------------------------------------------
# Item 5.5 — Security checksum verification.
# Verify that security-critical files haven't been tampered with.
# Must run BEFORE any other code that might be affected by malicious modifications.
# ---------------------------------------------------------------------------
verify_security_checksums
# ---------------------------------------------------------------------------
# Item 6 — Ensure diagnostic tools are available inside Fox.
# Installs procps (ps/kill/top) and jq if missing.  Idempotent: skips when
# already present.  Non-fatal: a failed install emits a warning and continues.
# ---------------------------------------------------------------------------
vulpy_ensure_diagnostic_tools() {
  local missing=()
  command -v ps  >/dev/null 2>&1 || missing+=(procps)
  command -v jq  >/dev/null 2>&1 || missing+=(jq)

  if [ "${#missing[@]}" -eq 0 ]; then
    return 0
  fi

  echo "[vulpy] Installing missing diagnostic tools: ${missing[*]}"
  if apt-get update -qq 2>/dev/null && \
     apt-get install -y --no-install-recommends "${missing[@]}" -qq 2>/dev/null; then
    echo "[vulpy] Installed: ${missing[*]}"
  else
    echo "[vulpy] WARN: apt-get failed — diagnostic tools unavailable: ${missing[*]}" >&2
  fi
}
vulpy_ensure_diagnostic_tools
# ---------------------------------------------------------------------------
# Item 6.5 — Ensure gh CLI + dev toolbelt are available inside Fox.
# Installs gh (GitHub CLI), postgresql-client, redis-tools, ripgrep if missing.
# Idempotent: skips tools already present. Non-fatal: warns and continues.
# gh is installed via GitHub's official apt repo for correct amd64/arm64 arch.
# ---------------------------------------------------------------------------
vulpy_ensure_dev_toolbelt() {
  local missing_apt=()
  local missing_names=()

  command -v gh    >/dev/null 2>&1 || { missing_apt+=(gh);                missing_names+=(gh);                }
  command -v ssh   >/dev/null 2>&1 || { missing_apt+=(openssh-client);     missing_names+=(openssh-client);     }
  command -v rsync >/dev/null 2>&1 || { missing_apt+=(rsync);              missing_names+=(rsync);              }
  command -v psql  >/dev/null 2>&1 || { missing_apt+=(postgresql-client); missing_names+=(postgresql-client); }
  command -v redis-cli >/dev/null 2>&1 || { missing_apt+=(redis-tools);   missing_names+=(redis-tools);       }
  command -v rg    >/dev/null 2>&1 || { missing_apt+=(ripgrep);           missing_names+=(ripgrep);           }
  command -v unzip >/dev/null 2>&1 || { missing_apt+=(unzip);             missing_names+=(unzip);             }
  command -v tree  >/dev/null 2>&1 || { missing_apt+=(tree);              missing_names+=(tree);              }
  command -v bc    >/dev/null 2>&1 || { missing_apt+=(bc);                missing_names+=(bc);                }
  command -v wget  >/dev/null 2>&1 || { missing_apt+=(wget);              missing_names+=(wget);              }

  if [ "${#missing_apt[@]}" -eq 0 ]; then
    echo "[vulpy] Dev toolbelt: all tools present (gh, ssh, rsync, psql, redis-cli, rg, unzip, tree, bc, wget)"
    return 0
  fi

  echo "[vulpy] Installing missing dev tools: ${missing_names[*]}"

  # gh needs the GitHub apt repo — set it up first if gh is in the missing list
  if printf '%s\n' "${missing_apt[@]}" | grep -q '^gh$'; then
    if ! [ -f /etc/apt/sources.list.d/github-cli.list ]; then
      echo "[vulpy] Adding GitHub CLI apt repo..."
      if apt-get install -y --no-install-recommends gnupg -qq 2>/dev/null; then
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
          | dd of=/etc/apt/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
        chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
          > /etc/apt/sources.list.d/github-cli.list
      else
        echo "[vulpy] WARN: gnupg install failed — gh may not install correctly" >&2
      fi
    fi
  fi

  if apt-get update -qq 2>/dev/null && \
     apt-get install -y --no-install-recommends "${missing_apt[@]}" -qq 2>/dev/null; then
    echo "[vulpy] Installed: ${missing_names[*]}"
    # Verify gh made it
    if command -v gh >/dev/null 2>&1; then
      echo "[vulpy] gh $(gh --version 2>/dev/null | head -1)"
    fi
  else
    echo "[vulpy] WARN: apt-get failed — some dev tools unavailable: ${missing_names[*]}" >&2
    # Fallback: install gh as a static user binary if apt failed and gh is still missing
    if ! command -v gh >/dev/null 2>&1 && printf '%s\n' "${missing_apt[@]}" | grep -q '^gh$'; then
      echo "[vulpy] Attempting gh fallback: user-level static binary install..."
      local gh_ver gh_dest
      gh_dest="/usr/local/bin/gh"
      gh_ver=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest \
        | grep '"tag_name"' | sed 's/.*"tag_name": *"v\([^"]*\)".*/\1/' 2>/dev/null)
      if [ -n "${gh_ver}" ]; then
        if curl -fsSL "https://github.com/cli/cli/releases/download/v${gh_ver}/gh_${gh_ver}_linux_amd64.tar.gz" \
             -o /tmp/gh-fallback.tar.gz 2>/dev/null \
           && tar -xzf /tmp/gh-fallback.tar.gz -C /tmp "gh_${gh_ver}_linux_amd64/bin/gh" 2>/dev/null; then
          cp "/tmp/gh_${gh_ver}_linux_amd64/bin/gh" "${gh_dest}" && chmod +x "${gh_dest}"
          echo "[vulpy] gh fallback installed: $(gh --version 2>/dev/null | head -1)"
        else
          echo "[vulpy] WARN: gh fallback install failed" >&2
        fi
      else
        echo "[vulpy] WARN: could not determine latest gh version for fallback" >&2
      fi
    fi
  fi
}
vulpy_ensure_dev_toolbelt

# Recreate Hermes agent-profile wrappers (hermes-coder/code-reviewer/qa/...).
# They live in /app/.local/bin — an IMAGE-LAYER path — so a container rebuild
# wipes them and every factory dispatch fails with "No such file or directory".
# Re-running setup-agent-profiles.sh at boot is idempotent and restores them
# before Fox can dispatch. Non-fatal on failure (wrappers are convenience
# entrypoints; the profiles themselves live in ~/.hermes/profiles).
if [ -x "${WORKSPACE}/scripts/setup-agent-profiles.sh" ]; then
  if bash "${WORKSPACE}/scripts/setup-agent-profiles.sh" >/dev/null 2>&1; then
    echo "[vulpy] Hermes agent profiles: wrappers ensured"
  else
    echo "[vulpy] WARN: agent-profile wrapper setup failed (non-fatal)" >&2
  fi
fi

# ---------------------------------------------------------------------------
# Item 7 — Refresh agent context + status on every container start.
# Runs as the deploy user (foxinthebox / HOST_UID) via su if needed.
# Non-fatal: errors are logged but never block startup.
# ---------------------------------------------------------------------------
vulpy_refresh_agent_context() {
  local ws="${WORKSPACE}"
  local ctx_script="${ws}/scripts/generate-agent-context.sh"
  local status_script="${ws}/scripts/generate-agent-status.sh"
  local agent_dir="${ws}/.agent"
  mkdir -p "${agent_dir}" 2>/dev/null || true

  if [ -f "${ctx_script}" ]; then
    echo "[vulpy] Refreshing .agent/generated-context.md ..."
    bash "${ctx_script}" "${agent_dir}/generated-context.md" 2>/dev/null \
      || echo "[vulpy] WARN: generate-agent-context.sh failed (non-fatal)" >&2
  fi

  if [ -f "${status_script}" ]; then
    echo "[vulpy] Refreshing .agent/status.md ..."
    bash "${status_script}" "${agent_dir}/status.md" 2>/dev/null \
      || echo "[vulpy] WARN: generate-agent-status.sh failed (non-fatal)" >&2
  fi

  # Report agent command server state so the agent knows at boot
  # whether it can send lifecycle commands to the host.
  # req/ is Fox-owned (chowned above); resp/ is daemon-owned (excluded from chown).
  local req_dir="${ws}/agent-cmds/req"
  local resp_dir="${ws}/agent-cmds/resp"
  if [ -d "${req_dir}" ] && [ -d "${resp_dir}" ]; then
    echo "[vulpy] Agent command dirs: READY (req/ resp/)"
    echo "[vulpy] Fox container control: ENABLED — use: pnpm vulpy agent cmd <cmd>"
    echo "[vulpy] Scope: dev.up/down/restart/wake/sleep, dev.status, dev.logs*, status"
  else
    echo "[vulpy] Agent command dirs: NOT FOUND (expected ${req_dir} and ${resp_dir})"
    echo "[vulpy] Fox container control: DISABLED — host must run: pnpm vulpy hermes up"
  fi
}
vulpy_refresh_agent_context

# ---------------------------------------------------------------------------
# Item 8 — Sync Vulpy WebUI extension assets (repo → overlay).
# extensions/hermes-webui/ is the Vulpy-owned WebUI plugin bundle (manifest,
# scripts, stylesheets). The overlay (/app/fox-overlay/webui_static) is an
# image layer, so refresh it from the bind-mounted checkout on every start.
# This keeps repo edits live on the next container restart — no image rebuild,
# no manual cp. install -m 644 guarantees the non-root WebUI server can read
# the assets even when checkout files are agent-written mode 600.
# Build-time tooling is never copied into the static dir: *.py files,
# node_modules/, __pycache__/ and .pytest_cache/ anywhere in the tree.
# ---------------------------------------------------------------------------
vulpy_sync_webui_extensions() {
  local src="${WORKSPACE}/extensions/hermes-webui"
  local dst="/app/fox-overlay/webui_static"
  if [ ! -d "${src}" ]; then
    echo "[vulpy] WARN: ${src} not found — skipping WebUI extension sync" >&2
    return 0
  fi
  if [ ! -d "${dst}" ]; then
    echo "[vulpy] WARN: ${dst} not found — skipping WebUI extension sync" >&2
    return 0
  fi
  # Manifest must stay at the extension root (the server reads it from there).
  if [ -f "${src}/manifest.json" ]; then
    install -m 644 "${src}/manifest.json" "${dst}/manifest.json"
  fi
  # features/ is Vulpy-owned (one dir per UI feature) — prune then re-sync so
  # renames and removals propagate. install -m 644 guarantees the non-root
  # WebUI server can read assets even when checkout files are mode 600.
  rm -rf "${dst}/features"
  mkdir -p "${dst}/features"
  # Shared static assets (fox avatar etc.) referenced as /extensions/... by the
  # UI and the mission greetings. The WebUI's extension root IS webui_static, so
  # mirror the workspace extensions/images/ here or those refs 404.
  if [ -d "${WORKSPACE}/extensions/images" ]; then
    mkdir -p "${dst}/extensions"
    local img
    while IFS= read -r img; do
      [ -f "${img}" ] || continue
      install -D -m 644 "${img}" "${dst}/extensions/${img#${WORKSPACE}/extensions/}"
    done < <(find "${WORKSPACE}/extensions/images" -maxdepth 2 -type f | sort)
  fi
  # Prune build-tooling dirs that may exist in the overlay from an earlier
  # full-tree sync (~197M of dead weight for node_modules alone).
  rm -rf "${dst}/node_modules" "${dst}/__pycache__" "${dst}/.pytest_cache"
  local synced=0
  local rel
  while IFS= read -r f; do
    [ -f "${f}" ] || continue
    case "$(basename "${f}")" in
      *.py) continue ;;
    esac
    rel="${f#${src}/}"
    [ "${rel}" = "manifest.json" ] && continue
    # Path-segment exclusion: build-tooling dirs anywhere in the tree
    # (e.g. features/foo/node_modules) never reach the overlay.
    case "/${rel}" in
      */node_modules/*|*/__pycache__/*|*/.pytest_cache/*) continue ;;
    esac
    if install -D -m 644 "${f}" "${dst}/${rel}"; then
      synced=$((synced + 1))
    fi
  done < <(find "${src}" -type f \
    ! -path "*/node_modules/*" ! -path "*/__pycache__/*" ! -path "*/.pytest_cache/*" \
    | sort)
  echo "[vulpy] WebUI extension sync: ${synced} asset(s) refreshed (${src} → ${dst})"
}
vulpy_sync_webui_extensions

# ---------------------------------------------------------------------------
# Item 8a' — Provision the Vulpy store-missions (idempotent, first-boot-safe).
# After the extension sync, run the mission provisioner so every store gets
# the 9 pinned mission chats (Mission 0: Hello … Mission 8). Safe to run on
# every boot: existing missions are skipped (no duplicates). If the
# provisioner is missing or the session dir isn't writable yet, this is a
# non-fatal warn — the next boot retries.
# ---------------------------------------------------------------------------
vulpy_provision_missions() {
  local script="${WORKSPACE}/extensions/hermes-webui/scripts/provision-missions.py"
  local session_dir="/data/state/webui/sessions"
  if [ ! -f "${script}" ]; then
    echo "[vulpy] WARN: mission provisioner not found — skipping (${script})" >&2
    return 0
  fi
  # The WebUI (server.py) creates this dir during its own startup; on a fresh
  # boot the entrypoint may reach here first. Create it (with /data/state
  # parent) so first-boot provisioning is reliable, not racy.
  mkdir -p "${session_dir}" 2>/dev/null || { echo "[vulpy] WARN: cannot create ${session_dir} — skipping provisioning" >&2; return 0; }
  if ! python3 "${script}" --session-dir "${session_dir}" >/tmp/vulpy-provision-missions.log 2>&1; then
    echo "[vulpy] WARN: mission provisioning failed (see /tmp/vulpy-provision-missions.log)" >&2
    return 0
  fi
  echo "[vulpy] Mission provisioning: $(tail -1 /tmp/vulpy-provision-missions.log)"
}

# Default onboarding OFF for fresh installs: mark onboarding complete so the
# native setup wizard does NOT force-redirect to /setup. The mission welcome
# (our extension) replaces the wizard for provider setup. Writes the same
# marker the cloud rollout uses (onboarding.json completed=true), idempotent.
vulpy_default_onboarding_off() {
  local onb="/data/config/onboarding.json"
  mkdir -p "$(dirname "${onb}")"
  if [ ! -f "${onb}" ] || ! grep -q '"completed": *true' "${onb}" 2>/dev/null; then
    printf '{\n  "completed": true,\n  "skipped": true\n}\n' > "${onb}"
    chmod 660 "${onb}" 2>/dev/null || true
    echo "[vulpy] Default onboarding: marked complete (wizard off; mission welcome active)"
  fi
}
vulpy_default_onboarding_off
vulpy_provision_missions

# ---------------------------------------------------------------------------
# Item 8a — Launch the WebUI extension live-sync watcher. The sync above
# refreshes the overlay once at container start; this watcher re-runs the same
# sync in the background whenever a file under extensions/hermes-webui changes
# (~1s poll), so extension CSS/JS edits go live WITHOUT a container restart.
# The WebUI serves these files with Cache-Control: no-store and reads them from
# disk per request, so a fresh copy + browser refresh is all that's needed.
# Non-fatal: if the watcher script is missing, startup proceeds normally.
# ---------------------------------------------------------------------------
if [ -f "${WORKSPACE}/scripts/webui-extension-watch.sh" ]; then
  # `if nohup … & then` tests the fork itself — the launch stays non-fatal
  # under `set -euo pipefail` even if nohup or the log redirect fails.
  if nohup bash "${WORKSPACE}/scripts/webui-extension-watch.sh" >> /data/logs/webui-extension-watch.log 2>&1 & then
    echo "[vulpy] WebUI extension watch: started (pid $!)"
  else
    echo "[vulpy] WARN: WebUI extension watch failed to start" >&2
  fi
fi

# ---------------------------------------------------------------------------
# Item 8b — Render the Vulpy Commerce WebUI runtime config
# (vulpy-commerce.config.json) from container env. VULPY_WEBUI_IFRAMES is a
# JSON array of {id,label,url} iframe targets for the side panel; default []
# renders the panel with its empty-state hint. VULPY_WEBUI_SHOP_PORT /
# VULPY_WEBUI_API_PORT (passed through by docker-compose.hermes.yml from the
# host env) are emitted as shopPort/apiPort so the side panel's derived
# iframe tabs use the ACTUAL dev shop/api ports (fallback 3000/9000, int-
# guarded in python). Written with install -m 644 so the non-root WebUI
# server can read it. JSON-safe via python3 — no shell interpolation
# pitfalls. Each iframe target origin must ALSO be allowlisted in
# HERMES_WEBUI_CSP_FRAME_EXTRA or the frame stays blank (CSP frame-src).
# ---------------------------------------------------------------------------
vulpy_render_webui_config() {
  local dst="/app/fox-overlay/webui_static"
  if [ ! -d "${dst}" ]; then
    echo "[vulpy] WARN: ${dst} not found — skipping WebUI config render" >&2
    return 0
  fi

  local raw="${VULPY_WEBUI_IFRAMES:-[]}"
  local shop_port="${VULPY_WEBUI_SHOP_PORT:-3000}"
  local api_port="${VULPY_WEBUI_API_PORT:-9000}"
  # Export with the shell-level fallback so the python render below sees sane
  # values even if compose did not pass the vars; the python int-guard stays
  # as a final backstop.
  export VULPY_WEBUI_SHOP_PORT="${shop_port}"
  export VULPY_WEBUI_API_PORT="${api_port}"
  local tmp
  tmp="$(mktemp)"

  if ! printf '%s' "${raw}" | python3 -c '
import json, os, sys
def _port(key, fallback):
    try:
        return int(os.environ.get(key) or "")
    except (TypeError, ValueError):
        return fallback
try:
    items = json.load(sys.stdin)
except Exception:
    items = []
clean = []
if isinstance(items, list):
    for it in items:
        if isinstance(it, dict) and isinstance(it.get("url"), str) and it["url"].strip():
            if str(it.get("id") or "") == "editor" and os.environ.get("vulpy_codeeditor_enabled", "true").lower() in {"0", "false", "no", "off"}:
                continue
            clean.append({"id": str(it.get("id") or ""),
                          "label": str(it.get("label") or it.get("id") or it["url"]),
                          "url": it["url"]})
json.dump({"iframes": clean,
           "shopPort": _port("VULPY_WEBUI_SHOP_PORT", 3000),
           "apiPort": _port("VULPY_WEBUI_API_PORT", 9000)}, sys.stdout)
' > "${tmp}" 2>/dev/null; then
    echo "[vulpy] WARN: VULPY_WEBUI_IFRAMES is not valid JSON — writing empty config" >&2
    printf '%s' '{"iframes": []}' > "${tmp}"
  fi

  install -m 644 "${tmp}" "${dst}/vulpy-commerce.config.json"
  rm -f "${tmp}"
  echo "[vulpy] WebUI config render: vulpy-commerce.config.json"
}
vulpy_render_webui_config

# ---------------------------------------------------------------------------
# Item 8c — Apply the paint-first done handler patch to messages.js.
# Skips the full renderMessages() DOM rebuild on stream completion, deferring
# non-essential work (loadDir, renderSessionList, notifications) to the next
# frame. This fix is applied to the baked image on every container start because
# /app/hermes-webui/static/ is in the image layer and gets wiped on rebuild.
# ---------------------------------------------------------------------------
if ! python3 "${WORKSPACE}/scripts/patch-hermes-webui-paint-first.py"; then
  # Do not block Fox startup on an upstream WebUI shape change; leave a visible
  # warning so the patcher can be updated deliberately rather than fuzzily.
  echo "[vulpy] WARN: paint-first done handler patch was not applied" >&2
fi

# Stream-finalize integrity: this patch composes with the paint-first output,
# so it must run immediately after item 8c at boot, not during the Docker build
# against the pristine upstream bundle. Non-fatal like paint-first: drift is
# visible and the baked tool remains available for correction.
if ! python3 \
    /usr/local/bin/patch-webui-stream-finalize-settle.py \
    /app/hermes-webui/static/messages.js; then
  echo "[vulpy] WARN: stream-finalize settle patch was not applied" >&2
fi

# ---------------------------------------------------------------------------
# Item 9 — Re-register the dev-storefront-watchdog cron job if a container
# restart dropped it from the jobs DB. The watchdog probes the local dev
# storefront and fires dev.restart via the agent-cmd file-drop when wedged.
# Non-fatal: a failure here never blocks startup.
# ---------------------------------------------------------------------------
vulpy_ensure_watchdog_cron() {
  local jobs="/data/data/hermes/cron/jobs.json"
  local name="dev-storefront-watchdog"
  local script_src="/app/workspace/scripts/dev-watchdog-cron.sh"
  local script_dst="/data/data/hermes/scripts/dev-watchdog.sh"

  # Ensure the script file exists in Hermes' scripts dir — without it the cron
  # job registers but every tick errors with "Script not found". Install from
  # the repo source on every boot so fresh installs and container wipes self-heal.
  if [ -f "${script_src}" ]; then
    mkdir -p "$(dirname "${script_dst}")"
    cp "${script_src}" "${script_dst}"
    chmod +x "${script_dst}"
    echo "[vulpy] dev-watchdog script: installed to ${script_dst}"
  else
    echo "[vulpy] WARN: dev-watchdog source not found at ${script_src}" >&2
  fi

  if [ -f "${jobs}" ] && grep -q "${name}" "${jobs}" 2>/dev/null; then
    echo "[vulpy] dev-watchdog cron: present"
    return 0
  fi
  echo "[vulpy] dev-watchdog cron: MISSING — re-registering via hermes CLI"
  if command -v hermes >/dev/null 2>&1; then
    su foxinthebox -s /bin/bash -c 'export HOME=/app HERMES_HOME=/data/data/hermes; hermes cron create "every 10m" --name dev-storefront-watchdog --no-agent --script dev-watchdog.sh --deliver local' 2>&1 | tail -2 \
      || echo "[vulpy] WARN: watchdog cron re-register failed (non-fatal)" >&2
  else
    echo "[vulpy] WARN: hermes CLI not found — watchdog cron not re-registered" >&2
  fi
}
vulpy_ensure_watchdog_cron

# ---------------------------------------------------------------------------
# Item 10 — Recreate the pnpm shim in /tmp (wiped on every container recreate).
# The image does not put pnpm on PATH; /tmp/pnpm-bin is the documented
# location (memory + skills). Without it, in-container scripts that dispatch
# via `pnpm vulpy agent cmd ...` fail with rc=127 ("command not found") —
# observed 2026-08-16 15:16-15:22 when wait-and-rebuild.sh hit a missing
# /tmp/pnpm-bin after the 12:10 recreate and the queued rebuild never fired.
# Idempotent + non-fatal: a failure here never blocks startup.
# ---------------------------------------------------------------------------
vulpy_ensure_pnpm_shim() {
  if ! command -v pnpm >/dev/null 2>&1; then
    mkdir -p /tmp/pnpm-bin
    if command -v corepack >/dev/null 2>&1; then
      corepack enable --install-directory /tmp/pnpm-bin >/dev/null 2>&1 \
        || echo "[vulpy] WARN: corepack enable failed — pnpm shim not created (non-fatal)" >&2
    else
      echo "[vulpy] WARN: corepack not found — pnpm shim not created (non-fatal)" >&2
    fi
  fi
  if [ -x /tmp/pnpm-bin/pnpm ] && [[ ":${PATH}:" != *":/tmp/pnpm-bin:"* ]]; then
    export PATH="/tmp/pnpm-bin:${PATH}"
    echo "[vulpy] pnpm shim: /tmp/pnpm-bin on PATH (v$(pnpm --version 2>/dev/null || echo '?'))"
  fi
}
vulpy_ensure_pnpm_shim

# ---------------------------------------------------------------------------
# Item 11 — Gitea sidecar init (non-fatal, idempotent).
# Initializes the env-push relay: admin user / org / repo / remote + HEAD
# push. Never blocks startup — the sidecar may still be booting; the next
# container start retries.
# ---------------------------------------------------------------------------
vulpy_ensure_gitea_relay() {
  if [ -x "${WORKSPACE}/scripts/gitea-init.sh" ]; then
    bash "${WORKSPACE}/scripts/gitea-init.sh" \
      || echo "[vulpy] WARN: gitea-init.sh failed (non-fatal — retried next boot)" >&2
  else
    echo "[vulpy] WARN: scripts/gitea-init.sh missing — gitea relay not initialized" >&2
  fi
}
vulpy_ensure_gitea_relay

exec bash "${PATCHED}"
