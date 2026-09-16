---
name: repository-hygiene
description: Review dirty Git worktrees, classify durable source versus generated/runtime artifacts, repair ignore rules, and split commits by coherent concern. Use before staging, committing, or proposing a commit plan for a monorepo.
---

# Repository Hygiene

Use this skill before staging a dirty checkout. The goal is a reviewable repository, not a snapshot of everything currently on disk.

## Workflow

1. Inspect branch state and the complete worktree:
   - `git status --short --branch`
   - `git status --short --untracked-files=all`
   - `git diff --stat` and `git diff --name-status`
2. Classify each path as durable source, intentional documentation, generated output, runtime state, temporary evidence, or an external/nested repository.
3. Check existing rules with `git check-ignore -v <path>`. Do not infer that a path is ignored merely because a similar filename is.
4. Repair `.gitignore` with the narrowest lifecycle rule. Re-run status and ignore checks after editing.
5. Propose commit groups by coherent purpose. Never blanket-stage a dirty monorepo.

## Runtime-artifact defaults

Do not track generated or live runtime state unless the operator explicitly requests an artifact snapshot:

- `.agent/` — generated context, status, and access-mode/session files.
- `.copilot/`, `.local/share/code-server/`, `.config/code-server/`, and tool-specific device caches — generated editor/agent runtime state; ignore them unless a deliberate reproducible config is being versioned.
- `.design-specs/` — disposable design mockups and screenshot previews; preserve only when explicitly requested as a historical design artifact.
- `agent-cmds/req/` and `agent-cmds/resp/` — runtime IPC mailboxes. Keep only `.gitkeep` files when directory shape must survive a clone.
- Environment files, databases, logs, caches, build output, and request/response payloads remain untracked.

Use directory-wide rules for mailboxes; suffix-specific rules are brittle because runtime payloads may be timestamped `.json` or use another extension:

```gitignore
.agent/
.design-specs/
agent-cmds/req/*
!agent-cmds/req/.gitkeep
agent-cmds/resp/*
!agent-cmds/resp/.gitkeep
```

## Hermes and operator workfiles

For Vulpy Commerce checkouts, keep `.hermes/` limited to distributable agent contracts (`SOUL.md`, `ARCHITECTURE.md`, `fox-persona.md`) and `skills/`. Move disposable plans, briefs, handoffs, reviews, release scratch, factory coordination state, generated store state and any other working files under ignored `.work/`. If the operator wants to preserve the current material, snapshot it in Git first, then move it; update active dispatch and sync paths so the relocation does not silently break workflows.

Treat nested repositories (for example `.hermes/fox-landing`) independently: inspect their own status, commit only the migration file when mixed with unrelated dirty work, and update the parent gitlink deliberately. Never blanket-stage the nested repository.

Payload media and Fox uploads are runtime data, not source: keep `apps/storefront/media/`, `.data/<instance>/payload-media`, session upload inboxes, and generated media out of Git.



- product/runtime behavior;
- deployment or operational scripts;
- skill/library knowledge;
- durable plans, briefs, and handoffs;
- `.gitignore` and repository hygiene.

Do not commit dirty nested repositories or gitlinks without verifying their own status and confirming the pointer change is intentional. Do not include generated previews merely because they are useful during the current task.

## Mass worktree triage

When a repo accumulates dozens of worktrees from parallel factory work, classify before pruning:

1. `git branch --merged main` → safe to delete (branch + worktree dir + `git worktree prune`).
2. For unmerged branches, measure `git rev-list --count main..<branch>`. Ahead=0 means absorbed (squash-merged or cherry-picked) — also safe to delete.
3. For branches with unique commits, check cross-branch absorption with `git merge-base --is-ancestor` to find superset/subset pairs.
4. Locked ephemeral worktrees (e.g. `hermes/*`): `git worktree remove --force <path>`, then prune.

See `commerce-edition-release-planning` skill for the full release-oriented triage methodology and a worked 88-worktree example.

## Verification gate

Before reporting the checkout as clean or commit-ready, verify:

```bash
git status --short --untracked-files=all
git check-ignore -v <representative-runtime-file>
git diff --check
```

Report anything intentionally left out and why. Never claim a file is ignored or commit-ready without command output confirming it.
