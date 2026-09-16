---
name: verification-before-completion
description: "Use when you are about to claim that work is complete, fixed, or passing, before you commit or create PRs. Run verification commands and confirm their output before you make any success claim. Put evidence before claims, always."
---

# Verification Before Completion

## Overview

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Agent dispatch returned | Poll within 30s: output + worktree diff exist | Process exit code 0 and "looks like it started" |
| Requirements met | Line-by-line checklist | Tests passing |
| Font/CSS change works | typecheck + build + curl homepage | Design token tests pass, dev server HMR works |
| Design system adoption done | typecheck + build + runtime probe | Token pipeline passes, design:check clean |
| Script/guard wired up | Run the script, confirm output files exist | Code written and committed |

## Storefront-Specific Verification Ladder

When changing storefront code (fonts, CSS, tokens, layout, imports):

```
1. Token pipeline:   node scripts/design/generate-design.mjs --check
2. Design tests:     node --test scripts/design/*.test.mjs
3. TypeScript:       pnpm --filter @apps/storefront typecheck
4. Production build: pnpm --filter @apps/storefront build
5. Runtime probe:    curl -s --connect-timeout 5 http://host.docker.internal:3000 | head -3
```

**Critical trap:** Turbopack dev server is MORE LENIENT than `tsc` and `next build`.
A change can appear to work in the browser (HMR success) while typecheck and
production build both fail. The dev server running ≠ the storefront is healthy.
Always run steps 3-4 after any import, type, or config change.

**Served-output verification (the "I see old layout" trap, 2026-08-19):** when
the operator reports they still see the OLD UI, source + tests being green is NOT
evidence the dev server serves the fix. Turbopack dev can keep serving stale
compiled chunks after merges, interrupted restarts, or wedged boots. Verify the
SERVED artifact, not just the source:

```bash
curl -s http://host.docker.internal:3000/checkout -o /tmp/p.html
grep -o 'chunks/[^"]*' /tmp/p.html | sort -u          # find the component chunk
curl -s http://host.docker.internal:3000/_next/static/chunks/<chunk> -o /tmp/c.js
grep -c '<distinctive-new-marker>' /tmp/c.js           # string only new code introduces
```

Pick a distinctive marker from the new code (constant name like `US_STATES`,
new label text, new helper import). For layout changes, verify component ORDER
in the compiled chunk by class sequence (`max-w-[670px]` before `max-w-[455px]`)
or compiled JSX call order — raw string positions are module definitions, not
render order. If the marker is missing, dev serves stale chunks: full stop,
clear `.next`, wake — do NOT keep debugging the e2e harness against stale code.

**Operator-browser testing beats harness plumbing (order of operations):** when
the operator tests manually in their own browser and supplies HAR exports, treat
their report as the ground-truth symptom. Confirm the fix is live on the dev
server FIRST (served chunk markers + curl the route), then invest in Playwright
harness/proxy work. Burning turns on harness infrastructure while the operator
still sees the old UI is the exact failure mode that produced "have you actually
fixed the issues before firing tests? I see old layout" (2026-08-19).

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting work over
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ excuse |
| "Partial check is enough" | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Hidden-UI regressions:**
- Assert the rendered, user-visible control boundary—not merely that an internal JavaScript helper name is absent. A landing page can intentionally retain a reusable `checkout()` helper while omitting the checkout form, cards, and buttons.
- Pair positive assertions for the intended entry point with negative assertions for concrete rendered markers such as `id="checkout-form"`, card headings, or CTA text. This proves the UI is hidden without rejecting safe dormant code.
- When a backend webhook remains supported while its UI is removed, test the settlement path separately and state the UI/API distinction in the completion report.

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## Inferred Status Is Not Verified Status (2026-09-10)

The Iron Law applies to **status reports**, not just completion claims. Sampling a
weak signal and narrating a confident state is lying with extra steps.

Real failure this session: a coder subprocess was reported as "still running",
then "planning phase", then "stalled" — all inferred from `ps` CPU%. All three
were guesses. The operator: *"Is coder really running? I'm tired of these guesses,
we need to find a better way."*

**Rule: if you did not read a purpose-built status source, say "unknown", not a
state.** Before narrating any status, name the source you would trust, then read
it.

| Weak signal (inference) | Authoritative source (measurement) |
|---|---|
| `ps` CPU% / `wchan` | the agent's own session DB timestamp |
| "process is alive" | last message epoch + worktree diff |
| proxy metric that moves for other reasons | the counter the system itself maintains |
| "it should be done by now" | the completion notification |

