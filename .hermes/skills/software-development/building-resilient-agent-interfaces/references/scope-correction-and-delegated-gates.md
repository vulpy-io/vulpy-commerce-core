# Scope Correction and Delegated Delivery Gates

Use this when a multi-agent UI/extension project changes scope after planning or delegation has begun.

## Pre-side-effect scope lock

Before creating a public repository, filing public issues, or dispatching implementation agents, record and verify:

1. **Artifact:** one sentence naming exactly what is being built.
2. **Boundary:** host/core responsibilities versus extension responsibilities.
3. **Explicit exclusions:** adjacent features that must not enter schemas, fixtures, names, screenshots, or release copy.
4. **Identity:** proposed repository/package/extension name.
5. **Delivery:** public/private ownership, default-on versus opt-in, disable, and rollback.

Treat repository creation and public issue filing as release-facing side effects, not harmless setup. If the user's wording corrects the product noun (for example, “messages component replacement only”), stop and re-lock scope before any more side effects.

## Correcting contaminated work

- Rewrite a deeply contaminated architecture plan from the product boundary outward; do not preserve a wrong issue decomposition merely to save text.
- Cancel the obsolete controller todo, but remember that cancelling a todo does **not** cancel an already-dispatched asynchronous agent. Mark its eventual output stale and reject it explicitly.
- Quarantine stale output in its isolated checkout. Do not cherry-pick “generic-looking” code until it is independently shown to satisfy the corrected artifact and contracts.
- Do not silently repurpose a mistakenly named public repository. Ask for delete/rename/reuse, recommend one, and execute the user's decision when permissions allow.
- If cleanup is blocked by credentials or permissions, record the blocker in the existing project tracker and keep the artifact out of the dependency graph.

## Rebaseline sequence

1. Produce corrected, ready-to-apply child issue bodies from the accepted plan.
2. Verify prohibited-scope terms occur only in explicit correction/non-goal sections.
3. Update prerequisite children first and the parent epic last, so the parent references the corrected children.
4. Read back live titles/bodies and verify required TDD gates survived; a successful edit command alone is not proof.
5. Add a controller comment to any blocked implementation issue with reproduced findings and the required new RED tests.

## Delegated TDD controller gate

A subagent's focused GREEN is a candidate, not acceptance.

- Independently inspect the diff and rerun focused behavior.
- Commission separate implementation and test-evidence reviewers where state ownership or recovery is involved.
- Trace exact production options and paths; standalone unit defaults do not prove shipped behavior.
- Reject batch REDs caused only by a missing module as evidence for later behavioral slices.
- Convert every reproduced review finding into a fresh semantic RED before fixes.
- Preserve full-suite/shard logs before focused reruns can clear last-failure caches.
- Do not advance dependent issues while a prerequisite is blocked, even if a narrow browser scenario is green.

### Verifying RED runs against the intended baseline

**Critical pitfall:** Before accepting a subagent's claimed RED logs, verify the test harness actually loads the right code. A completion agent may claim "ran RED against the stub" but if the test file hardcodes `MODULE = ROOT / "static" / "run_client.js"` and the `RUN_CLIENT_PATH` env var is never read by conftest or the test file, every "stub run" silently ran against production. Signs of this:

1. The stub run unexpectedly passes on complex multi-step tests that should obviously fail.
2. `grep -n 'RUN_CLIENT_PATH' tests/conftest.py test_file.py scripts/test.sh` returns empty.
3. The test builds the script path via a Python constant, not via an env var or fixture.

**Action:** Before accepting RED evidence, grep the conftest and test file for the env var or fixture mechanism that switches the module under test. If it isn't wired, the RED run is invalid. Record this in the ledger as "RED not verifiable; harness wires only production code" and classify the test as a regression guard rather than a TDD-RED scenario.

### Ledger classification for late-added tests

When a completion agent adds tests after the fix is already in place, the TDD ledger must distinguish:

- **TDD RED→GREEN:** test was written, run to RED, then fixed. Has a real RED log.
- **Regression guard:** test added after the fix, verifies existing behavior, no pre-fix RED possible. Mark this column explicitly — do not leave it blank or fabricate a RED log.

An honest ledger with clearly marked regression guards is better than a fabricated TDD story.

## Status reporting

Report three things plainly: accepted gates, blocked gates with evidence, and what work is prohibited from advancing. Avoid implying that delegation completion equals implementation acceptance.
