---
name: behavioral-regression-testing
description: Preserve user-visible and lifecycle contracts while refactoring ownership boundaries; replace brittle source-shape checks with executable behavior gates and deterministic integration barriers.
version: 1.3.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [testing, regression, browser, lifecycle, refactoring, tdd]
    related_skills: [test-driven-development, systematic-debugging]
---

# Behavioral Regression Testing

## When to Use

Load this skill when:
- a refactor moves transport, state, or lifecycle ownership behind a new abstraction;
- existing tests inspect source spelling, call placement, or constructors directly;
- browser behavior spans disconnect, replay, settlement, and persisted state;
- a unit-test harness evaluates selected production JavaScript with fake browser APIs;
- a large suite contains a mixture of real regressions, stale harnesses, and environment-only failures.

Use alongside `test-driven-development` for every production behavior change.

## Core Principle

Preserve the contract, not the old spelling.

A test that searches for `new EventSource(...)`, a literal payload expression, or a particular helper call is not equivalent to proving that the browser sends the correct payload, preserves optimistic state, reconnects without loss, or settles ownership correctly. When an ownership refactor invalidates such a test, replace it with an executable gate covering the original behavior. Do not merely make the source search recognize the new spelling.

## Workflow

### 1. Classify before editing

For every failure, record one category:

1. **Behavior regression** — executable output/state violates the contract.
2. **Harness drift** — the harness no longer constructs the real dependency graph.
3. **Source-shape brittleness** — behavior is intact, but the test searches implementation text.
4. **Environment-only** — the same exact test fails in a clean pinned baseline under the same runtime.
5. **Unrelated pre-existing failure** — outside the changed path and independently reproduced.

Do not change production code for categories 2–5 unless separate behavioral evidence demonstrates a product defect.

### 2. Establish a meaningful RED

A valid RED must fail because the promised behavior is absent or violated—not because a scenario selector is unsupported, a mock omitted a newly required dependency, or a substring changed.

For a new end-to-end scenario, it is useful to retain two stages separately:
- **scenario-construction RED**: proves the gate is not implemented yet;
- **behavior RED**: after the harness is valid, proves the product violates the contract.

Only the second justifies production changes.

### 3. Repair ownership-aware harnesses

If production delegates transport/state ownership to a client object:

- load and instantiate the real client in the harness;
- expose all browser APIs the client actually receives (`EventSource`, lifecycle listeners, fetch/timers);
- observe the facade returned to the renderer, not an obsolete direct constructor call;
- drive events through the real listener/deduplication path;
- assert renderer/store outcomes and final ownership state.

A fake native transport alone is insufficient when production now creates it through a lifecycle owner.

### 4. Build deterministic lifecycle gates

Coordinate asynchronous phases with explicit conditions:

1. Server emits accepted pre-disconnect activity.
2. Browser proves prose/reasoning/tool projection and captures accepted event IDs.
3. Browser closes only the transport while run ownership remains active.
4. Server receives an explicit release signal and emits gap events.
5. Test waits for durable server/journal acceptance of those gap events.
6. Reconnect intentionally starts from an earlier cursor to create replay overlap.
7. Browser proves overlap is not duplicated and all gap activity appears exactly once.
8. Server receives an explicit settlement signal.
9. Browser proves one canonical final plus idle/unowned client state.

Polling is acceptable only as a condition barrier (for example, wait until a journal contains named events). Do not use arbitrary product sleeps to manufacture ordering.

Treat protocol acceptance and renderer presentation as separate layers. For replay gates, wait on exact durable event-ID membership in the lifecycle owner's accepted set; then assert normalized semantic DOM output independently. Do not make the full `innerText` of the newest streamed Markdown token—including trailing punctuation—the protocol barrier, because renderers may defer that final character until a later token or finalization pass.

### 5. Verify overlap at multiple layers

Use independent evidence:
- server log or captured request proves reconnect used the deliberately rewound cursor;
- durable journal proves both overlap and gap event IDs exist;
- rendered semantic rows prove prose/reasoning/tool activity is preserved once;
- canonical state and DOM each contain the final exactly once;
- lifecycle-client snapshot is idle and unowned after settlement.

Avoid assuming that `cursor === expectedGapId`: unrelated journaled events may advance the cursor. Prefer membership/semantic assertions for specifically identified gap events.

### 6. Repair stale tests without weakening them

Replace source-shape checks with small executable harnesses that assert:
- request payload values observed at the API boundary;
- optimistic state before and after a controlled deferred response;
- owner-aware cleanup across foreground/background sessions;
- reconnect and replay behavior through the real transport facade;
- ordering through observable state transitions rather than source indices.

If a source check remains temporarily, it must be paired with an executable gate and should guard only a true static invariant.

### 7. Isolate parallel repair work

