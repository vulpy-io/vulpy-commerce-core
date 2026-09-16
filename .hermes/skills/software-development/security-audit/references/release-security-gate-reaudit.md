# Release security gate re-audit workflow

Use this when issue labels/comments claim security fixes are complete but the release tree may differ from the working tree.

1. Capture the exact target SHA, worktree, and release ref before reviewing. Separate local-only, uncommitted, and released changes.
2. Inspect the live source and actual route registration, not only helper functions or issue text. For middleware/security gates, verify every HTTP method that can return sensitive data, including mutation responses.
3. Run the focused regression tests from the target worktree. If a test file is absent, a package test command cannot load it, or the harness resolves the wrong root, report that as an evidence gap and correct the invocation before judging the fix.
4. For secret hardening, trace every sensitive value from development input through installer/deploy generation to runtime. A boot-time fail-closed guard does not prove the deploy artifact cannot propagate a weak value.
5. For approval/HMAC controls, test the full client-to-server wire contract: exact signed fields, request identity/nonce binding, first acceptance, duplicate rejection, and a distinct request with the same operation. Helper-level signature tests are insufficient.
6. Classify each issue independently as CLOSED, PARTIAL, OPEN, or SUPERSEDED. Never bulk-close a family because one shared helper changed.
7. Treat `pnpm audit` findings separately from exploitable release-path findings: report counts and reachable direct dependencies, but do not call the audit clean when it is non-zero.
8. A release verdict requires fresh source, diff, test, and (where applicable) runtime evidence. A coder's exit code, issue label, or summary is not evidence.

Known failure pattern: a broad security patch can pass 47 Python tests and storefront typecheck while still leaving a high-severity cart mutation route uncovered or deploy generation copying weak secrets. The independent reviewer must re-run those exact paths.