**Corollary — liveness ≠ progress.** A long-lived process can be perfectly alive
and produce nothing. Always pair a liveness reading with an *output* reading
(files changed, rows written, messages beyond recon). Active + zero output for
>10 min is a loop, not progress.

## Ask Whether the Data Source Can Answer the Question (2026-09-10)

Verification also fails when the chosen source is **structurally incapable** of
answering the question. Check the source's granularity before building on it.

This session: a daily CSV was proposed to reconcile per-call costs. It is
**aggregate-only** (one row per day/model/key) — it cannot attribute individual
calls. Chasing it would have produced a confident number with no basis. The
operator cut it off: *"Daily export isn't an option as it aggregates only, find
better solution before trying to fix."*

**Rule: before relying on a source, state its granularity and confirm it matches
the question.** Per-call question → per-call source. If the only available source
is coarser than the question, say so and find a better one BEFORE dispatching a
fix.

**Also check field semantics, not just field presence.** Two cost fields were
recorded under names that inverted their meaning (a provider-side value used as
our sell price), and a presence-only coverage check passed while every row
recorded `null` because the field *name* was wrong for that provider's payload
shape. Verify against a **real captured payload**, not the assumed shape — and
prefer a golden fixture so the assumption is pinned.

**Insist on the verification triad for money/telemetry:** raw provider response +
the gateway's own spend log + the billing ledger, cross-checked to the same
precision. Any single system can be the liar; three agreeing is evidence.

When the operator makes a commit conditional — for example, “run `npm run check`; **if green**, commit” — treat the command's exit status as a hard gate:

1. Run the exact requested command in the stated package/worktree after the repair.
2. Separate component results precisely (for example, typecheck passed but tests failed) without calling the overall command green.
3. If the command exits nonzero, **do not commit, push, or broaden the patch** merely to make unrelated pre-existing partial work pass.
4. Report the exact failing test names/counts, the unchanged HEAD SHA, and the remaining scope gap. Commit only after the operator authorizes the additional scope or the full gate is green.

This avoids incorrectly bundling stale tests or removed behavior into a request explicitly limited to a concrete compile repair.

## Verify DURING, Not Just After

The verification ladder isn't only for end-of-task gates. Run it **after
each structural change** — font swaps, import rewrites, config edits,
token pipeline changes. The dev server (Turbopack/Vite HMR) tolerates
errors that `tsc` and `next build` reject.

**Rule:** If you changed an import, a type, a config file, or a font —
run typecheck + build immediately, before moving to the next file. Don't
batch 10 changes then discover the first one broke the build.

**Commit atomically:** After each verified change lands clean, commit it.
Never accumulate dozens of unrelated changes into one giant commit — if
you need to revert one thing you lose everything. Logical commits:
tokens, fonts, docs, infra, components — each gets its own commit with
a focused message.

## Security-Gated Script Changes

When changing a script covered by a repository checksum manifest or startup
integrity gate, verification must include the repository-documented regeneration
command before claiming the bridge is usable:

1. Inspect repository instructions and identify the exact checksum command; do
   not hand-edit hashes.
2. Make the source change, then regenerate the manifest in the same worktree.
3. Run syntax/static checks against changed scripts and compare a fresh
   regeneration against the manifest (`diff` must be empty).
4. For a command-bridge allowlist addition, assert directly that the command has
   the exact fixed argv required by the brief, is classified as mutating when
   required, and is absent from parametric builders when no request arguments
   are allowed. Check the user-facing/module documentation too. Prefer
   source-level AST/text assertions that do not import a daemon with
   host/container startup guards; if using AST, handle annotated assignments
   (`ast.AnnAssign`) and expressions that reference constants instead of
   assuming every value is directly literal-evaluable.
5. Never invoke a destructive bridge command merely to test registration. Use
   static dispatch assertions and the nearest existing handler suite when
   actual execution is prohibited.
6. Commit only scoped source, documentation, and regenerated manifest files;
   leave unrelated dirty-tree changes untouched, and verify final status after
   committing.

## Raw-Evidence Reporting for Operator-Requested Gates

When the operator explicitly requests raw command outputs, preserve the command and output verbatim in the final report. Report every gate independently, including blocked commands and exact exit status; do not replace raw evidence with a paraphrase such as “passed.” A focused substitute is additional evidence, not satisfaction of a requested package-wide gate.

If an environment wrapper later marks the workspace unverified, run fresh verification in the current turn before making any completion claim. If the requested package runner is unavailable, report the exact blocker and run the narrowest available checks without implying the full gate passed.