When one blocked issue contains independent repair classes, parallelize diagnosis without letting agents write the same checkout:

- snapshot the controller-reviewed artifact once;
- give each worker its own copy/worktree and one bounded responsibility (for example lifecycle overlap, harness migration, or clean-baseline classification);
- prohibit unrelated changes and require exact integration instructions/diffs;
- keep baseline classification read-only;
- use a separate integrator/reviewer after workers finish rather than manually interleaving their edits;
- rerun the combined focused, browser, and shard gates after integration—individual branch GREEN does not compose automatically.

This prevents concurrent writes, makes rejection cheap, and keeps stale or speculative repairs out of the controller artifact.

**Multi-blocker delegation rule:** When a single issue number contains three or more independent failure categories (e.g. TLS toolchain, missing filesystem path, library version mismatch), dispatch one subagent per category — not one "fix #N" agent. Each brief should name the exact test node ID, the exact failure message, and the exact env-level fix or probe command. A single broad "fix the env failures" brief will conflate root causes and produce incomplete results; scoped briefs make each agent's work verifiable independently.

### 8. Validate from narrow to broad

Run and retain complete logs for:
1. focused RED/GREEN;
2. immediate neighboring contracts;
3. all lifecycle scenarios;
4. language/lint/static checks;
5. every full shard.

Report exact totals and separate baseline environment failures from implementation regressions. Never claim broad GREEN while changed-path failures remain.

### 9. Controller acceptance over delegated repair batches

When one blocked issue goes through several subagent repair rounds, the controller gate is a decision loop, not a single rerun:

1. **Verify disk state after every batch, including failed ones.** Subagents hit tool-iteration limits and HTTP 429 rate limits mid-task; a "completed" batch may claim partial work, or return no result while still leaving modified files on disk. Run `git status`/`git diff` immediately after each batch — never trust the summary's file list.
2. **Treat file-mutation-verifier warnings as failure signals.** A subagent summary noting "N file(s) were NOT modified this turn" means claimed patches silently failed (hunk mismatch). Re-read the file before editing; do not assume the described change landed.
3. **Expect partial completion and budget rounds.** A single integrator frequently completes the integration but not the verification matrix; the next round finishes migrations but not the ledger. Do not re-delegate the whole task each time — hand the next round the exact remaining delta.
4. **The controller may complete mechanical bits.** When the owner keeps exhausting limits, the controller can finish trivial work (unused-import lint removals, one executable test rewrite) — but must then run the full verification matrix independently before accepting.
5. **Focused + browser GREEN is still not acceptance.** The binding gate is the full CI-shaped shard matrix: focused tests cannot catch production-path defects (event-whitelist alias drift, missing default validators, control retry lockouts, lifecycle listener leaks). Run all three shards; enumerate remaining failures per shard.
6. **Every remaining failure must be classified against the clean baseline.** Only baseline-identical environment defects may remain; changed-path failures must be fixed or proven baseline-identical before exclusion.
7. **A stale TDD ledger is not evidence.** Repair rounds must refresh the ledger with fresh RED artifacts and honest exclusion notes; if they did not, the controller rewrites it from preserved evidence before acceptance.
8. **Prove pre-existing flakes in the isolated worktree.** When a browser gate flakes (e.g. startup race where the gateway never received the request), reproduce it in the pre-integration isolated worktree: if it flakes there too, it is environment/pre-existing, not the change. Record the classification with the rerun that passed.

## Pitfalls

