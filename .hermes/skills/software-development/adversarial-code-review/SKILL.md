---
name: adversarial-code-review
description: Perform an adversarial, read-only code review of a feature branch or diff against a task brief — money/billing math, idempotency + transactional integrity, test quality (real behavior vs mocked contract), checkpoint/dedupe logic, auth token handling, framework discipline. Produces a Verdict + Critical/High/Medium/Low report with file:line and suggested fixes. Distinct from requesting-code-review (pre-commit self-verification of YOUR changes) and github-code-review (PR inline comments).
---

# Adversarial Code Review

Independent, read-only review of someone else's implementation, usually per a
task brief (e.g. `.hermes/tasks/review-<name>.md`), run under a reviewer
profile. Goal: find real bugs in money/correctness/security paths, verify
claims empirically, and report with concrete file:line findings — NOT style
complaints.

## Workflow (proven order)

1. **Read the brief first, then follow it exactly.** It defines the diff
   scope (`git diff main..HEAD -- <dir>`), the review focus list, the report
   format, and constraints (read-only; you MAY run tests/typecheck; no docker).
   It also lists known pre-existing issues to NOT report — respect that.
2. **Read the spec before the code** (e.g. `docs/*-spec.md`) — it is
   authoritative for business rules and security gates. Then read every source
   file, then the tests. Reading tests last lets you judge whether they assert
   real behavior or mock the contract.
3. **Run the project's checks**: `npm run typecheck` / `npm test` (or
   equivalent). Green tests + clean typecheck is baseline evidence; note it in
   the report.
