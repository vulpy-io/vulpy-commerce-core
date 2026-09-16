#!/usr/bin/env bash
# fox-state.sh round-trip test — runs in a temp HOME; touches nothing real.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

export HOME="${TMP}/home"
export FOX_STATE_DATA="${TMP}/data/config"
# Pin HOME_DIR to the temp home: HOME alone is ignored once getent resolves the
# fox user's passwd home (issue #97) — without this the save/restore steps would
# operate on the real /app state (and restore rm -rf's before copying).
export FOX_STATE_HOME="${TMP}/home"
mkdir -p "${HOME}/.config/gh" "${TMP}/data/config"

# seed fake state
cat > "${HOME}/.config/gh/hosts.yml" <<'EOF'
github.com:
    user: test-user
    oauth_token: fake-token
EOF
cat > "${HOME}/.gitconfig" <<'EOF'
[safe]
    directory = /app/workspace
EOF
echo 'export PATH="/usr/bin:$PATH"' > "${HOME}/.bashrc"

# 1. save
bash "${ROOT}/scripts/fox-state.sh" save
[ -f "${TMP}/data/config/gh/hosts.yml" ] || { echo "FAIL: save gh"; exit 1; }
[ -f "${TMP}/data/config/gitconfig" ]    || { echo "FAIL: save gitconfig"; exit 1; }
[ -f "${TMP}/data/config/bashrc" ]       || { echo "FAIL: save bashrc"; exit 1; }
echo "save: ok"

# 2. simulate rebuild: wipe HOME
rm -rf "${HOME}"
mkdir -p "${HOME}"

# 3. restore
bash "${ROOT}/scripts/fox-state.sh" restore
[ -f "${HOME}/.config/gh/hosts.yml" ]    || { echo "FAIL: restore gh"; exit 1; }
[ -f "${HOME}/.gitconfig" ]              || { echo "FAIL: restore gitconfig"; exit 1; }
[ -f "${HOME}/.bashrc" ]                 || { echo "FAIL: restore bashrc"; exit 1; }
grep -q "test-user" "${HOME}/.config/gh/hosts.yml" || { echo "FAIL: gh content"; exit 1; }
[ "$(stat -c '%a' "${HOME}/.config/gh/hosts.yml")" = "600" ] || { echo "FAIL: gh mode"; exit 1; }

# 4. idempotency: second restore is a no-op success and must not nest copies
bash "${ROOT}/scripts/fox-state.sh" restore >/dev/null
[ ! -e "${HOME}/.config/gh/gh" ]       || { echo "FAIL: nested gh dir"; exit 1; }

# 5. regression #97: FOX_STATE_HOME override wins over a wrong HOME (boot context)
export HOME="${TMP}/bogus-home"          # simulates entrypoint HOME (e.g. /root)
mkdir -p "${HOME}"
FOX_STATE_HOME="${TMP}/home" bash "${ROOT}/scripts/fox-state.sh" restore >/dev/null
[ -f "${TMP}/home/.config/gh/hosts.yml" ] || { echo "FAIL: override restore gh"; exit 1; }
[ ! -e "${HOME}/.config/gh" ]              || { echo "FAIL: restore leaked to bogus HOME"; exit 1; }
unset FOX_STATE_HOME

# 6. regression #97: with HOME unset, resolution falls back to the fox user's
#    passwd home (getent) — in this container that is /app, never a temp dir.
env -u HOME bash "${ROOT}/scripts/fox-state.sh" status | grep "HOME=/app" >/dev/null \
  || { echo "FAIL: getent resolution"; exit 1; }
export HOME="${TMP}/home"                  # restore test HOME for any later steps
echo "restore: ok (round-trip + idempotent)"
