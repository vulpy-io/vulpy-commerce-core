# Husky + graphify hook failure transcript (Aug 2026, Vulpy Hermes container)

Concrete failure modes, exact errors, and the fix commit from the session that
produced this skill.

## Environment

- Repo: vulpy-commerce-pro-private checkout, branch `feat/110-edge-internal`
- Container Hermes (uid 999) with corepack pnpm at `/usr/lib/node_modules/corepack/shims`
- `core.hooksPath = .husky/_` (husky v9/v10); git 2.47.3
- graphify NOT installed in the container (host has it)

## Failure 1: pre-commit `pnpm: not found`

Commit attempt (hooks enabled) produced:

```
.husky/pre-commit: 4: pnpm: not found
husky - pre-commit script failed (code 127)
husky - command not found in PATH=node_modules/.bin:/usr/lib/git-core:/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games
```

The hook env lacked `/usr/lib/node_modules/corepack/shims` even though the
interactive shell had it — hooks inherit the caller's env, and the committing
process had a stripped PATH. `_/h` adds `node_modules/.bin` but nothing else.

Fix: portable PATH guard in `.husky/pre-commit` + `.husky/pre-push` (see
SKILL.md). Guard checks `command -v pnpm`, then prepends the first existing of:
`/usr/lib/node_modules/corepack/shims`, `$HOME/.local/share/pnpm`,
`$HOME/Library/pnpm`.

## Failure 2: post-commit exit 127 with full PATH

Even with corepack shims on PATH, post-commit died:

```
husky - post-commit script failed (code 127)
husky - command not found in PATH=node_modules/.bin:/usr/lib/git-core:/usr/lib/node_modules/corepack/shims:/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games
```

Trace (`sh -ex .husky/post-commit 2>&1 | tail -15`) showed the hook dying
immediately after:

```
+ command -v graphify
+ GRAPHIFY_BIN=
EXIT:127
```

Root cause: `set -e` (from `sh -e` in `_/h`) + the assignment
`GRAPHIFY_BIN=$(command -v graphify 2>/dev/null)` — `command -v` exits 1 when
graphify is absent, the substitution fails, and `set -e` kills the hook with
127. graphify simply isn't installed in the container.

Fix (both `.husky/post-commit` and `.husky/post-checkout`):

```sh
GRAPHIFY_BIN=$(command -v graphify 2>/dev/null || true)
```

Result: hook falls through to its last-resort probe, prints
`[graphify hook] could not locate a Python with graphify installed...`, exits 0.

## Testing

```sh
git hook run pre-commit                # → "lint-staged could not find any staged files." exit 0
env PATH=/usr/local/bin:/usr/bin:/bin git hook run pre-commit   # stripped-PATH repro → exit 0
git hook run post-commit               # graceful message, exit 0
git hook run post-checkout             # exit 0
```

Real commit (no `--no-verify`) ran pre-commit (lint-staged, no matching staged
files) + post-commit (graphify degrade) cleanly → commit `a5c740e`
`fix(hooks): resolve pnpm via corepack shims, stop graphify hook crash without graphify`,
4 files, +26/-2.

## Related: sparse-checkout + skip-worktree on .hermes/skills

Same session: `.git/info/sparse-checkout` contains `/*` + `!.hermes/skills/`
and tracked skill paths carry `S` (skip-worktree) flags, so `git status` never
reported the 16 deleted broken symlinks under `.hermes/skills/`. Staging used:

```sh
git update-index --force-remove -- <16 deleted paths>
git add --sparse -- <3 restored dirs>
```

Commit `2f0e106` `chore(skills): restore referenced Medusa skills, drop dead
.agents symlinks` (70 files). See `hermes-multi-agent-profiles` skill for the
curated skill-farm pattern this was part of.

## Regeneration warning

`graphify hook install` regenerates `.husky/post-commit` + `.husky/post-checkout`
from its own template — the template still contains the unguarded
`command -v graphify` line, so reinstalling reintroduces the 127 crash. Fix
needs to go upstream in the graphify package.
