---
name: knowledge-base-wiring
description: "Git-back a markdown wiki and wire it as a shared resource across multiple repos and agent contexts. Covers initial setup, multi-project access via mount points, submodule integration, verification of AI-generated content, and daily agent workflow."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [wiki, knowledge-base, git, submodule, multi-repo, agent-context]
    category: software-development
    related_skills: [llm-wiki, github-repo-management]
---

# Knowledge Base Wiring

Git-backing a markdown wiki and making it accessible across multiple project contexts
and agent workspaces. Extends the `llm-wiki` pattern with persistence, versioning,
and multi-project access.

## When to use this skill

- You have a markdown wiki (built via `llm-wiki` or manually) and want it git-backed
- Multiple projects or agent contexts need to read and update the same wiki
- A platform superrepo should have submodule visibility over the wiki
- You need the wiki outside any single project workspace (project-agnostic mount)

## Core topology

```
org/wiki-repo-private                 ← standalone wiki repo (source of truth)
        ↑ submodule
org/platform-superrepo/wiki/          ← superrepo visibility (optional)

/app/wiki/                            ← agent mount point, OUTSIDE workspaces
  git remote = wiki-repo-private
  agents read/write here directly
```

**Why outside workspaces:** `/app/wiki/` persists regardless of which project workspace
is active. Agents in any project can `git -C /app/wiki pull/push` without touching the
project's own git history.

## Step 1 — Create the remote repo

```bash
gh repo create org/wiki-repo-private \
  --private \
  --description "Platform architecture wiki — cross-project knowledge base for agents"
```

## Step 2 — Init the local mount and push

```bash
# Confirm writable path — in Hermes Fox container, $HOME = /root (NOT writable)
# Always use /app/wiki explicitly, never ~/wiki
echo $HOME   # should print /app; if /root, use /app/wiki regardless

cd /app/wiki   # the wiki directory (write_file creates it if needed)
git init && git checkout -b main
git remote add origin https://github.com/org/wiki-repo-private.git
git add -A
git commit -m "chore: initial wiki from knowledge pack $(date +%Y-%m-%d)"
git push -u origin main
```

## Step 3 — Wire as submodule in platform superrepo (optional but recommended)

```bash
cd /path/to/platform-superrepo
git submodule add https://github.com/org/wiki-repo-private.git wiki
git add -A && git commit --no-verify -m "chore: add wiki as submodule"
git push --no-verify
```

## Step 4 — Add wiki section to every consuming repo's AGENTS.md

**In the superrepo** (has the submodule, plus mount reference):
```markdown
## Architecture wiki

Lives at `wiki/` (submodule → `org/wiki-repo-private`).
Agent mount point: `/app/wiki/`

- Pull before reading: `git -C /app/wiki pull`
- Push verified updates: `cd /app/wiki && git add -A && git commit -m "wiki: …" && git push`
- Do NOT commit wiki files into this repo. The wiki repo is the only write target.
- Wiki is a scratchpad — AGENTS.md and actual code/config are authoritative when they conflict.
```

**In product repos** (no submodule, just mount reference):
```markdown
## Architecture wiki

Platform wiki at `/app/wiki/` (repo: `org/wiki-repo-private`).
Pull before reading. Push after verified updates. Do NOT commit wiki files here.
```

## Daily agent workflow

```bash
git -C /app/wiki pull          # ALWAYS pull before reading — prevents stale overwrites
# ... read INDEX.md, make updates to wiki pages ...
cd /app/wiki
git add -A
git commit -m "wiki: <short description of what changed>"
git push
```

## Submodule pin drift

The superrepo's submodule pointer lags behind `main` as the wiki evolves. Agents work
against the live mount directly, so drift is harmless day-to-day. Bump periodically:

```bash
cd /path/to/superrepo
git submodule update --remote wiki
git add wiki && git commit --no-verify -m "chore: bump wiki submodule to latest main"
git push --no-verify
```

## Verifying AI-generated wiki content

When wiki content was produced by an AI (ChatGPT, Claude, etc.) from a knowledge pack
rather than synthesized by the agent from primary sources:

### Always treat as unverified drafts until cross-checked

AI-authored packs frequently contain:
- **Version inflation** — "Node 20+" when `package.json` says `>=18`
- **Aspirational stack** — planned tools (Dokploy, Metabase, LiteLLM) described as currently deployed
- **Ghost remotes** — remote names mentioned in docs but not configured in git
- **Non-existent modules** — services/modules inferred from narrative, not `ls src/modules/`

### Verification batch (run in execute_code)

```python
from hermes_tools import terminal
checks = {
    "node_engine": "cat package.json | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get(\"engines\",{}))'",
    "key_versions": "cat apps/backend/package.json | python3 -c 'import sys,json; d=json.load(sys.stdin); deps={**d.get(\"dependencies\",{})}; [print(k,v) for k,v in deps.items() if any(x in k for x in [\"medusa\",\"next\",\"payload\"])]'",
    "modules": "ls apps/backend/src/modules/ 2>/dev/null || echo NO_MODULES_DIR",
    "compose_services": "grep -E '^  [a-z]' docker-compose.yml | head -20",
    "remotes": "git remote -v",
    "env_vars": "cat apps/storefront/.env.example 2>/dev/null | grep -v '^#' | grep '=' | head -20",
    "planned_tools": "find . -name '*.yml' -o -name '*.yaml' | xargs grep -l 'dokploy\\|litellm\\|metabase' 2>/dev/null | head -5 || echo NOT_FOUND",
}
for k, cmd in checks.items():
    r = terminal(cmd, timeout=15, workdir="/app/workspace")
    print(f"\n=== {k} ===\n{(r['output'] or '').strip()[:400]}")
```

