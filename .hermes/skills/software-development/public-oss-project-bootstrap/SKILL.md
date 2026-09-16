---
name: public-oss-project-bootstrap
description: Bootstrap an empty public open-source repository with contracts, strict vertical TDD evidence, governance/security boundaries, CI gates, and deterministic release artifacts. Use for issue-driven greenfield OSS foundations, especially public/private clean-room splits and schema-first projects.
version: 1.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [open-source, bootstrap, tdd, contracts, supply-chain, reproducible-builds]
---

# Public OSS Project Bootstrap

Build an empty public repository into a reviewable source of truth without importing private history or prematurely implementing later feature issues.

## Core rule

Treat the issue as a sequence of **vertical contracts**, not a horizontal scaffold dump. For every behavior:

1. Write one deliberately failing executable test.
2. Run only that test and capture command, exit code, failing assertion/error, and totals.
3. Confirm the failure is caused by missing behavior, not a typo or broken harness.
4. Add the smallest implementation that makes it pass.
5. Run the targeted GREEN test, then the accumulated suite.
6. Refactor only while green.
7. Immediately append concise genuine evidence to the TDD ledger.

Do not defer ledger transcription until the end: long bootstrap sessions can hit execution/tool limits, leaving real output stranded in transient logs.

## Workflow

### 1. Establish authoritative scope and identity

Before any public side effect, lock five facts in a reviewed artifact:

1. the exact product noun and one-sentence artifact;
2. host/core versus public-project ownership;
3. explicit adjacent non-goals;
4. proposed repository/package identity;
5. release posture: opt-in/default-on, disable, and rollback.

Then:

- Read the public issue directly before using planning summaries.
- Inspect upstream manifest/schema/gallery contracts from public sources.
- Record explicit non-goals and ownership boundaries.
- Obtain explicit authorization for repository creation and its final name; an empty public repository and its first issue are release-facing side effects, not harmless scaffolding.
- Preflight the permissions needed for both creation and cleanup before acting. Do not create first and discover that the current credential cannot delete or transfer later.
- Confirm the target repository is empty and clone it into the requested isolated path.
- Never copy source, fixtures, history, URLs, aliases, or configuration from private worktrees. Reimplement only the generic public contract.

A correction to the product noun is a hard stop. Cancel the obsolete track, quarantine already-dispatched output when it returns, rewrite contaminated plans/issues from the corrected boundary, and ask whether a mistakenly named public repository should be deleted, renamed, or reused. Never silently salvage or publish stale output because some files look generic.

See `references/public-scope-and-side-effect-gate.md` for a concise preflight, correction, and stale-delegation containment checklist.

### 2. Pin tooling before dependency installation

Document exact runtime and package-manager versions in machine-readable files and CI. Pin direct dependencies exactly and commit one lockfile. Explain why each public dependency is needed.

Use built-in language test runners for the first tracer when practical; this allows a genuine RED before package installation or implementation exists.

### 3. Start with the smallest tracer

Create the ledger first, then one test for a single required contract/build artifact. Run RED while the repository is still intentionally empty. Implement only enough contract metadata/schema to reach GREEN.

Do not let a single bootstrap tracer implicitly authorize all later skeleton files. Add a separate failing structure/ownership test before adding required app/package/governance boundaries.

### 4. Contract-by-contract slices

Recommended order:

1. Valid/invalid browser configuration and stable errors.
2. Safe projection fixtures and forbidden privacy fields.
3. Rich envelope compatibility: unknown additive fields, unsupported schema fallback.
4. Encoded-size, nesting-depth, string, array, and URL limits.
5. Schema-to-type generation and drift detection.
6. Public/private boundary and secret/PII scans.
7. Gallery dual-manifest consistency and local asset validation.
8. Clean-room install/build/test.
9. Deterministic archive contents and checksum reproducibility.

Tests should assert stable public codes rather than validator-library wording. Unknown additive fields may validate but must not become automatically displayed, persisted, logged, or forwarded fields.

### 5. Keep skeletons skeletal

A bootstrap may define interfaces, package ownership, inert assets, and optional-component descriptors. It must not sneak in behavior owned by later issues: no actions, cards, endpoints, host hooks, mutation paths, transport owners, telemetry, or distribution-specific packaging.

Optional services must start nowhere by default and expose no endpoints until endpoint-by-endpoint TDD begins.

### 6. Public/private and fixture safety

Scan source, manifests, config, and fixtures for:

- private package imports and private repository URLs;
- internal service aliases and non-public origins;
- credentials and credential-shaped values;
- broad environment ingestion;
- customer PII and copied production payloads;
- symlinks/unsafe archive paths;
- competing chat-stream or control ownership;
- undeclared external network/runtime-code loading.

Adversarial invalid fixtures may intentionally contain blocked field names or synthetic reserved-domain data. Maintain an explicit narrow allowlist for those files; do not exempt the whole fixture tree.

### 7. Reproducible archives

Use an explicit release allowlist rather than archiving the repository wholesale. Normalize member order, timestamps, ownership, numeric IDs, permissions where needed, archive format, and gzip metadata. Build twice from equivalent clean inputs, compare bytes, compare SHA-256, and list members. Archive-content tests should care about the allowed set; avoid asserting arbitrary display order unless order itself is part of the contract.

### 8. Final verification matrix

Run and preserve genuine output for:

- package tests and totals;
- lint and typecheck;
- schema lint/type drift;
- build;
- gallery validation;
- secret/private-boundary scan;
- dependency and license audit;
- clean-room frozen-lockfile install/build/test;
- archive member allowlist;
- two-build byte comparison and checksum;
- `git diff --check`, status, and diff summary.

Never report a gate as passed because its script exists. A pass requires actual exit-zero output from the final tree.

## Iteration-budget discipline

Large bootstraps are vulnerable to running out of tool iterations. Keep work vertical and batch only independent writes/reads. After each GREEN:

- update the ledger immediately;
- mark the task state;
- avoid creating broad documentation before executable gates are complete;
- reserve the final phase for rerunning every gate from the final tree.

If interrupted, report precisely which gates have genuine output and which remain unverified—never promote an earlier partial GREEN to a final gate.

## GitHub-side boundaries

Repository files can document required review policy, but branch protection, private vulnerability reporting, required checks, tags, releases, and issue ownership are live GitHub settings/actions. Verify and configure them separately when explicitly authorized; do not claim they exist merely because governance docs mention them.

## Reference

See `references/contract-first-bootstrap-example.md` for a condensed example of useful RED/GREEN evidence, manifest alignment, scanner exceptions, and deterministic archive normalization.
