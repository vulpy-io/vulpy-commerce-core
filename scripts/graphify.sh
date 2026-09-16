#!/usr/bin/env bash
# graphify.sh — Monorepo-aware Graphify wrapper.
#
# Runs graphify from the repo root so the output folder and cache are
# always at the same path regardless of which subdirectory you're in.
#
# Usage (via pnpm scripts):
#   pnpm graphify:build           # full (re-)build of the knowledge graph
#   pnpm graphify:update          # incremental update (changed files only)
#   pnpm graphify:query "..."     # query the graph
#   pnpm graphify:wiki            # build agent-crawlable wiki
#   pnpm graphify:watch           # live-sync mode (background terminal)
#
# Environment:
#   ANTHROPIC_API_KEY   Required for LLM extraction passes. Set in your shell
#                       or in the GitHub Actions environment / VPS .env.
#   GRAPHIFY_FLAGS      Optional extra flags forwarded to graphify (e.g.
#                       --mode deep). Set before calling the script.
#
# The graphify-out/ folder is gitignored (cache + obsidian vault), but
# graph.html, graph.json, wiki/, and GRAPH_REPORT.md are committed so the
# interactive output lives in the repo for the team.

set -euo pipefail

# Ensure graphify output files are group-writable so both the host user and
# the container agent (foxinthebox) can read/write the graph outputs.
umask 002

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Ensure graphify is installed
if ! command -v graphify &>/dev/null; then
  echo "▶ graphify not found — running setup first..."
  bash "$REPO_ROOT/scripts/setup-graphify.sh" --no-hook
fi

SUBCOMMAND="${1:-build}"
shift || true

case "$SUBCOMMAND" in

  build)
    # Full build from scratch — ignores cache.
    # Falls back to --code-only (AST, no LLM) when ANTHROPIC_API_KEY is absent.
    echo "▶ graphify: full build..."
    EXTRA=""
    if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${OPENAI_API_KEY:-}" && -z "${GEMINI_API_KEY:-}" && -z "${GOOGLE_API_KEY:-}" ]]; then
      echo "   (no API key set — using --code-only; set ANTHROPIC_API_KEY for full semantic extraction)"
      EXTRA="--code-only"
    fi
    # shellcheck disable=SC2086
    graphify . $EXTRA ${GRAPHIFY_FLAGS:-} "$@"
    ;;

  update)
    # Incremental: re-process only changed files, merge into existing graph.
    # Falls back to --code-only (AST, no LLM) when ANTHROPIC_API_KEY is absent.
    echo "▶ graphify: incremental update..."
    EXTRA=""
    if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${OPENAI_API_KEY:-}" && -z "${GEMINI_API_KEY:-}" && -z "${GOOGLE_API_KEY:-}" ]]; then
      EXTRA="--code-only"
    fi
    # shellcheck disable=SC2086
    graphify . --update $EXTRA ${GRAPHIFY_FLAGS:-} "$@"
    ;;

  query)
    # Query the persistent graph. Requires at least one argument.
    if [[ $# -eq 0 ]]; then
      echo "Usage: pnpm graphify:query \"<your question>\""
      exit 1
    fi
    graphify query "$@"
    ;;

  wiki)
    # Build Wikipedia-style agent-navigable wiki.
    echo "▶ graphify: building wiki..."
    # shellcheck disable=SC2086
    graphify . --wiki ${GRAPHIFY_FLAGS:-} "$@"
    ;;

  watch)
    # Live-sync: auto-rebuild as files change.
    echo "▶ graphify: watch mode (ctrl-c to stop)..."
    # shellcheck disable=SC2086
    graphify . --watch ${GRAPHIFY_FLAGS:-} "$@"
    ;;

  *)
    # Pass-through: any graphify subcommand or flag
    # shellcheck disable=SC2086
    graphify "$SUBCOMMAND" ${GRAPHIFY_FLAGS:-} "$@"
    ;;

esac
