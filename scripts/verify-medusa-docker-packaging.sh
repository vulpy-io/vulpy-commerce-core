#!/usr/bin/env bash
# Fail if apps/medusa-backend workspace deps are not correctly packaged in the
# Medusa Dockerfile. Catches CI failures where .medusa is dockerignored and the
# image never builds/copies packages/* (e.g. @vulpy/medusa-plugin-email).
#
# Escape hatch: SKIP_DOCKER_PACKAGING_VERIFY=1
set -euo pipefail

if [[ "${SKIP_DOCKER_PACKAGING_VERIFY:-}" == "1" ]]; then
  echo "Skipping Medusa Docker packaging verify (SKIP_DOCKER_PACKAGING_VERIFY=1)"
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PKG="${ROOT_DIR}/apps/medusa-backend/package.json"
DOCKERFILE="${ROOT_DIR}/apps/medusa-backend/Dockerfile"
DOCKERIGNORE="${ROOT_DIR}/.dockerignore"

die() {
  echo "error: $*" >&2
  exit 1
}

[[ -f "$BACKEND_PKG" ]] || die "missing $BACKEND_PKG"
[[ -f "$DOCKERFILE" ]] || die "missing $DOCKERFILE"

# Workspace package names referenced by the backend (workspace:*).
mapfile -t WORKSPACE_NAMES < <(
  node -e '
    const pkg = require(process.argv[1]);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(deps)) {
      if (version === "workspace:*") process.stdout.write(name + "\n");
    }
  ' "$BACKEND_PKG"
)

if [[ ${#WORKSPACE_NAMES[@]} -eq 0 ]]; then
  echo "Medusa Docker packaging: no workspace:* deps on @apps/medusa-backend — ok"
  exit 0
fi

# name -> relative package directory (e.g. packages/medusa-plugin-email)
declare -A NAME_TO_DIR=()
while IFS= read -r -d '' pkg_json; do
  name="$(node -e 'process.stdout.write(require(process.argv[1]).name || "")' "$pkg_json")"
  [[ -n "$name" ]] || continue
  rel="$(realpath --relative-to="$ROOT_DIR" "$(dirname "$pkg_json")")"
  NAME_TO_DIR["$name"]="$rel"
done < <(find "$ROOT_DIR/packages" "$ROOT_DIR/apps" -mindepth 2 -maxdepth 2 -name package.json -print0 2>/dev/null)

errors=0
fail() {
  echo "error: $*" >&2
  errors=$((errors + 1))
}

dockerfile_has_line_containing() {
  # $1 = fixed substring that must appear on some line
  grep -Fq "$1" "$DOCKERFILE"
}

MEDUSA_DOCKERIGNORED=0
if [[ -f "$DOCKERIGNORE" ]] && grep -qE '(^|/)\*\*/\.medusa($|/|\s)' "$DOCKERIGNORE"; then
  MEDUSA_DOCKERIGNORED=1
fi

for name in "${WORKSPACE_NAMES[@]}"; do
  dir="${NAME_TO_DIR[$name]:-}"
  if [[ -z "$dir" ]]; then
    fail "workspace dep $name is not under packages/ or apps/"
    continue
  fi

  # deps stage must copy package.json so pnpm can link the workspace package
  if ! dockerfile_has_line_containing "COPY ${dir}/package.json ${dir}/"; then
    fail "Dockerfile deps stage missing: COPY ${dir}/package.json ${dir}/"
  fi

  # builder must build the package when .medusa is dockerignored (plugin exports)
  if [[ "$MEDUSA_DOCKERIGNORED" -eq 1 ]]; then
    if ! dockerfile_has_line_containing "pnpm --filter ${name} build"; then
      fail "Dockerfile builder missing: pnpm --filter ${name} build (required because **/.medusa is dockerignored)"
    fi
  fi

  # runner must copy the package directory (symlink target at runtime)
  if ! dockerfile_has_line_containing "COPY --from=builder /app/${dir}"; then
    fail "Dockerfile runner missing: COPY --from=builder /app/${dir} ..."
  fi
done

if [[ "$errors" -gt 0 ]]; then
  echo >&2
  echo "Medusa Docker packaging verify failed (${errors} issue(s))." >&2
  echo "See apps/medusa-backend/Dockerfile and scripts/verify-medusa-docker-packaging.sh" >&2
  echo "Skip with SKIP_DOCKER_PACKAGING_VERIFY=1 if intentional." >&2
  exit 1
fi

echo "Medusa Docker packaging: ok (${#WORKSPACE_NAMES[@]} workspace dep(s))"
