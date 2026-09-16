#!/usr/bin/env bash
# scripts/vulpy-session-retention.sh — safe session-store retention.
#
# The default is a report-only dry run. This script never deletes anything.
# With --apply it moves only oversized session JSON files into an archive:
# more than 2,000 stored messages OR more than 8 MiB on disk. Request dumps,
# the index, and sessions at either exact boundary are never moved.
#
# Usage:
#   vulpy-session-retention.sh [--dry-run|--apply] [--dir PATH ...]
#
# Session directories live under /data and are durable across container
# recreates. The archive is a sibling directory named archive/ and is not
# scanned by the sweep.
set -euo pipefail

DRY_RUN=1
MODE_EXPLICIT=0
declare -a DIRS=()
DEFAULT_DIRS=(
  "${HERMES_SESSION_DIR:-/data/data/hermes/sessions}"
)

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      [ "$MODE_EXPLICIT" -eq 0 ] || { echo "ERROR: choose only one of --dry-run or --apply" >&2; exit 1; }
      DRY_RUN=1; MODE_EXPLICIT=1; shift ;;
    --apply)
      [ "$MODE_EXPLICIT" -eq 0 ] || { echo "ERROR: choose only one of --dry-run or --apply" >&2; exit 1; }
      DRY_RUN=0; MODE_EXPLICIT=1; shift ;;
    --dir)
      [ $# -ge 2 ] || { echo "ERROR: --dir requires a path" >&2; exit 1; }
      DIRS+=("$2"); shift 2 ;;
    --dir=*) DIRS+=("${1#*=}"); shift ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      echo "Usage: $0 [--dry-run|--apply] [--dir PATH]" >&2
      exit 1
      ;;
  esac
done

if [ "${#DIRS[@]}" -eq 0 ]; then
  DIRS=("${DEFAULT_DIRS[@]}")
  for profile_dir in /data/data/hermes/profiles/*/sessions; do
    [ -d "$profile_dir" ] && DIRS+=("$profile_dir")
  done
fi

MAX_ROWS=2000
MAX_BYTES=$((8 * 1024 * 1024))
moved_count=0

session_rows() {
  # Malformed files are not treated as oversized by row count; the write-time
  # cap and byte threshold still provide a safe path for genuinely large files.
  python3 - "$1" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        value = json.load(handle)
    messages = value.get("messages", []) if isinstance(value, dict) else []
    print(len(messages) if isinstance(messages, list) else 0)
except (OSError, ValueError, TypeError):
    print(0)
PY
}

for dir in "${DIRS[@]}"; do
  [ -d "$dir" ] || { echo "skip (missing): $dir"; continue; }
  archive="$dir/archive"

  while IFS= read -r file; do
    size=$(stat -c %s "$file" 2>/dev/null || continue)
    rows=$(session_rows "$file")
    if [ "$rows" -le "$MAX_ROWS" ] && [ "$size" -le "$MAX_BYTES" ]; then
      continue
    fi

    name=$(basename "$file")
    target="$archive/$name"
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "[dry-run] would move: $file -> $target (${rows} rows, ${size} bytes)"
    else
      if [ -e "$target" ]; then
        echo "ERROR: archive target already exists: $target" >&2
        exit 1
      fi
      mkdir -p -- "$archive"
      mv -- "$file" "$target"
      echo "moved: $file -> $target (${rows} rows, ${size} bytes)"
    fi
    moved_count=$((moved_count + 1))
  done < <(
    find "$dir" -maxdepth 1 -type f -name '*.json' \
      ! -name 'request_dump_*.json' ! -name '_index.json' -print
  )
done

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry-run: would move $moved_count oversized session file(s); deleted 0 files"
else
  echo "Moved $moved_count oversized session file(s); deleted 0 files"
fi