- **Unsupported-scenario failure called a behavior RED:** it only proves harness work is missing.
- **Fixing product code to satisfy source text:** preserves test spelling while risking behavior.
- **Harness stubs only the old dependency:** a facade/owner refactor can result in no transport instance and false failures.
- **Using all journal rows as expected gap IDs:** title, metering, or status events can be appended concurrently. Select rows by the unique payloads under test.
- **Demanding the cursor equal the last selected gap ID:** later legitimate events can advance it.
- **Counting raw activity rows as semantic tool calls:** started/completed events may be two source rows but one rendered tool card.
- **Retrying browser gates to hide startup races:** preserve and classify the failed run; fix synchronization if the failure is in the changed path.
- **Editing tests to search a new helper name:** this is a spelling migration, not behavioral coverage.
- **Non-idempotent fake disposal:** if fake `dispose()` synchronously invokes `onerror` and `onerror` defensively calls `dispose()`, the harness recurses forever. Match the real facade: mark disposed before callbacks and make later disposal a no-op.
- **`void`-wrapped lifecycle handlers are not awaitable from tests:** when production wires `pageshow`/`online` with `void this.handleLifecycleResume()`, `lifecycleTarget.emit('pageshow')` is fire-and-forget. `await Promise.resolve()` drain loops are not a reliable barrier — the handler may make async fetch calls before reconnecting. Call `await client.handleLifecycleResume()` directly as the synchronisation point; validate the listener registration separately with `lifecycleTarget.listeners.get('pageshow')?.length >= 1`.
- **Renderer-throw leaves owner permanently stuck settling:** if `onCanonical` throws after `projectionReplaced=true`, a naive catch that always schedules a retry timer never releases the owner. Fix: branch on `projectionReplaced` in the catch — if already set, call `_disposeGeneration()` immediately instead of retrying. Projection was attempted; the owner must be released regardless of render outcome.
- **Mistaking a declaration for an invocation:** an unbounded source index can find a nested helper declaration instead of the later call. Bound any unavoidable static seam check to the relevant function/phase and pair it with executable helper/facade behavior.
- **Sibling-test imports that break collection:** `from test_run_client import _run` or `from run_client_compat_helpers import ...` can fail pytest collection under the repo's test wrapper when the module is not importable by bare name. Prefer self-contained harnesses per test module, or package-qualified imports the wrapper actually resolves. A collection error is a harness defect, not a behavior RED — verify the module imports before quoting it as a failure.
- **Trusting a subagent completion summary's file list:** a batch that hit tool/rate limits can report partial work or none while files are already modified on disk. `git status`/`git diff` after every batch; re-read files flagged by the mutation verifier before editing.
- **Subagents working on test suites sometimes fix production code.** A TDD subagent commissioned to add tests may discover a product bug while writing the RED scenario and fix it in the same pass — correctly, following the TDD mandate. The controller must always `diff` the production files against the accepted baseline (e.g. `diff issue-74/static/run_client.js issue-75/static/run_client.js`) before accepting. Verify that: (a) the changed identifiers exist in the baseline, (b) the logic matches the scenario's stated bug, (c) no unrelated production code was touched. Only then accept the production change and regenerate the shard gate.
- **Large `node_modules` deletion times out in `execute_code` (300s limit).** `rm -rf node_modules` with 67+ packages exceeds the script timeout. Use `find … -mindepth 1 -maxdepth 1 -exec rm -rf {} +` to delete entries in one shell call, or call `terminal()` directly with a generous `timeout=120`. After clearing entries, the now-empty directory can be `rmdir`'d safely.

## Evidence Checklist

- [ ] Repository instructions and current diff read first.
- [ ] Every failure classified.
- [ ] Fresh behavior RED retained before production change.
- [ ] Harness loads the real ownership abstraction.
- [ ] Async ordering uses explicit barriers.
- [ ] Replay overlap is deliberate and evidenced server-side.
- [ ] Gap events and semantic activity are proven exactly once.
- [ ] Canonical final is exactly once in state and DOM.
- [ ] Final lifecycle snapshot is idle/unowned.
- [ ] Environment-only failures reproduced on a pinned clean baseline.
- [ ] Exact focused and shard totals retained.

## Supporting References

- See `references/executable-js-harness-migration.md` for a concrete Node `vm` recipe covering production-function extraction, parameterized send scenarios, observable ordering ledgers, RunClient-compatible transport facades, one-forwarder-per-event fanout, idempotent terminal-disposal probes, narrowly bounded static seam checks, the Python f-string brace-escaping pitfall when embedding JS preambles, the `void`-wrapped lifecycle handler barrier problem, and **stub-targeted RED log generation** (standalone `gen_red_logs.py` pattern — runs scenario bodies against the stub via subprocess, captures `.artifacts/red-<name>.log`, asserts non-zero return).
- See `references/stream-ownership-refactor.md` for a compact recipe covering lifecycle replay-overlap gates and common harness migrations after transport ownership moves behind a client abstraction.
- See `references/deterministic-replay-overlap-browser-gates.md` for the exact server/browser barrier sequence, opaque-cursor request evidence, accepted-ID protocol barrier, streaming-Markdown punctuation pitfall, semantic parity normalization, and evidence artifact shape.
- See `references/differential-environment-failure-triage.md` for the clean pinned-SHA control workflow, exact-wrapper comparison, skip-versus-fail classification, read-only environment probes, issue-dedup gate, and final evidence checks.
- See `references/controller-acceptance-gate.md` for the multi-round acceptance loop: verify disk state after every delegated batch (rate-limit/tool-limit partial state), budget repair rounds, controller mechanical completion, full-shard acceptance evidence, ledger refresh, and pre-existing-flake proof in isolated worktrees.
- See `references/hermes-webui-test-suite-environment-blockers.md` for the concrete Fox container environment failures: Python 3.13 probe order (use `HERMES_WEBUI_TEST_PYTHON`), missing `/etc/ssh` (fix: `mkdir -p /etc/ssh`), curl 8.14.1 TLS `close_notify` exit 56, and Hermes Agent 0.18.2 missing `_SESSION_UI_SESSION_ID` — including the accepted baseline shard totals for issue #74 and successors.
