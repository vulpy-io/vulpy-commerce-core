# Atomic Commits & Revert Safety

## The Problem

Accumulating dozens of unrelated changes and committing them in one batch
("junk drawer commit") creates a revert hazard: if any part needs undoing,
you lose everything. User will ask you to split or revert, and the
recovery is expensive.

## Rules

1. **Commit after each verified logical unit.** One commit per concern:
   - Tokens/design pipeline
   - Font/typography changes
   - Component fixes (all related component patches together)
   - Infrastructure (Docker, entrypoint, checksums)
   - Skills/docs
   - Factory meta (briefs, ledgers)

2. **Never stage 100+ files without asking yourself "is this one thing?"**
   If the `--shortstat` shows 700+ files, something is wrong.

3. **Keep Impeccable/scaffold duplicates out of the repo.** The 5× duplication
   across `.agents/`, `.claude/`, `.cursor/`, `.github/skills/`, `.codex/`
   is 600+ files of identical content. Don't commit them.

4. **`.curator_backups/` and `__pycache__` never get committed.**

## Recovery: Selective Restore from Dead Commits

When a commit has been reverted/reset but contained useful changes mixed
with junk:

```bash
# Don't soft-reset and try to re-stage — it's confusing.
# Instead, cherry-pick specific files from the dead commit:
git checkout <dead-sha> -- path/to/file1 path/to/file2 path/to/dir/

# Then stage and commit in logical groups.
```

This is cleaner than `git revert --no-commit` + `git reset HEAD` gymnastics
which can lose track of what's modified vs deleted vs new.

## Verification After Each Commit

After each commit, the working tree should be clean (`git status` shows
only intentionally-untracked files). If typecheck/build was passing before
the commit, it should still pass after — because you verified before
committing (per the main skill).
