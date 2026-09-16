# Differential environment-only failure triage

Use this recipe when a full suite, CI image, container, or modified artifact reports failures that may not belong to the change under review.

## Establish a clean control

1. Record the modified tree's exact `HEAD` and porcelain status.
2. Create a separate detached worktree at that same SHA; never reset or clean the artifact under review.
3. Verify the control starts Git-clean.
4. Store evidence outside both product trees when practical.

## Hold execution constant

Run the exact same command in both trees with:

- the repository's supported test wrapper rather than a bare runner;
- the same explicitly selected interpreter/runtime;
- identical arguments, exact parameterized node IDs, verbosity, and timeouts;
- isolated state/home directories when test discovery could reach live user state.

Capture the literal command, combined stdout/stderr, and actual runner exit code. If output is piped through `tee`, preserve `PIPESTATUS[0]`; otherwise the evidence may report `tee`'s success instead of the test runner's failure.

## Compare before theorizing

Classify every target as pass, fail, error, xfail, or skip. A skipped integration test is missing coverage, not successful verification.

When control and artifact match:

1. verify relevant tests and implementation files have no diff;
2. rerun each unexpected target alone;
3. investigate environment and isolation assumptions only after those checks.

When only the artifact fails, trace changed files and transitive inputs before labeling the result environmental.

## Minimal read-only probes

Test ranked hypotheses without editing product/test code:

- **Executable behavior:** capture version, features/protocols, and a tiny standalone invocation. Tests often suppress the diagnostic stderr that reveals the cause.
- **Filesystem assumptions:** inspect existence, type, and permissions; check whether validation order makes the expected message depend on host layout.
- **Import provenance:** record module `__file__`, distribution version, `sys.path`, optional dependency availability, and required symbols. Separate source absence, dependency-blocked import, and source/runtime contract mismatch.
- **Isolation/order:** compare the exact node alone with the focused group. The same isolated failure rules out suite ordering as the primary cause.
- **Transport edge cases:** retain both response body and process exit status. Partial valid output plus a nonzero transport result indicates a fixture/toolchain interaction; it is not automatically a pass.

Do not install dependencies or mutate fixtures merely to make classification green. If an environment change is needed to falsify a hypothesis, use a disposable environment and label that evidence separately.

## Stable blocker and issue gate

Before filing an issue:

1. Search existing public/private issues with several narrow queries.
2. Read the most likely match fully.
3. Distinguish related but non-overlapping blockers.
4. File only for a deterministic product/test-image contract problem.

Include root cause, impact, fix options, acceptance criteria, exact command, pinned SHA, control-versus-artifact totals, and secret-safe evidence. Prefer repairing the fixture/image compatibility contract over weakening production behavior to tolerate a synthetic test fixture.

## Final verification

- Baseline remains Git-clean.
- Artifact's pre-existing tracked and untracked diff is unchanged.
- Any issue created is read back and verified by number, title, state, and URL.
- Evidence location is reported.
- Prohibited actions not taken are stated explicitly, such as no product/test edits, commits, pushes, or edits to the issue under review.
