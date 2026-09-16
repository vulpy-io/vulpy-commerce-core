# Worktree State Audits — Untracked Sweep, Branch Cleanup, Stash Classification

Session origin: 2026-08-13 consolidation (main + spike + fix + stash). The
tree was declared "clean" repeatedly while untracked skill references and
task briefs accumulated — the completion sweep filtered `??` out and never
looked at them. This is the recipe that closes the gap.

## 1. Untracked-file sweep (part of EVERY completion)

```bash
git status --short                              # tracked AND untracked
git status --short | grep "^??"                 # the set that was being missed
```

Classify each `??` entry:

| Class | Examples | Action |
|-------|----------|--------|
| Referenced by committed file | `references/foo.md` named in a committed SKILL.md | **commit with the pointer** — dangling ref is a broken link for future sessions |
| Real content | scripts, tests, task briefs, plans, design docs | commit |
| Noise | empty files (0 bytes), stray symlinks, `__pycache__/`, `.backups/` | `rm` |
| Scratch / concept dir | untracked `design-concepts/` with no product value | Design concepts belong in tracked `design/concepts/` (README convention); dead explorations are **deleted**, never gitignored |

Check for dangling references explicitly:

```bash
# every reference file a committed SKILL.md points at must exist in git
grep -roE 'references/[a-z0-9-]+\.md' .hermes/skills --include=SKILL.md \
  | sed 's/.*://' | sort -u \
  | while read r; do git ls-files --error-unmatch "$r" >/dev/null 2>&1 \
      || echo "DANGLING: $r"; done
```

## 2. Branch cleanup — audit before delete

"Clean up if there's nothing valuable" is conditional. Probe first:

```bash
git rev-list --count main..<branch>        # 0 = fully merged → safe to delete
git diff --stat main...<branch> | tail -8  # 3000+ insertions = a real feature → KEEP
git worktree list                          # branch may be checked out in a worktree
git log --oneline main..<branch>           # what it actually contains
```

Rules that held:
- Empty-pointer branches (tip == a commit already in main, e.g. `factory/test-batch-*`
  all at `f360ad9`): delete.
- Fully merged branches (`fix/*`, `spike/*`, `feat/110-*` after `merge --no-ff`):
  delete.
- Branches with unmerged real work (`feat/3-checkout-stripe-e2e`, 4 commits,
  ~3000 lines): KEEP and say why. Do not delete on "cleanup" without the audit.
- Detached-HEAD worktree: `git merge-base --is-ancestor <HEAD> main` + clean
  `git status` inside the worktree = redundant → `git worktree remove --force`.

## 3. Stash classification

```bash
git stash list
```

- **lint-staged automatic backups** (`stash@{n}: lint-staged automatic backup`):
  transient snapshots of the pre-commit tree, usually superseded by the commits
  they backed. Verify `git diff --stat main <stash>^{tree}` is mostly negative
  (stash is BEHIND main), then `git stash drop`. Same file set twice minutes
  apart = same snapshot class.
- **Named manual stash** (`stash push -m "..."`): real work. Apply, review,
  resolve, commit, then drop. Indexes shift after each drop — re-list before
  the next drop.

## 4. Consolidation sequence that worked (2026-08-13)

1. Map topology FIRST: `git branch -a`, `git worktree list`, `git log --oneline -1 main origin/main`
   — stale local main is common (local behind origin after a push from another branch).
2. Park dirty work: `git stash push -m "named"` (includes untracked with `-u` if needed).
3. `git checkout main && git merge --ff-only origin/main`.
4. `git merge --ff-only <fix-branch>` then `git merge --no-ff <feature-branch>`.
5. Resolve conflicts by INTENT: complementary changes to one file (both branches
   added features) → take BOTH, not one side. Reconstruct the merged file, verify
   syntax, then stage.
6. Regenerate generated artifacts AFTER the merge: checksums
   (`python3 scripts/generate-checksums.py > scripts/.vulpy-security-checksums`),
   lockfile (`pnpm install --lockfile-only`).
7. Verify: lint + typecheck + relevant tests; then push.
8. Branch cleanup with the audit above.

## 5. Husky/pnpm environment quirks (not bugs — setup)

- Husky hooks need `pnpm` on PATH: `mkdir -p /tmp/pnpm-shim && printf '#!/bin/sh\nexec /usr/bin/corepack pnpm "$@"\n' > /tmp/pnpm-shim/pnpm && chmod +x /tmp/pnpm-shim/pnpm && export PATH="/tmp/pnpm-shim:$PATH"`
- Root-owned `.turbo` (mount point, can't chown inside container): `export TURBO_CACHE_DIR=/tmp/turbo-cache` for the hook run.
- These are container-PATH workarounds, not repo defects — hooks must run, not be bypassed with --no-verify.