## When To Apply

**ALWAYS before:**
- ANY variation of success/completion claims
- ANY expression of satisfaction
- ANY positive statement about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion/correctness

## Marker-Owned Patcher Upgrades

For an installer or patcher that writes files with an ownership/idempotency marker, treat a new feature as a **migration**, not merely a fresh-install change:

1. Construct a fixture representing the last shipped marker-owned version (for example, an older generated module and an older static tool list).
2. Run the current patcher and assert it upgrades every marker-owned artifact to the current canonical content.
3. Re-run it and assert byte-for-byte idempotence plus the expected no-op messages.
4. Keep the safety boundary explicit: files without the marker must still be refused or protected by strict unique anchors; never make a broader overwrite merely to enable the upgrade.
5. If a marker-owned file has an unexpected shape, fail loudly rather than treating its marker alone as proof that the new feature is present.

A current-install test is insufficient: a marker often causes an old patcher to no-op, so the regression is only exposed by a prior-version fixture. Run the focused patcher test after the final commit as well as before it.

## Vendor Overlays and Static Brand Assets

When branding is owned by an overlay rather than a vendor fork, verification must cover the installation boundary as well as the source files:

1. Verify source-of-truth hashes and generated raster/container dimensions.
2. Exercise the real shared installer with the overlay enabled and disabled.
3. Apply the existing patch series and branding step, in production order, to the exact pinned upstream version.
4. Run the branding step twice to prove idempotency and strict anchor behavior.
5. Search all browser-title writers and preserve prefixes, relative paths, manifest scope, and in-app identity.
6. Syntax-check the actually patched upstream JS/Python/JSON, not only the overlay helper.
7. Keep focused-test evidence separate from broad-suite failures caused by checkout/submodule/version mismatches.

See `references/vendor-overlay-branding-verification.md` for the detailed implementation and verification recipe.

## Did the Work Land? (VCS Evidence for Agent Output)

A clean worktree + "agent reported success" prove nothing about whether delegated
work is committed or lost. When auditing whether a task's output survived (branch
rebase, worktree recreation, crash, session death):

**Coder hallucination warning (2026-08-20):** A coder that exits 0 may produce
a detailed summary of changes "implemented" — complete with file paths, function
names, and test counts — that NEVER actually ran any write tool. The summary is
pure invention. The worktree is clean, HEAD matches main, zero files touched.
This happens when the model alias degrades mid-response and auto-generates a
closing summary instead of continuing to produce real tool calls.

Detection sequence (mandatory before accepting any coder result):

```bash
# STEP 1: Did the worktree actually get touched?
cd /data/state/worktrees/wt-<task>
git status --short                           # empty = no files touched
git log --oneline -1                         # check if HEAD differs from main
git diff --stat main..HEAD                   # real diff, not reported diff

# STEP 2: Did key files change? Use file-touch probe:
git log --oneline -1 -- <key-file-path>
# Empty output = the branch never committed the change — not even close

# STEP 3: Feature marker in the tree right now?
grep -rn '<feature-unique-string>' <src-dir> | head -3
```

If steps 1–3 all return empty, the coder produced ZERO output. Do NOT accept
the summary. Do NOT re-dispatch without checking provider health first.

Then:
2. **Feature-marker search:** `git log --all -S '<feature-flag-or-unique-string>'`
   — find the commit that introduced the feature. `-S` matches count changes, so
   plan/brief mentions also hit; confirm real implementation separately (step 3).
3. **Tree probe:** `grep -rn '<flag>' <src-dir>` — is the feature actually present
   in the checked-out tree right now?
4. **Path-relativity trap:** `git show --stat` paths are repo-root-relative. Before
   declaring files "missing", `ls` the path exactly as printed — `e2e/checkout/` at
   repo root is NOT under `apps/storefront/`. A wrong-path probe produces a false
   "lost work" conclusion.
5. **Branch relationship:** `git rev-list --count origin/main..<branch>` plus
   `git worktree list` — ahead/behind and which worktree holds uncommitted state.

Only when 1–3 agree (committed AND present in tree) may you claim the work landed.
If a clean worktree lacks the feature marker, uncommitted work was likely lost in a
worktree recreation — recoverable from the delegating profile's session DB
(write_file/patch trail; see factory-ops `references/session-db-file-recovery.md`).
Report the actual state; do not paper over it with "done".

## Scoping an Unmerged Branch for Merge (trial-merge recipe)