4. **Verify suspicious behaviors empirically before reporting.** If a finding
   depends on a library/DB semantic, probe it with a throwaway script (node
   `-e`, python, or a vitest one-off). Example: better-sqlite3's
   `lastInsertRowid` behavior on `INSERT ... ON CONFLICT DO UPDATE` — a 5-line
   probe settled whether a customer-id bug existed. Never assert a bug from
   code-reading alone when a 30-second probe can confirm or kill it.
   For full-stack (Next.js) reviews, green unit tests + typecheck are NOT
   sufficient evidence — see the server/client boundary pitfall below; a fresh
   `next build` (mirrors CI's build job) is the definitive gate.
5. **Report**: Verdict + findings grouped Critical/High/Medium/Low, each with
   absolute file:line, the issue, and a suggested fix. No style complaints
   unless they mask a bug. Severity calibration: money-losing paths that are
   silent/unrecoverable are High, not Medium; a bug that breaks the core
   product loop is High even if rare.

## Focus checklist (from the canonical billing review brief)

- **Money/credit math**: unit_amount vs credits consistency, rounding
  direction (ceil vs floor), markup conversion round-trips (charge 2× cost →
  enforcement budget = credits × cost/markup), float drift in REAL columns,
  package table validated at startup.
- **Webhook idempotency + transactional integrity**: pending→completed
  transitions inside a transaction; guarded re-read (status check) so
  concurrent/replayed deliveries can't double-credit; every upstream call
  (team/key/email/budget) guarded by a DB flag so Stripe retries converge
  stepwise; what happens on crash BETWEEN external call and DB write. Also
  check replay-after-delete resurrection (INSERT OR IGNORE re-inserts removed
  rows; tombstone them) and UI success banners that claim async webhook work
  is done — reference patterns 13–14.
- **Test quality**: do tests assert DB state + call arguments, or just mock
  the contract (tautologies)? Real signature verification (Stripe
  `generateTestHeaderString` on a real SDK instance) beats hand-rolled
  payloads. Look for missing tests that would have caught your findings.
- **Metering**: checkpoint/overlap window, dedupe key (request_id UNIQUE),
  cache-hit rows → 0 credits, partial-failure safety (batch transaction,
  budget-mirror failure retry), unbounded queries / re-scan windows.
- **Auth**: token storage (hash-only), constant-time compare, one-time use
  (guarded UPDATE), TTL handling, rate-limit keying, and — surprisingly easy
  to miss — **framework default request logging leaking tokens via query
  strings**.
- **Framework discipline**: plugin encapsulation, route schemas, raw-body
  handling, fail-closed signature verification. Only flag when it masks a bug.

## Pitfall: the brief's diff scope may miss the actual feature — check `git status` first

Review briefs often say `git diff main..HEAD -- <dir>`, but feature work
frequently sits UNCOMMITTED in the worktree (last-minute fixes, untracked
test files). `git diff main...HEAD` then shows the base bridge, not the
feature under review. Before reading anything: `git status` + `git diff
--stat` (committed AND working-tree) to locate where the feature actually
lives. Review both, and state in the report that the feature is in the
working tree. Also check untracked test files: they may run in the passing
suite but need `git add` before merge — a merge risk worth reporting to the
parent.

## Pitfall: green tests + typecheck ≠ buildable — verify Next.js server/client boundaries with a real build

Unit tests mock server-only modules (`next/headers`, cookie helpers, SDK
clients), so a `"use client"` component importing them compiles under vitest
and `tsc --noEmit` — but `next build` fails ("You're importing a module that
depends on 'next/headers'...") and the route 500s in dev. This class of bug
passes a fully green suite AND CI's lint/typecheck/test jobs; only the `build`
job (or a dev-server route hit) catches it. When the diff adds client
components that import cookie/auth/SDK helpers:

1. `next dev -p <port>` + GET every new route → any 500 with an import trace
   pointing at a client component is the guilty boundary. Read the trace's
   last client-component hop.
2. Fresh `next build` is the definitive verdict (mirrors CI). An existing
   `.next` dir with a `BUILD_ID` is NOT proof of a valid build — `next start`
   may refuse it; rebuild.
3. Fix pattern: never hand server-only functions to client components — move
   the work behind a server action returning a serializable result.
4. Audit e2e route coverage: routes no spec visits are where build breaks
   hide (e.g. a payment `return_url` visited by no structural spec).
5. `git status` after pnpm runs — some invocations dirty `pnpm-lock.yaml`;
   restore before finishing (read-only constraint).

Full recipe, error transcript, and companion checks (dead-export grep for
tested-but-unused helpers, stale test comments, money-unit scan):
`references/nextjs-client-server-boundary-review.md`.

## Pitfall: tool output may redact secret-looking strings — verify by hash, not by reading

Read/terminal output layers can rewrite strings that look like secrets
(`apiKey: <value>`, `sk_test_...`, `key_value`) — valid code can appear
corrupted (e.g. a line displayed as `apiKey: afterK...ue,` or `apiKey: ***`
that is actually `apiKey: afterKey.key_value,`). **Never report a syntax
error / corrupted-file finding from displayed output alone.** Verify the true
bytes locally:

```bash
python3 -c "
import hashlib
line = open('src/webhook.ts','rb').read().decode('utf-8').split('\n')[121]
good = '      apiKey: afterKey.key_value,'
print(hashlib.sha256(line.encode()).hexdigest() == hashlib.sha256(good.encode()).hexdigest())
"
```

Matching digest ⇒ file is fine, it's display redaction. Also confirm with
`git show HEAD:<path>` — a hash match between working tree and blob settles
whether a committed file is genuinely broken.

## LiteLLM / inference-observability review checklist

For gateway changes that add custom callbacks, provider telemetry, fallback claims, or benchmark tools, perform these checks in addition to the normal workflow:

1. **Use the exact pinned LiteLLM version.** Import the installed/pinned package and inspect callback signatures plus the relevant router/proxy source. Do not accept tests run against an unspecified LiteLLM version as compatibility proof.
2. **Trace event boundaries, not comments.** Establish whether a proxy hook is called once per client request, once per LiteLLM call, or once per underlying HTTP retry. Client-library retries can be invisible to LiteLLM callbacks; never call callback events “every upstream attempt” without an end-to-end instrumented proof.
3. **Treat callback metadata as tainted until proven server-owned.** An allowlisted JSON schema is insufficient when fields such as model group, fallback chain, deployment, API base, or labels are copied from request metadata. Probe sensitive-looking text through each metadata path and confirm durable outputs contain none of it. Validate values against configured server-side aliases or derive them from trusted routing state.
4. **Test the actual retry configuration.** A synthetic router test with different `num_retries` or `max_retries` does not prove production policy. Count local mock-server requests using the exact configured Router and provider-client retry settings; verify both retry count and fallback result.
5. **Check metric semantics against available context.** If durable records deliberately omit request IDs for privacy, a per-provider failed callback cannot by itself establish a client-visible final failure after fallback. Flag rates named `final_failure`, `fallback_success`, or primary-vs-fallback when their correlation/fallback index is not emitted by the pinned framework. Direct callback unit tests that manually supply those values do not prove production availability.
6. **Audit the image delivery path.** When a Dockerfile copies callback modules, verify Compose/deploy scripts build or select a newly versioned image containing them. An `image:`-only Compose service and a deploy script that only starts that image do not deliver new source. Safely run image/config validation when available; otherwise report that boundary as unverified.
7. **Benchmark safety must be fail-closed.** Test `--budget 0`, exact-limit, negative-budget rejection, and gateway mode. Avoid truthiness checks for numeric caps; after alias translation, retain a valid cost mapping or explicitly reject unsupported gateway budgeting.

## Report format

```
## Verdict: approve | approve-with-fixes | needs-work
### Critical / High / Medium / Low
- <abs path>:<line> — <issue> — <suggested fix>
```

Also summarize verification performed (typecheck/tests/probes) and test
quality (what's genuinely asserted, which gaps would have caught the
findings). Use absolute paths per the brief.

## References

- `references/money-billing-review-patterns.md` — reusable bug-pattern
  checklist for money/billing systems (crash windows, stale enforcement
  mirrors, key-vs-team budgets, reveal-once interactions, log leaks,
  replay-resurrection, migration backfill gating, execution-model
  calibration).
- `references/nextjs-client-server-boundary-review.md` — Next.js/full-stack
  review recipe: dev-server route probe + fresh `next build` as the definitive
  gate, `next/headers` import-trace reading, server-action fix pattern, e2e
  route-coverage audit, dead-export grep, stale test-comment check, money-unit
  scan for major-units platforms.
