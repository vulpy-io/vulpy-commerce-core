# Vendored Submodule → npm Dependency Migration

Session origin: 2026-08-14, `impeccable/` git submodule (pbakaus/impeccable,
398M checked out, pinned at a fork-line commit) → `impeccable@^3.6.0` npm
devDependency.

## When to migrate

A vendored git submodule at repo root causes any of:
- Nested config conflict (biome.json, eslint, prettier) breaking the local
  linter while CI passes (CI leaves the submodule as an empty stub).
- pnpm-workspace membership pulling the vendored repo's own deps (jsdom,
  playwright, svelte, archiver) into every install graph despite zero runtime
  imports (CLI-only usage).
- Update ceremony: bump commit SHA + `git submodule update` on every box.

## Decision checklist

1. **Is there a published npm package?** `npm view <name> version`. If the
   submodule is pinned to a FORK-LINE commit, compare CLI versions:
   `node <submodule>/cli/bin/cli.js --version` vs the npm tarball's. Migrating
   is safe only when npm ≥ the pin (no fork-only commits to lose). This
   session: submodule CLI said 3.5.0, npm had 3.6.0 (newer, published the same
   day) — clean migration.
2. **Is it imported as a module anywhere?** `grep -rn 'from "<name>"' src/`
   — if empty and usage is CLI-only (`node <name>/cli/bin/cli.js detect`),
   no runtime import graph to preserve.
3. **Where is it declared?** `dependencies` vs `devDependencies` — CLI-only
   dev tooling belongs in devDependencies (root + the app whose scripts call it).

## Migration steps (verified)

1. Remove the submodule:
   ```bash
   git submodule deinit -f -- <name>
   git rm -f --cached <name>
   rm -rf .git/modules/<name> <name>     # kill the 398M checkout + git dir
   git rm -f .gitmodules                 # empty file, not just emptied
   ```
2. Update `pnpm-workspace.yaml` — drop the `- "<name>"` member line.
3. package.json (root + consuming apps): `"<name>": "workspace:*"` →
   `"^<version>"` (devDependencies).
4. **Fix script entry points — critical.** `node <name>/cli/bin/cli.js`
   worked only because the submodule was a real DIRECTORY. Node resolves the
   CLI *argument* as a file path, NOT via node_modules — the same command now
   fails with `Cannot find module '/app/workspace/<name>/cli/bin/cli.js'`
   (MODULE_NOT_FOUND) even though `node_modules/<name>` exists. Use the bin
   shim instead: `<name> detect ...` (pnpm puts `node_modules/.bin` on PATH
   inside package scripts; bare invocation from a shell needs
   `pnpm exec <name> ...`).
5. Regenerate the lockfile: `pnpm install` (lockfile-only if a package's
   prepare hook can't run in the container — see git-hook-hardening Failure 1b
   for the TURBO_CACHE_DIR/skip-scripts workarounds). Verify the lockfile now
   shows `name@version:` from the registry and NO `link:` entries.
6. Update CI: drop `submodules: recursive`, add the normal
   `pnpm install --frozen-lockfile` step, run the detector via
   `pnpm exec <name> detect ...`.
7. Biome: add `!!<name>` to `files.includes` (belt + suspenders — node_modules
   is already skipped, this covers a stray checkout).

## Aftermath — the lint debt reveal

The nested-config abort meant `pnpm check` NEVER reached real files, so
pre-existing lint errors accumulated silently (89 in this session, across
design scripts + webui extension files). After migrating:
- `pnpm check` → list every error, grouped by file.
- `biome check --write --unsafe` auto-fixes most (block statements, template
  literals, node: protocol, optional chain, for-of).
- Hand-fix what unsafe won't touch: `useTopLevelRegex` (hoist to module const),
  `noEmptyBlockStatements` (comment the no-op), `useForOf`.
- **Verify unsafe renames** — Biome renames an assigned-but-unread variable to
  `_name` (unused convention). Confirm the rename is applied consistently
  across the file (both declaration and every assignment) before keeping.
- Biome-ignore untracked scratch dirs (e.g. dead `design-concepts/`) rather than fixing
  them — they're not part of the product.

## Updates after migration

Easier than the submodule: semver range in devDependencies + `pnpm update
<name>` for compatible bumps, `pnpm add -D <name>@latest` for majors. The
lockfile freezes the exact resolved version — deliberate, reviewable diffs,
same discipline as the submodule pin minus the ceremony.
