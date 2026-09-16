# Controller Acceptance Gate Over Delegated Repair Rounds

Session-proven loop from a multi-round blocked issue (#74 RunClient): three repair rounds,
two rejections, acceptance only after the full shard matrix. This is the operational playbook
for reviewing subagent-delivered TDD work when the same issue loops.

## Verify disk state after every batch — including failed ones

Subagents run under hard tool-iteration limits and shared API rate limits. A batch can:

- complete honestly but partially (integration done, verification matrix not);
- fail with HTTP 429 after retries and return no usable result — while still having modified
  files on disk (a repair batch modified `static/run_client.js` before dying).

Controller rule: after EVERY delegation batch, run `git status --short` + `git diff --stat`
in the artifact checkout before reading the summary's claims. The summary is a self-report;
disk state is truth. When a batch fails mid-write, the modified files are still candidates
for review — do not discard or blindly trust them.

## File-mutation-verifier warnings are failure signals

Subagent summaries include a verifier line: "N file(s) were NOT modified this turn despite
any wording above that may suggest otherwise." When present, the listed patches silently
failed (old_string mismatch). Re-read the file; the claimed change did not land. Do not
plan the next round on the assumption that those edits exist.

## Budget repair rounds, hand exact deltas

Observed pattern: round 1 integration completes but stops before verification; round 2
finishes migrations but not the ledger; round 3 hits the rate limit. Each re-delegation
should carry the EXACT remaining delta (collection errors to fix, modules left, ledger
requirement, shard evidence needed) rather than re-issuing the full original brief. State
explicitly that partial completion is expected and what the minimum deliverable is.

## Subagent tool-limit: finish locally, don't re-dispatch

When a subagent hits the 50-call limit with X/N gates passing and only cleanup remaining
(GREEN log not captured, ledger not written, closing comment not posted), the fastest path
is for the **controller to finish directly**:

1. Read the full subagent summary from `/data/data/hermes/cache/delegation/subagent-summary-*.txt`.
2. Independently re-run the full test suite to confirm the claimed pass count.
3. Capture any missing artifact (GREEN log, ledger, evidence file) via `write_file`/`terminal`.
4. Post the GitHub acceptance comment and close the issue.

Re-dispatching creates a second agent that duplicates the first's work, posts a duplicate
comment, and wastes ~20 minutes. If the subagent got 36/46 passing and only packaging
files were missing, write those files directly — the passing test run already proved the logic.

## Controller may complete mechanical bits

When the owner keeps exhausting limits, the controller can finish trivial work directly:

- unused-import lint removals in migrated test files (Ruff F401);
- removing an unused local variable (F841);
- rewriting one stale source-shape test as an executable harness.

Do this ONLY for mechanical, behavior-preserving changes, and still run the full
verification matrix (focused → neighbors → browser → static → full shards) yourself
afterward. The controller's own shard rerun after fixing the last changed-path test is
what unlocks acceptance — a passing module run alone is not the gate.

## Focused + browser GREEN is still not acceptance

The binding gate is the full CI-shaped shard matrix (`--num-shards=3 --shard-id=N` with
complete retained logs). Focused tests cannot catch production-path defects: wire-taxonomy
alias drift, missing default validators in production options, control reject-then-retry
lockouts, lifecycle listener leaks, settlement bypass via `autoSettle:false`. Two
independent reviewers reproduced false-greens that the submitted focused suite missed.

For each shard, record: passed/skipped/xfailed totals, the failure list, and the
classification of every failure (changed-path vs baseline-identical #91-style environment
defect). Only baseline-identical defects may remain; they must be enumerated per shard,
not waved away.

## Clean-baseline classification is the acceptance prerequisite

Every remaining failure is compared against a clean pinned-SHA checkout run under the SAME
wrapper/Python. If the clean baseline reproduces identical results, the failure is
environmental, track it in the existing issue tracker, and exclude it explicitly. Do not
modify unrelated product code to make such tests pass.

## Ledger refresh is part of the deliverable

Repair rounds must update the TDD ledger with fresh RED artifacts, the overlap RED→GREEN,
compatibility RED→GREEN, exact commands/totals, and honest exclusions. A stale
pre-repair ledger was rejected as evidence; the controller rewrote it from preserved
artifacts. If the ledger is stale, refresh it from `.artifacts/` evidence before posting
acceptance.

## Regression-guard tests vs TDD RED→GREEN: classify honestly

When tests are written *after* the production fix is already in place (added as regression
guards for behaviour already present in a prior issue), they cannot have a genuine RED phase.
**This is not a TDD violation — it is a different test category.** Classify them honestly
in the ledger:

| Category | RED phase | Description |
|---|---|---|
| TDD RED→GREEN | ✅ Required | Test written before production code; must fail first |
| Regression guard | ❌ No RED possible | Tests existing, already-correct behaviour from a prior issue |

Document regression-guard tests explicitly: "Tests the `owner.seen` deduplication barrier
added in #74; no pre-#74 RED is possible because the fix predates this test module."

**Harness wiring pitfall:** If `MODULE` / `RUN_CLIENT_PATH` is hardcoded in the test file
(not parameterised), every "RED against stub" run silently loads production code. Verify
the harness actually loads the stub before claiming RED log output. Symptom: scenarios
"fail against stub" with the wrong error (production code returning data instead of stub
raising), or unexpectedly "pass" against the stub.

## Prove pre-existing flakes in the isolated worktree

A browser gate flake (e.g. `mock Gateway did not reach the live activity checkpoint;
request body: None; events: []`) was proven pre-existing by reproducing it in the isolated
overlap worktree BEFORE integration. Method: when a scenario flakes, run the same scenario
in a pre-integration copy of the artifact; if it flakes identically there, the failure is
environment/startup, not the change. Record the flake, the isolated reproduction, and the
immediate rerun that passed.

## Acceptance decision loop (concrete)

1. Batch arrives → read full summary from cache → `git status`/`diff` → run focused + changed-path modules → record.
2. Dispatch adversarial implementation + test-evidence reviewers; convert every reproduced
   finding into fresh behavioral RED before fixes.
3. Repair round → rerun focused, browser scenarios, overlap ×3 → run full shards.
4. Any changed-path failure or collection error → reject with exact logs and the specific
   remaining delta (not a generic "fix it").
5. When the only failures left are baseline-identical environment defects → accept, post
   the evidence table (focused totals, browser runs, per-shard totals, exclusions) to the
   issue, and only then advance dependent issues.

## Controller commands that produced acceptance

```bash
# disk state after any batch
git status --short && git diff --stat && git diff --check

# changed-path modules (collection + behavior)
HERMES_WEBUI_TEST_PYTHON=/usr/local/bin/python3.11 ./scripts/test.sh -q <module...>

# browser gates (sequential; each ~40-90s)
LIFECYCLE_SCENARIO=normal /usr/local/bin/python3.11 tests/browser_conversation_lifecycle.py
LIFECYCLE_SCENARIO=disconnect-reattach /usr/local/bin/python3.11 tests/browser_conversation_lifecycle.py
LIFECYCLE_SCENARIO=active-replay-overlap /usr/local/bin/python3.11 tests/browser_conversation_lifecycle.py  # x3

# static gates
node --check <all changed js + harness js>
.venv/bin/ruff check <all changed test modules>
/usr/local/bin/python3.11 -m py_compile <changed py>

# full CI-shaped shards (background, notify_on_complete, tee logs)
HERMES_WEBUI_TEST_PYTHON=/usr/local/bin/python3.11 ./scripts/test.sh tests/ -q --tb=short --timeout=60 --num-shards=3 --shard-id={0,1,2}

# read full subagent summary (always do this before acting on a batch result)
read_file("/data/data/hermes/cache/delegation/subagent-summary-N-<timestamp>.txt")
```
