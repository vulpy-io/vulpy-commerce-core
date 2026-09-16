#!/usr/bin/env bash
# setup-graphify.sh — Install Graphify and set up the git commit hook.
#
# Usage:
#   bash scripts/setup-graphify.sh          # install + hook
#   bash scripts/setup-graphify.sh --no-hook # install only (useful in CI/containers)
#
# Requires: Python 3.10+, pip, ANTHROPIC_API_KEY (for LLM extraction passes)
# PyPI package is "graphifyy"; CLI command is "graphify".

set -euo pipefail

# Ensure graphify output files are group-writable so the host user and the
# container agent (foxinthebox) can both read/write the graph outputs.
umask 002

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_HOOK=0

for arg in "$@"; do
  case "$arg" in
    --no-hook) NO_HOOK=1 ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ─── Install ────────────────────────────────────────────────────────────────

echo "▶ Installing graphify..."

# Prefer pipx (isolated env, no system pollution) if available; fall back to pip --user
if command -v pipx &>/dev/null; then
  pipx install graphifyy --force
else
  pip install --user --upgrade graphifyy
fi

# Verify the CLI is available
if ! command -v graphify &>/dev/null; then
  echo ""
  echo "⚠  'graphify' not found in PATH after install."
  echo "   If you used pip --user, add this to your shell profile:"
  echo "     export PATH=\"\$(python3 -m site --user-base)/bin:\$PATH\""
  echo "   Then run: source ~/.bashrc (or restart your terminal)"
  echo "   Or: pip install pipx && pipx install graphifyy"
  exit 1
fi

GRAPHIFY_VERSION="$(graphify --version 2>/dev/null || echo 'unknown')"
echo "✓ graphify installed: $GRAPHIFY_VERSION"

# ─── Git commit hook ────────────────────────────────────────────────────────

if [[ "$NO_HOOK" -eq 0 ]]; then
  echo ""
  echo "▶ Installing git post-commit hook (auto-rebuilds graph on every commit)..."
  cd "$REPO_ROOT"
  graphify hook install
  echo "✓ Git hook installed."
else
  echo "  (Skipping git hook — --no-hook passed)"
fi

# ─── Done ───────────────────────────────────────────────────────────────────

echo ""
echo "────────────────────────────────────────────────"
echo "✅ Graphify setup complete."
echo ""
echo "  Initial graph build:"
echo "    pnpm graphify:build"
echo ""
echo "  Or via CLI directly:"
echo "    graphify . --update"
echo ""
echo "  View output:"
echo "    open graphify-out/graph.html"
echo ""
echo "  ANTHROPIC_API_KEY must be set for LLM extraction passes."
echo "────────────────────────────────────────────────"