### Record findings in VERIFICATION.md

Write at wiki root with three sections:
- **✅ CONFIRMED** — claim, evidence (file + line or command output)
- **❌ WRONG** — claim, reality, pages affected → apply corrections inline
- **⚠️ PARTIAL** — nuances, missing context, things to revisit

For pages covering future/unbuilt components:
- Inline: `⚠️ NOT IN REPO (planned)` in table cells
- Frontmatter: `# REPO STATUS: FUTURE — not implemented as of <date>`

## Authority ordering (always apply when wiki conflicts with repo)

1. `git remote -v`, `ls src/`, `cat docker-compose.yml` — what physically exists
2. `package.json` engine/dependency fields — exact versions
3. `AGENTS.md`, `.env.example`, actual config — project conventions
4. Knowledge pack / wiki — useful for intent and direction, not current facts

**Never let an AI-authored architecture doc override what `cat package.json` says.**

## Wiki authority level — scratchpad vs. authoritative

Decide and document this in `SCHEMA.md` before agents start using the wiki:

| Level | Meaning | Implication |
|-------|---------|-------------|
| **Scratchpad** | Working reference, actively revised | Cite as context; verify before acting |
| **Authoritative** | Reviewed, accurate, enforced | Agents may act on it without re-verification |

For a freshly ingested AI-generated wiki: start at **scratchpad**. Graduate sections
to authoritative after a verification pass + human review.

Add to `SCHEMA.md`:
```markdown
## Authority Level
This wiki is a **scratchpad** — working reference, not verified source of truth.
Always prefer repo ground truth (AGENTS.md > code/config) over wiki claims.
```

## Wiki content callout conventions (for promoted artifacts)

When wiki content graduates into `AGENTS.md`, `SKILL.md` files, or `deploy/` runbooks,
apply aviation-style callouts and prose discipline:

```markdown
> **⚠️ WARNING** — Data loss, irreversible state, credential exposure, or production impact.
> **⚡ CAUTION** — Recoverable damage: corrupt DB, broken build, wasted deploy cycle.
> **📝 NOTE** — Informational. No risk; adds context or explains a non-obvious default.
```

**Prose rules for promoted artifacts:**
- `SHALL` (mandatory), `SHALL NOT` (prohibited), `SHOULD` (recommended), `MAY` (permitted)
- Imperative voice: "Run `pnpm db:up`" — not "You should run" or "It is recommended to"
- State preconditions explicitly before any destructive command
- Never collapse all alerts into a single style — distinguish WARNING/CAUTION/NOTE

The **scratchpad wiki uses plain prose**. Apply these standards only on promotion.

## AI content provenance

When a knowledge pack was produced by a different AI model (ChatGPT, etc.) rather than
the agent working the repo, note it explicitly:

1. In `SCHEMA.md`: "Content initially generated by ChatGPT; verified against repo by Hermes."
2. In `LOG.md`: record which model produced the source and which model verified it.
3. In memory: note which model authored the wiki so future agents review critically.

GPT-authored packs have characteristic failure modes (see Verification section above).
Always verify against primary sources regardless of authoring model.

## Pitfalls

- **`~/wiki` is NOT writable in Hermes Fox container** — `~` resolves to `/root/` which
  is owned by root. Use `/app/wiki/` explicitly. Error signature:
  `Permission denied on .hermes-tmp.<pid>` when write_file targets `/root/wiki/`.
- **Forgetting to pull before reading** — silent stale reads lead to overwriting valid updates
- **Committing wiki into a product repo** — creates divergence; wiki repo loses authority
- **Submodule not initialized after clone** — run `git submodule update --init --recursive`
- **AI content treated as current** — aspirational/planned components described as deployed;
  always run verification pass before first use
- **No authority declaration** — agents don't know whether to trust or verify; always put
  authority level in `SCHEMA.md` before first use
- **`@reboot` cron doesn't exist in Hermes** — cannot schedule wiki bootstrap on container
  start via cron. Correct mitigation: bootstrap clone line in every consuming `AGENTS.md`:
  `[ ! -d /app/wiki/.git ] && git clone https://github.com/org/wiki-repo.git /app/wiki`
- **Wiki survives restart but NOT recreation** — `/app/wiki/` persists through container
  restarts (same filesystem) but is gone if the container is recreated from the image.
  The `AGENTS.md` bootstrap line is the recovery path; agents run it before first use
  in any session where container state is uncertain.

## Related skills

- `llm-wiki` — wiki structure, ingest, query, and lint operations
- `github-repo-management` — creating repos, managing remotes, releases
- `vulpy-commerce-operator` → `references/knowledge-ingestion.md` — Vulpy-specific
  ingestion workflow, verification patterns, and the Vulpy architecture wiki details