"Agent reported it's all done" on a feature branch is a claim about code that
may never have left the worktree. Before reporting merge readiness — or scaring
the operator with a diff — run these checks (used 2026-08-18 on the checkout
epic branch, 12 commits, local-only, no PR):

1. **Is it even merged/pushed?**
   - `git merge-base --is-ancestor <tip> main` → exit 0 = already in main
   - `git branch -r --contains <tip>` → empty = NOT pushed to origin
   - `gh pr list --repo <repo> --head <branch>` → empty = no PR exists
   A branch checked out in a linked worktree shows a `+` prefix in
   `git branch -a --contains`.

2. **Never judge scope by a two-dot diff on an old branch.**
   `git diff origin/main..HEAD` mixes the branch's own changes with everything
   main did since the branch point — unrelated migrations (skills/impeccable/
   extension trees) can make an 84-file branch look like 621 files / 130k
   deletions. Branch-only scope is the three-dot diff:
   ```bash
   git merge-base origin/main HEAD | xargs git log -1 --format='%h %ad %s'  # how stale?
   git diff --shortstat origin/main...HEAD                                  # REAL branch scope
   ```

3. **Trial merge without touching the worktree:**
   ```bash
   git merge-tree --write-tree origin/main HEAD
   ```
   Exit 0 = merge is mechanically possible; output lists conflict stages (1/2/3
   blobs) and auto-merged files. No checkout mutation — safe on a dirty
   worktree. Then list the exact conflict candidates (files changed on BOTH
   sides since the merge-base):
   ```bash
   comm -12 <(git diff --name-only origin/main...HEAD | sort) \
            <(git diff --name-only <merge-base> origin/main | sort)
   ```
   If all conflicts are infra/config (CI workflow, package.json, lockfile,
   .gitignore) and zero are feature source, the merge is low-risk.

4. **Did main touch the branch's paths since the branch point?**
   `git log --oneline origin/main -- <feature-dirs>` — if every hit predates
   the merge-base (or none exist), the rebase will be clean for the feature
   surface.

5. **Run the tests in the worktree — don't trust commit messages.**
   If node_modules exist there, run the feature's targeted tests directly
   (`apps/storefront/node_modules/.bin/vitest run <files>`) and report the
   actual pass count. Distinguish "E2E harness exists on disk" from "harness
   has run" — browsers/secrets may be required before it can.

## Worktree State Audits: Untracked Files Are Part of "Clean"

**A worktree is not clean until BOTH tracked and untracked state are accounted for.**

Blind spot that cost a full session (2026-08-13): after every commit the status
sweep used `git status --short | grep -vE "^\?\?"` — which by construction NEVER
looked at untracked files. The committed SKILL.md files referenced reference
files that were sitting uncommitted in `??` the entire time. User reaction:
"why the fuck didn't you commit it earlier?"

**Completion sweep must include untracked files:**

**Operator-specified exclusions override the default classification.** When a task
explicitly says to leave review/task artifacts, generated directories, symlinks,
or other paths uncommitted, inventory and report them but never stage, delete, or
otherwise mutate them. Stage only the named production/test paths (never `git add
.`), then confirm the final status contains only those deliberate exclusions.

**Cleanup-only scope:** If the operator says cleanup only and says siblings will
commit the rest, do not stage, commit, reset, or normalize the broader tree.
Inventory first, then remove only unambiguously disposable artifacts: root-level
research dumps, generated caches/backups, and clearly labeled scratch clones or
worktrees. Preserve source files, plans, skills, tests, scripts, app docs, and
sibling-owned changes even when untracked. Verify both that the named junk is
gone and that no sibling paths were touched; report `commits_created=0`
explicitly. For large ignored directories, inspect their contents and ownership
before recursive deletion—size alone is not a deletion criterion.

```bash
# 1. Full inventory — tracked AND untracked, classified:
git status --short
# 2. For each `??` entry decide: commit / ignore / delete
#    - referenced by a committed file (grep the referencing SKILL.md/config) → commit
#    - real content (scripts, tests, task briefs, plans) → commit
#    - noise (empty files, stray symlinks, __pycache__, .backups/, scratch dirs) → delete
#    - scratch dir with no value (e.g. dead design concept) → delete; live concepts go in tracked design/concepts/
#      ignores so it stops appearing, rather than leaving it untracked forever
# 3. Check reference completeness: any file a committed doc points at MUST be
#    in the same or an earlier commit — never commit the pointer without the target.
```

Commit skill references together with the skills that point at them (same
pattern as committing a source file with its test). A dangling reference in a
committed SKILL.md is a broken link for every future session.

## Reconcile Uncommitted/Stash Work in GROUPS — never bulk-commit (user preference, 2026-08-13)

When a stash or leftover working tree holds many files, the operator wants
them reviewed **one group at a time with per-file verdicts**, not committed in
one sweep. Expressed as: "review 1 by 1 — see if they're relevant", "let me
know which state they're in", "add all that's worth, remove the noise".

Grouping convention (observed working well): skills/docs → storefront →
app-contract → CI/scripts, each with:

1. **Per-file diff summary** (`git diff HEAD -- <file>` filtered to
   `^[+-]` lines) — show what each file actually changes, not just its name.
2. **Verdict per file**: keep (with why) / reject / check-first (e.g. a
   regenerated `payload-types.ts` must be diffed against the CURRENT config
   before trusting it).
3. **Commit per group** after explicit approval — a group is: one commit,
   focused message, `git add` scoped to that group's files only.
4. For a "commit what's worth, remove the noise" instruction: classify each
   `??`/`M` entry — referenced-by-committed-file → commit; real content
   (scripts/tests/briefs/plans) → commit; noise (empty files, stray symlinks,
   `__pycache__`, `.backups/`, scratch dirs) → delete; live design concepts
   → tracked `design/concepts/` (README convention); dead scratch with no
   product value → delete — never leave it perpetually untracked.

The user's frustration signal for bulk or missed sweeps is direct ("why the
fuck didn't you commit it earlier?") — run the full-worktree audit (above)
at the end of every task, including untracked files, and commit reference
files with their pointers.

## Branch/Worktree Cleanup: Audit Before Delete

"Clean up if there's nothing valuable" is a conditional — check content before
deleting, never delete on name alone:

```bash
git rev-list --count main..<branch>        # 0 = fully merged, safe
git diff --stat main...<branch> | tail     # real content? (thousands of lines = valuable)
git worktree list                          # branches may be checked out elsewhere
git log --oneline main..<branch>           # what the branch actually contains
```

- Fully merged / empty-pointer branches (tip is an ancestor of main, or points
  at a commit already in main): delete.
- Branches with unmerged real work (4 commits / 3000+ lines = a feature, not
  junk): KEEP — hold for review, don't delete because the user said "cleanup".
- Detached-HEAD worktrees: check `git merge-base --is-ancestor <HEAD> main`
  AND `git status` inside the worktree — clean + ancestor = redundant, remove;
  dirty + descendant = real work, keep.
- Stash archaeology: `git stash list` — lint-staged automatic backups are
  transient snapshots of a pre-commit tree, usually superseded; drop them once
  the commits they backed are in main. A named manual stash (`stash push -m`)
  is real work — apply, review, commit, then drop.

## Multi-component feature: "merged" ≠ "working end-to-end" (2026-08-19)

A feature can have all its branches merged, all unit tests green, and the
epic checklist ticked — yet be functionally broken because the components
were never exercised TOGETHER in the real runtime.

**This session's example (multi-env UX):**
- Backend scripts (`env-push.sh`, `verify_approval`) merged + 47 py tests green
- WebUI extension (confirm modal, push/pull buttons) merged + 190 jsdom green
- HMAC signing NEVER wired client-side; confirm requests silently rejected
- Agent context generator never read env state; Fox unaware of environment
- Zero end-to-end integration tests exercising the full chain

**Checklist before claiming a multi-component feature is "done":**

1. [ ] Every component's acceptance criteria met in ISOLATION? (unit tests pass)
2. [ ] Every HTTP/SSE/CLI contract between components exercised TOGETHER?
     - e.g. WebUI button → POST → agent-cmd server → shell script → result
     - NOT: WebUI test uses mocked fetch, shell test runs standalone
3. [ ] Real runtime path verified — not just each tool in isolation?
4. [ ] What does a user SEE and EXPERIENCE? — test that flow in the real app
5. [ ] Operator explicitly confirmed the UX matches the spec? ("it doesn't
       feel right" means not done)

**When you find a gap:** file a child issue, update the epic checklist, and
report it as NOT shipped — don't let merged commits mask unshipped behavior.

## References

- `references/verification-stamped-review-packs.md` — building a verification-stamped review pack for a live platform (CTO/security review): the ✅/🟡/🔴 evidence stamps, "the box is unreachable" as a claim to verify (tailnet vs public-IP trap, correct key), and money-model claims from code+box rather than stale docs.
- `references/worktree-state-audits.md` — untracked-file sweep recipe,
  branch/worktree audit-before-delete, stash classification
